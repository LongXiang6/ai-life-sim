/**
 * @module world-calibration-acceptance.mjs
 * @description 蓝图 §15 验收场景入口（tsx 运行 TypeScript 测试体）
 */

import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(DIR, '..', '..', '..', '..')
const loader = path.join(ROOT, 'scripts', 'check', 'lib', 'typescript-loader.mjs')
const presetMappingSource = fs.readFileSync(
  path.join(ROOT, 'src', 'mods', 'mod-world', 'utils', 'preset-to-config.ts'),
  'utf8',
)

assert.match(
  presetMappingSource,
  /mixed:\s*'mixed'[\s\S]*?mixed:\s*'mixed'/,
  '混合预设必须同时映射到 mixed 世界观与混合力量体系，不能退化为现代无超自然配置',
)
assert.match(
  presetMappingSource,
  /worldType:\s*preset\.category === 'mixed' \? 'mixed' : preset\.worldviewId/,
  '混合预设必须保留 mixed 世界类型，供世界初始化与提示词链路使用',
)
const worldInitSource = fs.readFileSync(
  path.join(ROOT, 'src', 'mods', 'mod-world', 'subsystems', 'world-init-system.ts'),
  'utf8',
)
assert.match(
  worldInitSource,
  /const tag = config\.essenceTag[\s\S]*?WORLDVIEW_TAG_DEFAULTS\[tag\]/,
  '世界初始化必须按预设映射出的 essenceTag 解析账簿标签',
)
const runners = [
  path.join(DIR, 'world-calibration-acceptance-runner.ts'),
  path.join(DIR, 'world-calibration-phase5-runner.ts'),
  path.join(DIR, 'calibration-wiring-audit.ts'),
]

for (const runner of runners) {
  const result = spawnSync(process.execPath, [
    '--no-warnings=ExperimentalWarning',
    '--loader',
    pathToFileURL(loader).href,
    runner,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status !== 0) {
    console.error(`[FAIL] ${path.basename(runner)} failed`)
    process.exit(result.status ?? 1)
  }
}
