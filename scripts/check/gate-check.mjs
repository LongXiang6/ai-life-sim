#!/usr/bin/env node
/**
 * PDCA C闸一键验证：C1 lint → C2 tsc → C3 check
 * --quick：L1 快速路径（check:quick，跳过叙事回归与全量 PS 扫描）
 * --error-only：C3 后输出 FAIL 摘要（reports/checker-*.json）
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';

const checkDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(checkDir, '..', '..');
const isWin = process.platform === 'win32';
const quick = process.argv.includes('--quick');
const verbose = process.argv.includes('--verbose');
const quiet = !verbose;
const errorOnly = process.argv.includes('--error-only') || quiet;

const steps = [
  { name: 'C1 lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'C2 tsc', cmd: 'npx', args: ['tsc', '--noEmit'] },
  {
    name: quick ? 'C3 check:quick' : 'C3 check',
    cmd: 'npm',
    args: ['run', quick ? 'check:quick' : 'check'],
    env: quiet ? { CHECK_QUIET: '1' } : {},
  },
];

function runStep({ name, cmd, args, env = {} }) {
  if (!quiet) console.log(`\n=== ${name} ===`);
  const result = spawnSync(cmd, args, {
    cwd: projectRoot,
    stdio: quiet ? 'pipe' : 'inherit',
    shell: isWin,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    if (quiet) {
      const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      if (out) process.stderr.write(`${out}\n`);
    }
    console.error(`\n[gate-check] FAILED at ${name} (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
  if (quiet) console.log(`[gate-check] ${name} passed`);
  else console.log(`[gate-check] ${name} passed`);
}

function printErrorSummary() {
  const reportsDir = join(projectRoot, 'reports');
  if (!fs.existsSync(reportsDir)) return;
  const runFiles = fs.readdirSync(reportsDir)
    .filter((f) => f.startsWith('check-run-') && f.endsWith('.json'))
    .map((f) => ({ f, m: fs.statSync(join(reportsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (runFiles.length > 0) {
    console.log(`\n[gate-check] 报告: reports/${runFiles[0].f}`);
  }
  const files = fs.readdirSync(reportsDir)
    .filter((f) => f.startsWith('checker-') && f.endsWith('.json'))
    .map((f) => ({ f, m: fs.statSync(join(reportsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (files.length === 0) return;
  try {
    const json = JSON.parse(fs.readFileSync(join(reportsDir, files[0].f), 'utf8'));
    const errors = (json.Results ?? []).filter((r) => r.Level === 'ERROR');
    if (errors.length === 0) {
      console.log('\n[gate-check] ErrorOnly 摘要: 0 FAIL');
      return;
    }
    console.log(`\n[gate-check] ErrorOnly 摘要 (${errors.length} FAIL):`);
    for (const e of errors.slice(0, 30)) {
      console.log(`  ${e.Rule} ${e.File} — ${e.Message}`);
    }
    if (errors.length > 30) {
      console.log(`  ... 另有 ${errors.length - 30} 项，见 reports/${files[0].f}`);
    }
  } catch {
    // 摘要可选
  }
}

console.log(`[gate-check] Starting PDCA C gates (${quick ? 'quick' : 'full'})${quiet ? ', quiet' : ''}...`);
for (const step of steps) {
  runStep(step);
}
if (errorOnly) {
  printErrorSummary();
}
console.log('\n[gate-check] All C gates passed.');
