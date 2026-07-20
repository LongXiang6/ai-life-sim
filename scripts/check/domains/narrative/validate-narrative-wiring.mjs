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
  ['orchestrator-system.ts', 'resolveForeshadowing'],
  ['orchestrator-system.ts', 'recordNarrativeSignals'],
  ['orchestrator-system.ts', 'setAISemanticAnalysis'],
  ['orchestrator-system.ts', 'recordRelationshipUpdates'],
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
const promptBuilder = fs.readFileSync(
  path.join(ROOT, 'src/core/ai-service/prompt-builder.ts'),
  'utf8',
)
const narrativeComponents = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/prompts/narrative-prompt-components.ts'),
  'utf8',
)
for (const field of ['长期记忆', '核心记忆', '相关往事', '近期完整经历', '本轮可回收伏笔']) {
  if (!promptBuilder.includes(field)) {
    console.error(`[FAIL] prompt-builder 缺少三层中文字段 ${field}`)
    failed++
  }
}
if (!narrativePrompt.includes("version: '4.3.0'") || !narrativePrompt.includes('NarrativeAIResponseSchema')) {
  console.error('[FAIL] narrative-prompt 未接入 4.3.0 平衡变化驱动力中文协议 Schema')
  failed++
}
if (!narrativeComponents.includes('COMPILED_NARRATIVE_SYSTEM_PROMPT')
  || !narrativeComponents.includes('buildNarrativeAIProtocolBaseRules')
  || !narrativeComponents.includes('buildNarrativeAIProtocolStandardExample')) {
  console.error('[FAIL] narrative-prompt-components 未成为基础约束与唯一标准示例的装配权威')
  failed++
}

if (failed > 0) {
  console.error(`\n叙事接线验证失败: ${failed} 项`)
  process.exit(1)
}

console.log('[OK] 叙事管线接线验证通过')
