#!/usr/bin/env node
/**
 * PDCA C闸一键验证：C0 game changelog → C1 lint ╲ C2 tsc → C3 check
 * --quick：L1 快速路径（check:quick，跳过叙事回归与全量 PS 扫描）
 * --error-only：C3 后输出 FAIL 摘要（reports/checker-*.json）
 *
 * C1 和 C2 并行执行（lint / tsc 互不依赖），失败汇总后统一退出。
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import fs from 'node:fs'
import { cleanupOldReports } from './lib/cleanup-reports.mjs'

const checkDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(checkDir, '..', '..')
const isWin = process.platform === 'win32'
const quick = process.argv.includes('--quick')
const verbose = process.argv.includes('--verbose')
const quiet = !verbose
const errorOnly = process.argv.includes('--error-only') || quiet

/** @returns {Promise<{name:string, code:number|null, signal:string|null, stdout:string, stderr:string}>} */
function spawnAsync(name, cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: projectRoot,
      shell: isWin,
      stdio: 'pipe',
      ...opts,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', () => resolve({ name, code: 1, signal: null, stdout, stderr }))
    child.on('close', (code, signal) => resolve({ name, code, signal, stdout, stderr }))
  })
}

function printStepResult({ name, code, signal, stdout, stderr }) {
  const out = `${stdout}${stderr}`.trim()
  if (code === 0) {
    console.log(`[gate-check] ${name} passed`)
    if (!quiet && out) console.log(out)
  } else {
    if (out) process.stderr.write(`${out}\n`)
    console.error(`\n[gate-check] FAILED at ${name} (exit ${code ?? signal ?? 'unknown'})`)
  }
}

function printErrorSummary() {
  const reportsDir = join(projectRoot, 'reports')
  if (!fs.existsSync(reportsDir)) return
  const runFiles = fs.readdirSync(reportsDir)
    .filter((f) => f.startsWith('check-run-') && f.endsWith('.json'))
    .map((f) => ({ f, m: fs.statSync(join(reportsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  if (runFiles.length > 0) {
    console.log(`\n[gate-check] 报告: reports/${runFiles[0].f}`)
  }
  const files = fs.readdirSync(reportsDir)
    .filter((f) => f.startsWith('checker-') && f.endsWith('.json'))
    .map((f) => ({ f, m: fs.statSync(join(reportsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  if (files.length === 0) return
  try {
    const json = JSON.parse(fs.readFileSync(join(reportsDir, files[0].f), 'utf8'))
    const errors = (json.Results ?? []).filter((r) => r.Level === 'ERROR')
    if (errors.length === 0) {
      console.log('\n[gate-check] ErrorOnly 摘要: 0 FAIL')
      return
    }
    console.log(`\n[gate-check] ErrorOnly 摘要 (${errors.length} FAIL):`)
    for (const e of errors.slice(0, 30)) {
      console.log(`  ${e.Rule} ${e.File} — ${e.Message}`)
    }
    if (errors.length > 30) {
      console.log(`  ... 另有 ${errors.length - 30} 项，见 reports/${files[0].f}`)
    }
  } catch {
    // 摘要可选
  }
}

async function main() {
  cleanupOldReports(projectRoot)
  console.log(`[gate-check] Starting PDCA C gates (${quick ? 'quick' : 'full'})${quiet ? ', quiet' : ''}...`)

  const c0 = await spawnAsync(
    'C0 game changelog',
    'node',
    ['scripts/check/domains/ui/game-changelog-regression.mjs'],
  )
  printStepResult(c0)
  if (c0.code !== 0) {
    console.error('[gate-check] Aborting after C0 failure')
    process.exit(c0.code ?? 1)
  }

  // ── C1 + C2: lint / tsc 并行（互不依赖） ──
  const [c1, c2] = await Promise.all([
    spawnAsync('C1 lint', 'npm', ['run', 'lint']),
    spawnAsync('C2 tsc', 'npx', ['tsc', '--noEmit']),
  ])

  printStepResult(c1)
  printStepResult(c2)

  if (c1.code !== 0 || c2.code !== 0) {
    console.error('[gate-check] Aborting after C1/C2 failure')
    process.exit(1)
  }

  // ── C3: 结构/领域扫描（顺序，依赖前两步通过） ──
  const c3Name = quick ? 'C3 check:quick' : 'C3 check'
  const c3 = await spawnAsync(c3Name, 'npm', ['run', quick ? 'check:quick' : 'check'], {
    env: quiet ? { CHECK_QUIET: '1' } : {},
  })

  printStepResult(c3)

  if (c3.code !== 0) {
    if (errorOnly) printErrorSummary()
    process.exit(c3.code ?? 1)
  }

  if (errorOnly) printErrorSummary()
  console.log('\n[gate-check] All C gates passed.')
}

main().catch((e) => {
  console.error(`[gate-check] Fatal: ${e.message ?? e}`)
  process.exit(1)
})
