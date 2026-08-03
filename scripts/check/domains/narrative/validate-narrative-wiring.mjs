/**
 * Purpose: Validate static wiring for immediate story publication, four background analyses, and the compression gate.
 * Owner: quality:narrative
 * Responsibility: Narrative wiring assertions only; runtime owners retain execution and state transitions.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'

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

const orchestrator = readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', ROOT)
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
const basicAttributePrompt = read('src/mods/mod-engine/prompts/narrative-basic-attribute-prompt.ts')
const dataAnalysisPrompt = read('src/mods/mod-engine/prompts/narrative-data-analysis-prompt.ts')
const eventRecognitionPrompt = read('src/mods/mod-engine/prompts/narrative-event-recognition-prompt.ts')
const macroImpactPrompt = read('src/mods/mod-engine/prompts/narrative-macro-impact-prompt.ts')
const narrativeServerAsset = read('src/mods/mod-engine/server/narrative-system-prompt.ts')
const basicAttributeServerAsset = read('src/mods/mod-engine/server/narrative-basic-attribute-system-prompt.ts')
const dataAnalysisServerAsset = read('src/mods/mod-engine/server/narrative-data-analysis-system-prompt.ts')
const eventRecognitionServerAsset = read('src/mods/mod-engine/server/narrative-event-recognition-system-prompt.ts')
const macroImpactServerAsset = read('src/mods/mod-engine/server/narrative-macro-impact-system-prompt.ts')
const serverPromptAssets = read('src/mods/mod-engine/server-prompt-assets.ts')
const campaign = read('src/mods/mod-engine/campaigns/default/index.ts')
const aiClient = readModuleSource('src/core/ai-service/ai-client.ts', ROOT)
const manifest = read('src/mods/mod-engine/manifest.ts')
const envelope = read('src/mods/mod-engine/helpers/tagged-meta-envelope.ts')

for (const field of ['timelineMemory', '本轮可回收伏笔']) {
  assertOk(promptBuilder.includes(field), `prompt-builder 缺少叙事记忆字段 ${field}`)
}
assertOk(
  eventRecognitionPrompt.includes("version: '3.1.0'")
    && eventRecognitionPrompt.includes("'mod-engine:narrative-event-recognition:3.1.0'")
    && eventRecognitionPrompt.includes("outputFormat: 'json'")
    && eventRecognitionPrompt.includes('outputSchema: NarrativeAIEventRecognitionDataSchema')
    && eventRecognitionPrompt.includes('serverPromptAssetId: NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID'),
  '事件识别调用必须接入唯一 3.1.0 纯 JSON 受保护资产',
)
assertOk(
  promptBuilder.includes('userSegments: [string, string, string]')
    && promptBuilder.includes('⟦全局信息⟧')
    && promptBuilder.includes('⟦记忆⟧')
    && promptBuilder.includes('⟦本轮引导⟧')
    && !promptBuilder.includes('⟦变化要求⟧'),
  '第一次调用必须只装配全局信息、记忆和本轮引导三条动态消息',
)
assertOk(
  narrativePrompt.includes("version: '5.8.2'")
    && narrativePrompt.includes("'mod-engine:narrative:5.8.2'")
    && narrativePrompt.includes('serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID'),
  '第一次调用必须接入唯一 5.8.2 受保护叙事资产',
)
assertOk(
  basicAttributePrompt.includes("version: '2.1.0'")
    && basicAttributePrompt.includes("'mod-engine:narrative-basic-attribute-analysis:2.1.0'")
    && basicAttributePrompt.includes("outputFormat: 'json'")
    && basicAttributePrompt.includes('outputSchema: NarrativeAIBasicAttributeAnalysisDataSchema')
    && basicAttributePrompt.includes('serverPromptAssetId: NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID')
    && dataAnalysisPrompt.includes("version: '2.0.0'")
    && dataAnalysisPrompt.includes("'mod-engine:narrative-data-analysis:2.0.0'")
    && dataAnalysisPrompt.includes("outputFormat: 'json'")
    && dataAnalysisPrompt.includes('outputSchema: NarrativeAIDataAnalysisDataSchema')
    && dataAnalysisPrompt.includes('serverPromptAssetId: NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID')
    && macroImpactPrompt.includes("version: '1.0.0'")
    && macroImpactPrompt.includes("'mod-engine:narrative-macro-impact:1.0.0'")
    && macroImpactPrompt.includes("outputFormat: 'json'")
    && macroImpactPrompt.includes('outputSchema: NarrativeAIMacroImpactDataSchema')
    && macroImpactPrompt.includes('serverPromptAssetId: NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID'),
  '后台系统变化调用必须分别接入基础属性、数据分析和宏观影响纯 JSON 受保护资产',
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
  basicAttributeServerAsset.includes('COMPILED_NARRATIVE_BASIC_ATTRIBUTE_SYSTEM_PROMPT')
    && basicAttributeServerAsset.includes('buildNarrativeBasicAttributeContractLine')
    && basicAttributeServerAsset.includes('buildNarrativeBasicAttributeStandardExample')
    && dataAnalysisServerAsset.includes('COMPILED_NARRATIVE_DATA_ANALYSIS_SYSTEM_PROMPT')
    && dataAnalysisServerAsset.includes('buildNarrativeDataAnalysisSystemContractLines')
    && dataAnalysisServerAsset.includes('buildNarrativeDataAnalysisStandardExample'),
  '基础属性与数据分析资产必须各自派生固定契约和标准示例',
)
assertOk(
  eventRecognitionServerAsset.includes('COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT')
    && eventRecognitionServerAsset.includes('buildNarrativeEventRecognitionContractLine')
    && eventRecognitionServerAsset.includes('buildNarrativeEventRecognitionStandardExample')
    && eventRecognitionServerAsset.includes('尚未发生且需要未来条件'),
  '事件识别资产必须同时识别已发生注册事件和未来待触发事项',
)
assertOk(
  macroImpactServerAsset.includes('COMPILED_NARRATIVE_MACRO_IMPACT_SYSTEM_PROMPT')
    && macroImpactServerAsset.includes('buildNarrativeMacroImpactContractProjection')
    && macroImpactServerAsset.includes('直接影响或连锁反应')
    && macroImpactServerAsset.includes('中性格式示例'),
  '宏观影响资产必须读取完整系统契约并以中性空链示例约束 DAG 输出',
)
assertOk(
  serverPromptAssets.includes('NARRATIVE_SERVER_PROMPT_ASSET_ID')
    && serverPromptAssets.includes('NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID')
    && serverPromptAssets.includes('NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID')
    && serverPromptAssets.includes('NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID')
    && serverPromptAssets.includes('NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID')
    && !/NARRATIVE_(?:DATA|BRANCH|REPETITION|REPAIR)_SERVER_PROMPT_ASSET_ID/u.test(serverPromptAssets),
  '服务端注册表必须只保留主叙事及四类后台分析五份资产',
)
assertOk(
  campaign.includes("name: 'ai-narration'")
    && campaign.includes("name: 'publish-narrative'")
    && campaign.includes("name: 'ai-data-analysis'")
    && campaign.includes("name: 'ai-basic-attribute-analysis'")
    && campaign.includes("name: 'ai-event-recognition'")
    && campaign.includes("name: 'ai-macro-impact'")
    && campaign.match(/parallelGroup: 'narrative-background-analysis'/gu)?.length === 4
    && campaign.includes("'ai-basic-attribute-analysis',\n        'ai-data-analysis',\n        'ai-event-recognition',")
    && campaign.includes("'ai-macro-impact',")
    && campaign.includes('buildNarrativeDataAnalysisPromptInput')
    && campaign.includes('inspectNarrativeDataAnalysisQuality')
    && campaign.includes('buildNarrativeBasicAttributePromptInput')
    && campaign.includes('inspectNarrativeBasicAttributeAnalysisQuality')
    && campaign.includes('buildNarrativeEventRecognitionPromptInput')
    && campaign.includes('inspectNarrativeEventRecognitionQuality')
    && campaign.includes('buildNarrativeMacroImpactPromptInput')
    && campaign.includes('inspectNarrativeMacroImpactQuality')
    && campaign.includes('orchestrator.acceptNarrativeResponse(')
    && campaign.includes('orchestrator.launchNarrativeBackgroundAnalysis({')
    && campaign.includes('runNonBlockingBackgroundLaunch(')
    && campaign.includes('await orchestrator.ensureCompressionGate()')
    && !campaign.includes('combineNarrativeBackgroundAnalysis')
    && campaign.includes('narrativeBasicAttributePrompt')
    && campaign.includes('narrativeDataAnalysisPrompt')
    && campaign.includes('narrativeEventRecognitionPrompt')
    && campaign.includes('narrativeMacroImpactPrompt')
    && manifest.includes("'publish-narrative'")
    && manifest.includes("'ai-data-analysis'")
    && manifest.includes("'ai-basic-attribute-analysis'")
    && manifest.includes("'ai-event-recognition'")
    && manifest.includes("'ai-macro-impact'"),
  '默认 Campaign 与 Manifest 必须声明正文发布、四路非阻塞后台分析和压缩唯一闸门',
)
assertOk(
  campaign.includes('buildNarrativeRepairInstruction')
    && campaign.match(/repairAttempts < MAX_FORMAT_REPAIR_ATTEMPTS/gu)?.length === 1
    && !/buildNarrative(?:DataAnalysis|BasicAttributeAnalysis|EventRecognition)RepairInstruction/u.test(campaign)
    && aiClient.includes('export async function validateWithRetry')
    && aiClient.includes('前次输出不是合格的纯 JSON 对象')
    && aiClient.includes('return retryResult || content'),
  '主叙事保留有界格式修复，四类后台统一由 AI 客户端 JSON Schema 最多修复一次',
)
assertOk(
  envelope.includes('parseNarrativeResponseEnvelope')
    && !/parseNarrative(?:DataAnalysis|BasicAttributeAnalysis|EventRecognition)Envelope/u.test(envelope)
    && !envelope.includes('parseSingleTaggedEnvelope')
    && envelope.includes('叙事响应缺少可识别的完整正文'),
  '标签解析器只能拥有主叙事正文与可选分支，后台结构统一交给 JSON Schema',
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

console.log('[OK] 故事即时发布、四路后台分析与压缩闸门接线验证通过')
