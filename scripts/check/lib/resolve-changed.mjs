/**
 * @module resolve-changed.mjs
 * @description 根据变更文件路径推断应运行的检测域（含 ATCE 结构性叠加）
 */

import { execSync } from 'node:child_process'
import { DOMAINS } from '../domains.mjs'

/** 触及这些路径时强制叠加 wiring + loader */
const STRUCTURAL_OVERLAY = [
  'src/mods/',
  'src/core/',
  'src/foundation/',
  'scripts/check/rules/architecture-rules',
  'scripts/check/rules/',
  'scripts/check/domains/structural/scan-typescript',
  'scripts/check/domains/structural/scan-file-import',
  'scripts/codegen/generate-mod-wiring',
  'subsystems/',
  'manifest.ts',
  'world-init',
]

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function getChangedFiles(projectRoot) {
  const cmds = [
    'git diff --name-only HEAD',
    'git diff --name-only --cached',
    'git ls-files --others --exclude-standard',
  ]
  const files = new Set()
  for (const cmd of cmds) {
    try {
      const out = execSync(cmd, { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
      for (const line of out.split(/\r?\n/)) {
        const t = line.trim().replace(/\\/g, '/')
        if (t) files.add(t)
      }
    } catch {
      // 非 git 仓库或命令失败时忽略
    }
  }
  return [...files]
}

/**
 * @param {string} filePath
 * @param {string[]} triggers
 */
function matchesTrigger(filePath, triggers) {
  const p = filePath.replace(/\\/g, '/')
  for (const t of triggers) {
    if (t.endsWith('*')) {
      if (p.startsWith(t.slice(0, -1))) return true
    } else if (t.startsWith('*')) {
      if (p.endsWith(t.slice(1))) return true
    } else if (p.includes(t)) {
      return true
    }
  }
  return false
}

function orderDomainIds(ids) {
  const requested = new Set(ids)
  return Object.keys(DOMAINS).filter((id) => requested.has(id))
}

/**
 * @param {string[]} files
 * @returns {boolean}
 */
function needsStructuralOverlay(files) {
  return files.some((f) => {
    const p = f.replace(/\\/g, '/')
    return STRUCTURAL_OVERLAY.some((s) => p.includes(s))
  })
}

/**
 * @param {string[]} files relative paths
 * @returns {string[]} domain ids
 */
export function resolveDomainsFromFiles(files) {
  const set = new Set()
  for (const file of files) {
    for (const [id, domain] of Object.entries(DOMAINS)) {
      if (domain.triggers?.some((t) => matchesTrigger(file, t))) {
        set.add(id)
      }
    }
  }
  if (needsStructuralOverlay(files)) {
    set.add('wiring')
    set.add('loader')
  }
  if (set.size === 0) set.add('wiring')
  set.add('standardization')
  return orderDomainIds(set)
}

/**
 * @param {string[]} files
 * @param {string[]} domainIds
 * @returns {Record<string, string[]>}
 */
export function resolveStepIdsFromFiles(files, domainIds = resolveDomainsFromFiles(files)) {
  const selected = {}
  for (const domainId of domainIds) {
    const domain = DOMAINS[domainId]
    if (!domain) continue
    const stepIds = new Set()
    for (const step of domain.steps) {
      if (step.critical) stepIds.add(step.id)
      if (step.triggers?.some((trigger) => files.some((file) => matchesTrigger(file, [trigger])))) {
        stepIds.add(step.id)
      }
    }
    selected[domainId] = domain.steps
      .filter((step) => stepIds.has(step.id))
      .sort((left, right) => left.order - right.order || (left.id < right.id ? -1 : 1))
      .map((step) => step.id)
  }
  return selected
}

/**
 * @param {string[]} files
 */
export function resolveCheckSelectionFromFiles(files) {
  const domainIds = resolveDomainsFromFiles(files)
  return {
    domainIds,
    stepIdsByDomain: resolveStepIdsFromFiles(files, domainIds),
  }
}

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function resolveDomainsFromGit(projectRoot) {
  return resolveDomainsFromFiles(getChangedFiles(projectRoot))
}

/**
 * @param {string} projectRoot
 */
export function resolveCheckSelectionFromGit(projectRoot) {
  return resolveCheckSelectionFromFiles(getChangedFiles(projectRoot))
}
