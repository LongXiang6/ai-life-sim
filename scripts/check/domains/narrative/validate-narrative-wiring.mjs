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
const narrativeServerAsset = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/server/narrative-system-prompt.ts'),
  'utf8',
)
const narrativeRepairAsset = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/server/narrative-repair-system-prompt.ts'),
  'utf8',
)
const narrativeBranchRepairAsset = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/server/narrative-branch-repair-system-prompt.ts'),
  'utf8',
)
const narrativeBranchRepairContract = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/prompts/narrative-branch-repair-prompt.ts'),
  'utf8',
)
const narrativeRepetitionRepairAsset = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/server/narrative-repetition-repair-system-prompt.ts'),
  'utf8',
)
const narrativeRepetitionAuditAsset = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/server/narrative-repetition-audit-system-prompt.ts'),
  'utf8',
)
const narrativeRepetitionRepairContract = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/prompts/narrative-repetition-repair-prompt.ts'),
  'utf8',
)
const serverPromptAssets = fs.readFileSync(
  path.join(ROOT, 'src/mods/mod-engine/server-prompt-assets.ts'),
  'utf8',
)
for (const field of ['长期记忆', '核心记忆', '相关往事', '近期完整经历', '本轮可回收伏笔']) {
  if (!promptBuilder.includes(field)) {
    console.error(`[FAIL] prompt-builder 缺少三层中文字段 ${field}`)
    failed++
  }
}
if (!narrativePrompt.includes("version: '4.7.0'")
  || !narrativePrompt.includes('NarrativeAIResponseSchema')
  || !narrativePrompt.includes('serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID')
  || !narrativePrompt.includes('NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID')) {
  console.error('[FAIL] narrative-prompt 未接入 4.7.0 四层主资产、精简修复资产与中文协议 Schema')
  failed++
}
if (!narrativeRepairAsset.includes('COMPILED_NARRATIVE_REPAIR_SYSTEM_PROMPT')
  || !narrativeRepairAsset.includes('buildNarrativeAIProtocolStandardExample')) {
  console.error('[FAIL] narrative-repair-system-prompt 未复用唯一协议示例')
  failed++
}
if (!narrativeBranchRepairAsset.includes('COMPILED_NARRATIVE_BRANCH_REPAIR_SYSTEM_PROMPT')
  || !narrativeBranchRepairContract.includes('narrativeBranchRepairOutputSchema')
  || !narrativeBranchRepairContract.includes('NARRATIVE_BRANCH_REPAIR_SERVER_PROMPT_ASSET_ID')) {
  console.error('[FAIL] 玩家强制分支未接入独立服务端资产与严格 JSON Schema')
  failed++
}
if (!narrativeRepetitionRepairAsset.includes('COMPILED_NARRATIVE_REPETITION_REPAIR_SYSTEM_PROMPT')
  || !narrativeRepetitionRepairAsset.includes('不得输出摘要、数据区、markdown、解释或思考过程')
  || !narrativeRepetitionAuditAsset.includes('COMPILED_NARRATIVE_REPETITION_AUDIT_SYSTEM_PROMPT')
  || !narrativeRepetitionAuditAsset.includes('{"事实一致":true,"完整覆盖":true,"覆盖证据":')
  || !narrativeRepetitionAuditAsset.includes('"冲突":[],"遗漏":[]')
  || !narrativeRepetitionRepairContract.includes('parseNarrativeRepetitionRepairOutput')
  || !narrativeRepetitionRepairContract.includes('narrativeRepetitionAuditOutputSchema')
  || !serverPromptAssets.includes('NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID')
  || !serverPromptAssets.includes('NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID')) {
  console.error('[FAIL] 重复剧情改写与事实一致性审计未接入独立受保护资产和严格输出契约')
  failed++
}
if (!narrativeServerAsset.includes('COMPILED_NARRATIVE_SYSTEM_PROMPT')
  || !narrativeServerAsset.includes('buildNarrativeAIProtocolBaseRules')
  || !narrativeServerAsset.includes('buildNarrativeAIProtocolStandardExample')) {
  console.error('[FAIL] 服务端 narrative-system-prompt 未成为基础约束与唯一标准示例的装配权威')
  failed++
}

if (failed > 0) {
  console.error(`\n叙事接线验证失败: ${failed} 项`)
  process.exit(1)
}

console.log('[OK] 叙事管线接线验证通过')
