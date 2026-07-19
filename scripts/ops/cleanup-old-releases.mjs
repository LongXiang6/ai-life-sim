#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_RELEASE_ROOT = '/root/ai-life-sim-releases'
const DEFAULT_ACTIVE_LINK = '/root/ai-life-sim'
const DEFAULT_MIN_AGE_HOURS = 72
const DEFAULT_HEALTH_URL = 'http://127.0.0.1:3000/'
const HEALTH_TIMEOUT_MS = 10_000

function printHelp() {
  console.log(`Usage: node scripts/ops/cleanup-old-releases.mjs [options]

Options:
  --root <path>             Immutable release root (default: ${DEFAULT_RELEASE_ROOT})
  --active <path>           Active release symlink (default: ${DEFAULT_ACTIVE_LINK})
  --min-age-hours <hours>   Active soak and inactive release age (default: ${DEFAULT_MIN_AGE_HOURS})
  --health-url <url>        Local health probe (default: ${DEFAULT_HEALTH_URL})
  --execute                 Delete eligible inactive releases; otherwise dry-run
  --help                    Show this help

Deletion starts only after the active symlink has remained unchanged for the full soak window.
The active target is never eligible, and execution also requires a successful local health probe.`)
}

function parsePositiveNumber(raw, label) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
  return value
}

export function parseArgs(argv) {
  const options = {
    releaseRoot: DEFAULT_RELEASE_ROOT,
    activeLink: DEFAULT_ACTIVE_LINK,
    minAgeHours: DEFAULT_MIN_AGE_HOURS,
    healthUrl: DEFAULT_HEALTH_URL,
    execute: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') return { ...options, help: true }
    if (arg === '--execute') {
      options.execute = true
      continue
    }
    const value = argv[index + 1]
    if (!value) throw new Error(`${arg} requires a value`)
    if (arg === '--root') options.releaseRoot = value
    else if (arg === '--active') options.activeLink = value
    else if (arg === '--min-age-hours') options.minAgeHours = parsePositiveNumber(value, arg)
    else if (arg === '--health-url') options.healthUrl = value
    else throw new Error(`Unknown option: ${arg}`)
    index += 1
  }

  return options
}

function isDirectChild(rootPath, targetPath) {
  return path.dirname(targetPath) === rootPath && targetPath !== rootPath
}

export async function buildCleanupPlan({
  releaseRoot,
  activeLink,
  minAgeHours,
  nowMs = Date.now(),
  activeActivatedAtMs,
}) {
  const rootPath = await fs.realpath(path.resolve(releaseRoot))
  const linkPath = path.resolve(activeLink)
  const linkStat = await fs.lstat(linkPath)
  if (!linkStat.isSymbolicLink()) {
    throw new Error(`Active path must be a symlink: ${linkPath}`)
  }

  const activePath = await fs.realpath(linkPath)
  if (!isDirectChild(rootPath, activePath)) {
    throw new Error(`Active release must be a direct child of ${rootPath}: ${activePath}`)
  }

  const minAgeMs = minAgeHours * HOUR_MS
  const activatedAtMs = activeActivatedAtMs ?? linkStat.mtimeMs
  const activeAgeMs = Math.max(0, nowMs - activatedAtMs)
  if (activeAgeMs < minAgeMs) {
    return {
      rootPath,
      activePath,
      activeAgeHours: activeAgeMs / HOUR_MS,
      minAgeHours,
      candidates: [],
      skippedReason: 'active-soak-incomplete',
    }
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true })
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidatePath = path.join(rootPath, entry.name)
    const realCandidatePath = await fs.realpath(candidatePath)
    if (!isDirectChild(rootPath, realCandidatePath) || realCandidatePath === activePath) continue
    const stat = await fs.stat(realCandidatePath)
    const ageMs = Math.max(0, nowMs - stat.mtimeMs)
    if (ageMs < minAgeMs) continue
    candidates.push({
      name: entry.name,
      path: realCandidatePath,
      ageHours: ageMs / HOUR_MS,
    })
  }

  candidates.sort((left, right) => right.ageHours - left.ageHours || left.name.localeCompare(right.name))
  return {
    rootPath,
    activePath,
    activeAgeHours: activeAgeMs / HOUR_MS,
    minAgeHours,
    candidates,
    skippedReason: candidates.length === 0 ? 'no-eligible-releases' : null,
  }
}

function validateLocalHealthUrl(rawUrl) {
  const url = new URL(rawUrl)
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (url.protocol !== 'http:' || !allowedHosts.has(url.hostname)) {
    throw new Error(`Health URL must use local HTTP: ${rawUrl}`)
  }
  return url
}

export async function checkLocalHealth(rawUrl, fetchImpl = fetch) {
  const url = validateLocalHealthUrl(rawUrl)
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  })
  await response.body?.cancel().catch(() => undefined)
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`Local health probe returned HTTP ${response.status}`)
  }
  return response.status
}

export async function removePlannedReleases(plan) {
  const removed = []
  for (const candidate of plan.candidates) {
    const candidatePath = await fs.realpath(candidate.path)
    if (!isDirectChild(plan.rootPath, candidatePath)) {
      throw new Error(`Refusing to remove path outside release root: ${candidatePath}`)
    }
    if (candidatePath === plan.activePath) {
      throw new Error(`Refusing to remove active release: ${candidatePath}`)
    }
    const stat = await fs.lstat(candidatePath)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Refusing to remove non-directory release: ${candidatePath}`)
    }
    await fs.rm(candidatePath, { recursive: true, force: false })
    removed.push(candidatePath)
  }
  return removed
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const plan = await buildCleanupPlan(options)
  console.log(JSON.stringify({
    event: 'release-cleanup-plan',
    mode: options.execute ? 'execute' : 'dry-run',
    activePath: plan.activePath,
    activeAgeHours: Number(plan.activeAgeHours.toFixed(1)),
    minAgeHours: plan.minAgeHours,
    candidates: plan.candidates.map((candidate) => ({
      path: candidate.path,
      ageHours: Number(candidate.ageHours.toFixed(1)),
    })),
    skippedReason: plan.skippedReason,
  }))

  if (!options.execute || plan.candidates.length === 0) return
  const healthStatus = await checkLocalHealth(options.healthUrl)
  const removed = await removePlannedReleases(plan)
  console.log(JSON.stringify({
    event: 'release-cleanup-complete',
    healthStatus,
    removed,
  }))
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  main().catch((error) => {
    console.error(`[release-cleanup] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
