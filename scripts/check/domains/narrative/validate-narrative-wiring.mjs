/**
 * @module validate-narrative-wiring.mjs
 * @description 双调用叙事与结算管线的静态接线验证
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
let failed = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assertOk(condition, message) {
  if (condition) return
  console.error(`[FAIL] ${message}`)
  failed++
}

const orchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
for (const method of [
  'buildCreationTimelineEntries',
  'buildNPCNetworkText',
  'buildForeshadowingText',
  'detectForeshadowing',
  'resolveForeshadowing',
  'recordNarrativeSignals',
  'setAISemanticAnalysis',
  'recordRelationshipUpdates',
  'buildNarrativeTimelineProjection',
]) {
  assertOk(new RegExp(`\\b${method}\\s*\\(`).test(orchestrator), `orchestrator-system.ts 缺少调用 ${method}()`)
}

for (const [file, method] of [
  ['foreshadowing-system.ts', 'getPlantedContext'],
  ['core-memory-system.ts', 'buildCreationTimelineEntries'],
  ['core-memory-system.ts', 'buildNPCNetworkText'],
]) {
  assertOk(
    new RegExp(`\\b${method}\\s*\\(`).test(read(`src/mods/mod-engine/subsystems/${file}`)),
    `${file} 缺少调用 ${method}()`,
  )
}

const promptBuilder = read('src/core/ai-service/prompt-builder.ts')
const narrativePrompt = read('src/mods/mod-engine/prompts/narrative-prompt.ts')
const settlementPrompt = read('src/mods/mod-engine/prompts/narrative-settlement-prompt.ts')
const narrativeServerAsset = read('src/mods/mod-engine/server/narrative-system-prompt.ts')
const settlementServerAsset = read('src/mods/mod-engine/server/narrative-settlement-system-prompt.ts')
const serverPromptAssets = read('src/mods/mod-engine/server-prompt-assets.ts')
const campaign = read('src/mods/mod-engine/campaigns/default/index.ts')
const manifest = read('src/mods/mod-engine/manifest.ts')
const envelope = read('src/mods/mod-engine/helpers/tagged-meta-envelope.ts')

for (const field of ['timelineMemory', '本轮可回收伏笔']) {
  assertOk(promptBuilder.includes(field), `prompt-builder 缺少叙事记忆字段 ${field}`)
}
assertOk(
  promptBuilder.includes('userSegments: [string, string, string]')
    && promptBuilder.includes('⟦全局信息⟧')
    && promptBuilder.includes('⟦记忆⟧')
    && promptBuilder.includes('⟦本轮引导⟧')
    && !promptBuilder.includes('⟦变化要求⟧'),
  '第一次调用必须只装配全局信息、记忆和本轮引导三条动态消息',
)
assertOk(
  narrativePrompt.includes("version: '5.8.0'")
    && narrativePrompt.includes("'mod-engine:narrative:5.8.0'")
    && narrativePrompt.includes('serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID'),
  '第一次调用必须接入唯一 5.8.0 受保护叙事资产',
)
assertOk(
  settlementPrompt.includes("version: '1.1.0'")
    && settlementPrompt.includes("'mod-engine:narrative-settlement:1.1.0'")
    && settlementPrompt.includes('serverPromptAssetId: NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID'),
  '第二次调用必须接入唯一 1.1.0 受保护结算资产',
)
assertOk(
  narrativeServerAsset.includes('COMPILED_NARRATIVE_SYSTEM_PROMPT')
    && narrativeServerAsset.includes('buildNarrativeAIProtocolBaseRules')
    && narrativeServerAsset.includes('buildNarrativeAIProtocolStandardExample')
    && narrativeServerAsset.includes('buildNarrativeAIProtocolPromptExample')
    && narrativeServerAsset.includes('reasoning_content 承载')
    && narrativeServerAsset.includes('`${NARRATIVE_BODY_TAG}<完整正文>')
    && !narrativeServerAsset.includes('此处填写')
    && narrativeServerAsset.includes('【content 返回结构示例结束】'),
  '主叙事资产必须只约束正文及可选分支，并提供唯一标准示例',
)
assertOk(
  settlementServerAsset.includes('COMPILED_NARRATIVE_SETTLEMENT_SYSTEM_PROMPT')
    && settlementServerAsset.includes('buildNarrativeSettlementSystemContractLines')
    && settlementServerAsset.includes('buildNarrativeSettlementDataContractLine')
    && settlementServerAsset.includes('buildNarrativeSettlementStandardExample'),
  '结算资产必须从活动系统契约派生系统行、数据契约和标准示例',
)
assertOk(
  serverPromptAssets.includes('NARRATIVE_SERVER_PROMPT_ASSET_ID')
    && serverPromptAssets.includes('NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID')
    && !/NARRATIVE_(?:DATA|BRANCH|REPETITION|REPAIR)_SERVER_PROMPT_ASSET_ID/u.test(serverPromptAssets),
  '服务端注册表必须只保留主叙事和结算两份资产',
)
assertOk(
  campaign.includes("name: 'ai-narration'")
    && campaign.includes("name: 'ai-settlement'")
    && campaign.includes('buildNarrativeSettlementPromptInput')
    && campaign.includes('inspectNarrativeSettlementQuality')
    && campaign.includes('narrativeSettlementPrompt')
    && manifest.includes("'ai-settlement'"),
  '默认 Campaign 与 Manifest 必须声明并执行串行结算阶段',
)
assertOk(
  campaign.includes('buildNarrativeRepairInstruction')
    && campaign.includes('buildNarrativeSettlementRepairInstruction')
    && campaign.match(/repairAttempts < MAX_FORMAT_REPAIR_ATTEMPTS/gu)?.length === 2,
  '两类格式修复必须分别复用原调用资产并保持有界尝试',
)
assertOk(
  envelope.includes('parseNarrativeResponseEnvelope')
    && envelope.includes('parseNarrativeSettlementEnvelope')
    && envelope.includes('连续系统编号、唯一末尾数据段及全部 Schema 仍保持严格')
    && envelope.includes('叙事响应缺少可识别的完整正文'),
  '解析器必须兼容完整响应的格式差异，同时保持结算编号和 Schema 严格',
)

for (const retiredPath of [
  'src/mods/mod-engine/server/narrative-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-data-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-branch-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-repetition-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-repetition-audit-system-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-data-repair-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-branch-repair-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-repetition-repair-prompt.ts',
]) {
  assertOk(!fs.existsSync(path.join(ROOT, retiredPath)), `旧协议资产仍然存在：${retiredPath}`)
}

if (failed > 0) {
  console.error(`\n叙事接线验证失败: ${failed} 项`)
  process.exit(1)
}

console.log('[OK] 双调用叙事与结算接线验证通过')
