/**
 * @module test-mod-loader.mjs
 * @description MOD 加载器回归测试入口
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
const runner = path.join(ROOT, 'scripts', 'check', 'domains', 'structural', 'test-mod-loader-runner.ts')

const result = spawnSync('npx', ['tsx', runner], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.status !== 0) {
  console.error('[FAIL] mod-loader regression tests failed')
  process.exit(result.status ?? 1)
}
