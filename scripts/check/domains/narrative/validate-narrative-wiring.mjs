/**
 * @module validate-narrative-wiring.mjs
 * @description 叙事管线接线静态验证（蓝图 Phase 4.2 / 5.1 基础）
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)

const REQUIRED_CALLS = [
  ['orchestrator-system.ts', 'buildCoreMemory'],
  ['orchestrator-system.ts', 'buildForeshadowingText'],
  ['orchestrator-system.ts', 'detectForeshadowing'],
  ['orchestrator-system.ts', 'buildRichPrompt'],
  ['foreshadowing-system.ts', 'getPlantedContext'],
  ['core-memory-system.ts', 'collectHighImportanceEntries'],
]

let failed = 0

for (const [file, method] of REQUIRED_CALLS) {
  const full = path.join(ROOT, 'src/mods/mod-engine/subsystems', file)
  const content = fs.readFileSync(full, 'utf8')
  if (!new RegExp(`\\b${method}\\s*\\(`).test(content)) {
    console.error(`[FAIL] ${file} 缺少调用 ${method}()`)
    failed++
  }
}

const narrativePrompt = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/prompts/narrative-prompt.ts'),
  'utf8',
)
for (const field of ['coreMemory', 'memorySummary', 'foreshadowingText']) {
  if (!narrativePrompt.includes(`{{${field}}}`)) {
    console.error(`[FAIL] narrative-prompt 缺少模板变量 {{${field}}}`)
    failed++
  }
}

if (failed > 0) {
  console.error(`\n叙事接线验证失败: ${failed} 项`)
  process.exit(1)
}

console.log('[OK] 叙事管线接线验证通过')
