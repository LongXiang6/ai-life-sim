#!/usr/bin/env node
/**
 * Purpose: Run the production release gate through one explicit concurrent execution graph.
 * Owner: quality:infrastructure
 * Responsibility: Gate-level scheduling, deadlines, deterministic status aggregation, and terminal output only.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import { cleanupOldReports } from './lib/cleanup-reports.mjs'
import { classifyStepProcessResult } from './lib/runner.mjs'

const checkDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(checkDir, '..', '..')
const isWin = process.platform === 'win32'
const quick = process.argv.includes('--quick')
const verbose = process.argv.includes('--verbose')
const quiet = !verbose
const errorOnly = process.argv.includes('--error-only') || quiet

function resolveInvocation(cmd, args) {
  if (!isWin || (cmd !== 'npm' && cmd !== 'npx')) return { command: cmd, args }
  const cliName = cmd === 'npm' ? 'npm-cli.js' : 'npx-cli.js'
  const cliPath = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', cliName)
  return { command: process.execPath, args: [cliPath, ...args] }
}

function spawnAsync(nodeId, cmd, args, options = {}) {
  return new Promise((resolve) => {
    const invocation = resolveInvocation(cmd, args)
    const startedAt = performance.now()
    const child = spawn(invocation.command, invocation.args, {
      cwd: projectRoot,
      stdio: 'pipe',
      ...options,
    })
    let stdout = ''
    let stderr = ''
    let finished = false
    let timedOut = false

    function finish(raw) {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      const classification = classifyStepProcessResult({ ...raw, timedOut })
      resolve({
        nodeId,
        ...classification,
        code: Number.isInteger(raw.status) ? raw.status : null,
        signal: raw.signal ?? null,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - startedAt),
      })
    }

    const timeout = setTimeout(() => {
      timedOut = true
      if (isWin && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else {
        child.kill('SIGTERM')
      }
    }, options.timeoutMs ?? 120_000)

    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })
    child.on('error', (error) => finish({ status: null, signal: null, error: error.message }))
    child.on('close', (status, signal) => finish({ status, signal }))
  })
}

function printPhase(phase, statusCode, resultCode, evidence = '') {
  console.log(`[gate-check:${phase}] status=${statusCode} result=${resultCode}${evidence ? ` evidence=${evidence}` : ''}`)
}

function printStepResult(result) {
  const output = `${result.stdout}${result.stderr}`.trim()
  const line = `[gate-check:${result.nodeId}] status=${result.statusCode} result=${result.resultCode} durationMs=${result.durationMs}`
  if (result.statusCode === 'succeeded') {
    console.log(line)
    if (!quiet && output) console.log(output)
  } else {
    if (output) process.stderr.write(`${output}\n`)
    console.error(line)
  }
}

function printErrorSummary(sinceMs) {
  const reportsDir = join(projectRoot, 'reports')
  if (!fs.existsSync(reportsDir)) return
  const runFiles = fs.readdirSync(reportsDir)
    .filter((file) => file.startsWith('check-run-') && file.endsWith('.json'))
    .map((file) => ({ file, modifiedAt: fs.statSync(join(reportsDir, file)).mtimeMs }))
    .filter((file) => file.modifiedAt >= sinceMs)
    .sort((left, right) => right.modifiedAt - left.modifiedAt || (left.file < right.file ? -1 : 1))
  if (runFiles.length > 0) console.log(`\n[gate-check] 报告: reports/${runFiles[0].file}`)

  const files = fs.readdirSync(reportsDir)
    .filter((file) => file.startsWith('checker-') && file.endsWith('.json'))
    .map((file) => ({ file, modifiedAt: fs.statSync(join(reportsDir, file)).mtimeMs }))
    .filter((file) => file.modifiedAt >= sinceMs)
    .sort((left, right) => left.modifiedAt - right.modifiedAt || (left.file < right.file ? -1 : 1))
  if (files.length === 0) return
  const errors = new Map()
  for (const file of files) {
    try {
      const json = JSON.parse(fs.readFileSync(join(reportsDir, file.file), 'utf8'))
      for (const error of (json.Results ?? []).filter((result) => result.Level === 'ERROR')) {
        const key = `${error.Rule}\0${error.File}\0${error.Line}\0${error.Message}`
        errors.set(key, error)
      }
    } catch {
      // PowerShell component reports are diagnostic projections, not gate status owners.
    }
  }
  if (errors.size > 0) {
    console.log(`\n[gate-check] ErrorOnly 摘要: ${errors.size} FAIL`)
    for (const error of errors.values()) {
      console.log(`  ${error.Rule} ${error.File} - ${error.Message}`)
    }
  }
}

async function main() {
  const startedAt = Date.now()
  cleanupOldReports(projectRoot)
  const executionId = `gate-check-${new Date().toISOString()}-${process.pid}`
  printPhase('prepare', 'running', 'gate-configuration-loading', executionId)

  const c0 = await spawnAsync(
    'c0-game-changelog',
    'node',
    ['scripts/check/domains/ui/game-changelog-regression.mjs'],
    { timeoutMs: 60_000 },
  )
  printStepResult(c0)
  if (c0.statusCode !== 'succeeded') {
    printPhase('finalize', 'failed', 'prepare-check-failed', c0.nodeId)
    process.exitCode = 1
    return
  }

  printPhase('prepare', 'succeeded', 'gate-inputs-valid', c0.nodeId)
  printPhase('ready', 'succeeded', 'release-checks-queued', 'parallel=3')
  const c3Name = quick ? 'c3-check-quick' : 'c3-check-full'
  const [c1, c2, c3] = await Promise.all([
    spawnAsync('c1-lint', 'npm', ['run', 'lint'], { timeoutMs: 120_000 }),
    spawnAsync('c2-typescript', 'npx', ['tsc', '--noEmit'], { timeoutMs: 120_000 }),
    spawnAsync(c3Name, 'npm', ['run', quick ? 'check:quick' : 'check'], {
      timeoutMs: 120_000,
      env: {
        ...process.env,
        CHECK_QUIET: quiet ? '1' : '0',
      },
    }),
  ])
  printStepResult(c1)
  printStepResult(c2)
  printStepResult(c3)
  const failed = [c1, c2, c3].filter((result) => result.statusCode !== 'succeeded')
  printPhase(
    'execute',
    failed.length === 0 ? 'succeeded' : 'failed',
    failed.length === 0 ? 'all-gate-nodes-completed' : 'release-check-failed',
    failed.length === 0 ? 'parallel=3' : failed.map((result) => result.nodeId).join(','),
  )

  if (failed.length > 0) {
    if (errorOnly) printErrorSummary(startedAt)
    printPhase('transition', 'failed', 'failure-results-aggregated')
    printPhase('finalize', 'failed', 'gate-checks-failed')
    process.exitCode = 1
    return
  }

  if (errorOnly) printErrorSummary(startedAt)
  printPhase('transition', 'succeeded', 'all-results-aggregated')
  printPhase('finalize', 'succeeded', 'gate-checks-passed')
}

main().catch((error) => {
  console.error(`[gate-check:finalize] status=failed result=unhandled-error evidence=${error.message ?? error}`)
  process.exitCode = 1
})
