#!/usr/bin/env node
/**
 * Purpose: Verify protected server Prompt assets remain server-owned and excluded from client bundles.
 * Owner: quality:narrative
 * Responsibility: Prompt asset boundary regression only; Prompt content and runtime calls retain their owners.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

const narrativeContract = read('src/mods/mod-engine/prompts/narrative-prompt.ts')
const basicAttributeContract = read('src/mods/mod-engine/prompts/narrative-basic-attribute-prompt.ts')
const dataAnalysisContract = read('src/mods/mod-engine/prompts/narrative-data-analysis-prompt.ts')
const eventRecognitionContract = read('src/mods/mod-engine/prompts/narrative-event-recognition-prompt.ts')
const macroImpactContract = read('src/mods/mod-engine/prompts/narrative-macro-impact-prompt.ts')
const clientComponents = read('src/mods/mod-engine/prompts/narrative-prompt-components.ts')
const clientProtocol = read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts')
const narrativeServerPrompt = read('src/mods/mod-engine/server/narrative-system-prompt.ts')
const basicAttributeServerPrompt = read('src/mods/mod-engine/server/narrative-basic-attribute-system-prompt.ts')
const dataAnalysisServerPrompt = read('src/mods/mod-engine/server/narrative-data-analysis-system-prompt.ts')
const eventRecognitionServerPrompt = read('src/mods/mod-engine/server/narrative-event-recognition-system-prompt.ts')
const macroImpactServerPrompt = read('src/mods/mod-engine/server/narrative-macro-impact-system-prompt.ts')
const serverEntry = read('src/mods/mod-engine/server-prompt-assets.ts')
const manifest = read('src/mods/mod-engine/manifest.ts')
const generatedSecondary = read('src/core/mod-loader/mod-secondary-api-importers.generated.ts')
const aiClient = readModuleSource('src/core/ai-service/ai-client.ts', root)
const callWrapper = read('src/core/ai-service/ai-call-wrapper.ts')
const proxyRoute = read('src/app/api/proxy/route.ts')
const settingsModal = read('src/mods/mod-settings/components/SettingsModal.tsx')
const settingsIndex = read('src/mods/mod-settings/index.ts')

assertOk(
  eventRecognitionContract.includes("version: '3.1.0'")
    && eventRecognitionContract.includes("systemPrompt: ''")
    && eventRecognitionContract.includes("'mod-engine:narrative-event-recognition:3.1.0'")
    && eventRecognitionContract.includes("outputFormat: 'json'")
    && eventRecognitionContract.includes('outputSchema: NarrativeAIEventRecognitionDataSchema')
    && eventRecognitionContract.includes('serverPromptAssetId: NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID'),
  'browser event-recognition PromptTemplate must carry only the 3.1.0 JSON server asset contract',
)
assertOk(
  narrativeContract.includes("version: '5.8.2'")
    && narrativeContract.includes("systemPrompt: ''")
    && narrativeContract.includes("'mod-engine:narrative:5.8.2'")
    && narrativeContract.includes('serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID'),
  'browser narrative PromptTemplate must carry only the 5.8.2 server asset ID',
)
assertOk(
  eventRecognitionServerPrompt.includes('你是人生模拟器的事件识别器')
    && eventRecognitionServerPrompt.includes('buildNarrativeEventRecognitionContractLine')
    && eventRecognitionServerPrompt.includes('buildNarrativeEventRecognitionStandardExample')
    && eventRecognitionServerPrompt.includes('COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT'),
  'server Prompt owner must retain the occurred-event and future-candidate recognition contract',
)
assertOk(
  basicAttributeContract.includes("version: '2.1.0'")
    && basicAttributeContract.includes("systemPrompt: ''")
    && basicAttributeContract.includes("'mod-engine:narrative-basic-attribute-analysis:2.1.0'")
    && basicAttributeContract.includes("outputFormat: 'json'")
    && basicAttributeContract.includes('outputSchema: NarrativeAIBasicAttributeAnalysisDataSchema')
    && basicAttributeContract.includes('serverPromptAssetId: NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID'),
  'browser basic-attribute PromptTemplate must carry only the 2.1.0 JSON server asset contract',
)
assertOk(
  dataAnalysisContract.includes("version: '2.0.0'")
    && dataAnalysisContract.includes("systemPrompt: ''")
    && dataAnalysisContract.includes("'mod-engine:narrative-data-analysis:2.0.0'")
    && dataAnalysisContract.includes("outputFormat: 'json'")
    && dataAnalysisContract.includes('outputSchema: NarrativeAIDataAnalysisDataSchema')
    && dataAnalysisContract.includes('serverPromptAssetId: NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID'),
  'browser data-analysis PromptTemplate must carry only the 2.0.0 JSON server asset contract',
)
assertOk(
  macroImpactContract.includes("version: '1.0.0'")
    && macroImpactContract.includes("systemPrompt: ''")
    && macroImpactContract.includes("'mod-engine:narrative-macro-impact:1.0.0'")
    && macroImpactContract.includes("outputFormat: 'json'")
    && macroImpactContract.includes('outputSchema: NarrativeAIMacroImpactDataSchema')
    && macroImpactContract.includes('serverPromptAssetId: NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID'),
  'browser macro-impact PromptTemplate must carry only the 1.0.0 JSON server asset contract',
)
assertOk(
  narrativeServerPrompt.includes('受世界事实与模拟规则约束的世界叙事演算者')
    && narrativeServerPrompt.includes('buildNarrativeAIProtocolStandardExample')
    && narrativeServerPrompt.includes('player-setting-ownership')
    && narrativeServerPrompt.includes('narrative-length-control')
    && narrativeServerPrompt.includes('正文全部段落合计的篇幅区间和结构密度')
    && narrativeServerPrompt.includes('`${NARRATIVE_BODY_TAG}<完整正文>')
    && !narrativeServerPrompt.includes('此处填写')
    && narrativeServerPrompt.includes('世界观、已激活模组规则与确定性模拟逻辑')
    && narrativeServerPrompt.includes('COMPILED_NARRATIVE_SYSTEM_PROMPT'),
  'server Prompt owner must retain the fixed narrative asset and standard example',
)
assertOk(
  basicAttributeServerPrompt.includes('你是人生模拟器的基础属性分析器')
    && basicAttributeServerPrompt.includes('buildNarrativeBasicAttributeContractLine')
    && basicAttributeServerPrompt.includes('buildNarrativeBasicAttributeStandardExample')
    && basicAttributeServerPrompt.includes('COMPILED_NARRATIVE_BASIC_ATTRIBUTE_SYSTEM_PROMPT'),
  'server Prompt owner must derive and retain the fixed basic-attribute contract and example',
)
assertOk(
  dataAnalysisServerPrompt.includes('你是人生模拟器的系统数据分析器')
    && dataAnalysisServerPrompt.includes('buildNarrativeDataAnalysisSystemContractLines')
    && dataAnalysisServerPrompt.includes('buildNarrativeDataAnalysisStandardExample')
    && dataAnalysisServerPrompt.includes('COMPILED_NARRATIVE_DATA_ANALYSIS_SYSTEM_PROMPT'),
  'server Prompt owner must derive and retain the fixed data-analysis contract and example',
)
assertOk(
  macroImpactServerPrompt.includes('你是人生模拟器的宏观影响分析器')
    && macroImpactServerPrompt.includes('buildNarrativeMacroImpactContractProjection')
    && macroImpactServerPrompt.includes('COMPILED_NARRATIVE_MACRO_IMPACT_SYSTEM_PROMPT'),
  'server Prompt owner must derive and retain the fixed macro-impact DAG contract and example',
)

for (const secretMarker of [
  '受世界事实与模拟规则约束的世界叙事演算者',
  '获得新能力、资源或地位不会自动触发官方或机构审查',
  '你是人生模拟器的基础属性分析器',
  '你是人生模拟器的系统数据分析器',
  '你是人生模拟器的事件识别器',
  '你是人生模拟器的宏观影响分析器',
  '标准返回示例：',
]) {
  assertOk(
    !clientComponents.includes(secretMarker) && !clientProtocol.includes(secretMarker),
    `client Prompt or protocol module leaked fixed asset: ${secretMarker}`,
  )
}
assertOk(
  !clientProtocol.includes('buildNarrativeAIProtocolBaseRules')
    && !clientProtocol.includes('buildNarrativeAIProtocolStandardExample')
    && !clientProtocol.includes('buildNarrativeBasicAttributeStandardExample')
    && !clientProtocol.includes('buildNarrativeDataAnalysisStandardExample')
    && !clientProtocol.includes('buildNarrativeEventRecognitionStandardExample'),
  'browser protocol owner must keep only Schema, strict translation and main-narrative repair reminders',
)
assertOk(
  serverEntry.includes("import 'server-only'")
    && serverEntry.includes('resolveModEngineServerPromptAsset')
    && serverEntry.includes('NARRATIVE_SERVER_PROMPT_ASSET_ID')
    && serverEntry.includes('NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID')
    && serverEntry.includes('NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID')
    && serverEntry.includes('NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID')
    && serverEntry.includes('NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID')
    && !serverEntry.includes('LEGACY_SERVER_PROMPT_ASSET_ALIASES')
    && !serverEntry.includes('canonicalAssetId'),
  'server Prompt entry must expose exactly the five current protected assets without migration aliases',
)
assertOk(
  (serverEntry.match(/systemPrompt:/gu) ?? []).length === 6
    && !serverEntry.includes('startsWith(')
    && !serverEntry.includes('includes(assetId'),
  'server Prompt whitelist must stay exact rather than accepting prefix or substring matches',
)

for (const retiredPath of [
  'src/mods/mod-engine/campaigns/default/prompts/system-prompt.ts',
  'src/mods/mod-engine/server/narrative-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-data-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-branch-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-repetition-repair-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-repetition-audit-system-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-data-repair-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-branch-repair-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-repetition-repair-prompt.ts',
  'src/mods/mod-engine/prompts/components/registry.ts',
]) {
  assertOk(!fs.existsSync(path.join(root, retiredPath)), `retired Prompt asset remains: ${retiredPath}`)
}

assertOk(
  manifest.includes("serverOnlyPublicEntries: ['server-prompt-assets.ts']")
    && !/secondaryPublicEntries:\s*\[[^\]]*server-prompt-assets/s.test(manifest)
    && !generatedSecondary.includes('@/mods/mod-engine/server-prompt-assets'),
  'server Prompt entry must stay out of browser Remote API wiring',
)
assertOk(
  callWrapper.includes('serverPromptAssetId: promptTemplate.serverPromptAssetId')
    && aiClient.includes('proxyBody.prompt_asset = options.serverPromptAssetId')
    && aiClient.includes("messages.filter((message) => message.role !== 'system')"),
  'client call chain must send the asset ID and remove client system messages',
)
assertOk(
  proxyRoute.includes('resolveModEngineServerPromptAsset(body.prompt_asset)')
    && proxyRoute.includes("message.role === 'system'")
    && proxyRoute.includes('isTrustedServerPromptTarget(providerId, baseUrl)')
    && proxyRoute.includes("{ role: 'system', content: promptAsset.systemPrompt }")
    && proxyRoute.includes('messages: upstreamMessages'),
  'proxy must validate, inject and forward the protected server asset',
)
assertOk(
  !settingsModal.includes('SettingsTabPrompt')
    && !settingsModal.includes("label: 'Prompt'")
    && !settingsIndex.includes('SettingsTabPrompt')
    && !fs.existsSync(path.join(root, 'src/mods/mod-settings/components/SettingsTabPrompt.tsx')),
  'player settings and public exports must not expose the internal Prompt preview',
)

if (failed > 0) process.exit(1)
console.log('PASS: protected-prompt-assets-regression')
