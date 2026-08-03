#!/usr/bin/env node
/**
 * @module gate-check.mjs
 * @description C0 变更记录 -> C1 lint / C2 tsc 并行 -> C3 领域检查的唯一门禁
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

function printErrorSummary() {
  const reportsDir = join(projectRoot, 'reports')
  if (!fs.existsSync(reportsDir)) return
  const runFiles = fs.readdirSync(reportsDir)
    .filter((file) => file.startsWith('check-run-') && file.endsWith('.json'))
    .map((file) => ({ file, modifiedAt: fs.statSync(join(reportsDir, file)).mtimeMs }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
  if (runFiles.length > 0) console.log(`\n[gate-check] 报告: reports/${runFiles[0].file}`)

  const files = fs.readdirSync(reportsDir)
    .filter((file) => file.startsWith('checker-') && file.endsWith('.json'))
    .map((file) => ({ file, modifiedAt: fs.statSync(join(reportsDir, file)).mtimeMs }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
  if (files.length === 0) return
  try {
    const json = JSON.parse(fs.readFileSync(join(reportsDir, files[0].file), 'utf8'))
    const errors = (json.Results ?? []).filter((result) => result.Level === 'ERROR')
    console.log(`\n[gate-check] ErrorOnly 摘要: ${errors.length} FAIL`)
    for (const error of errors) {
      console.log(`  ${error.Rule} ${error.File} - ${error.Message}`)
    }
  } catch {
    // PowerShell 摘要不是门禁真源；解析失败不改变已经取得的步骤状态。
  }
}

async function main() {
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
  printPhase('ready', 'succeeded', 'lint-and-typescript-queued', 'parallel=2')
  const [c1, c2] = await Promise.all([
    spawnAsync('c1-lint', 'npm', ['run', 'lint'], { timeoutMs: 120_000 }),
    spawnAsync('c2-typescript', 'npx', ['tsc', '--noEmit'], { timeoutMs: 120_000 }),
  ])
  printStepResult(c1)
  printStepResult(c2)
  if (c1.statusCode !== 'succeeded' || c2.statusCode !== 'succeeded') {
    printPhase('transition', 'failed', 'prerequisite-check-failed', `${c1.statusCode},${c2.statusCode}`)
    printPhase('finalize', 'failed', 'gate-checks-failed')
    process.exitCode = 1
    return
  }

  const c3Name = quick ? 'c3-check-quick' : 'c3-check-full'
  const c3 = await spawnAsync(c3Name, 'npm', ['run', quick ? 'check:quick' : 'check'], {
    timeoutMs: 120_000,
    env: {
      ...process.env,
      CHECK_QUIET: quiet ? '1' : '0',
      CHECK_UPSTREAM_STATUSES: JSON.stringify({ lint: c1.statusCode, typescript: c2.statusCode }),
    },
  })
  printStepResult(c3)
  printPhase(
    'execute',
    c3.statusCode,
    c3.statusCode === 'succeeded' ? 'all-gate-nodes-completed' : 'domain-check-failed',
    c3.nodeId,
  )

  if (c3.statusCode !== 'succeeded') {
    if (errorOnly) printErrorSummary()
    printPhase('transition', 'failed', 'failure-results-aggregated')
    printPhase('finalize', 'failed', 'gate-checks-failed')
    process.exitCode = 1
    return
  }

  if (errorOnly) printErrorSummary()
  printPhase('transition', 'succeeded', 'all-results-aggregated')
  printPhase('finalize', 'succeeded', 'gate-checks-passed')
}

main().catch((error) => {
  console.error(`[gate-check:finalize] status=failed result=unhandled-error evidence=${error.message ?? error}`)
  process.exitCode = 1
})
