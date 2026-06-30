/**
 * @module world-calibration-acceptance.mjs
 * @description 蓝图 §15 验收场景入口（tsx 运行 TypeScript 测试体）
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(DIR, '..', '..', '..', '..')
const runners = [
  path.join(DIR, 'world-calibration-acceptance-runner.ts'),
  path.join(DIR, 'world-calibration-ai-path-runner.ts'),
  path.join(DIR, 'world-calibration-phase5-runner.ts'),
  path.join(DIR, 'calibration-wiring-audit.ts'),
]

for (const runner of runners) {
  const result = spawnSync('npx', ['tsx', runner], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status !== 0) {
    console.error(`[FAIL] ${path.basename(runner)} failed`)
    process.exit(result.status ?? 1)
  }
}
