#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

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
const settlementContract = read('src/mods/mod-engine/prompts/narrative-settlement-prompt.ts')
const clientComponents = read('src/mods/mod-engine/prompts/narrative-prompt-components.ts')
const clientProtocol = read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts')
const narrativeServerPrompt = read('src/mods/mod-engine/server/narrative-system-prompt.ts')
const settlementServerPrompt = read('src/mods/mod-engine/server/narrative-settlement-system-prompt.ts')
const serverEntry = read('src/mods/mod-engine/server-prompt-assets.ts')
const manifest = read('src/mods/mod-engine/manifest.ts')
const generatedSecondary = read('src/core/mod-loader/mod-secondary-api-importers.generated.ts')
const aiClient = read('src/core/ai-service/ai-client.ts')
const callWrapper = read('src/core/ai-service/ai-call-wrapper.ts')
const proxyRoute = read('src/app/api/proxy/route.ts')
const settingsModal = read('src/mods/mod-settings/components/SettingsModal.tsx')
const settingsIndex = read('src/mods/mod-settings/index.ts')

assertOk(
  narrativeContract.includes("version: '5.8.0'")
    && narrativeContract.includes("systemPrompt: ''")
    && narrativeContract.includes("'mod-engine:narrative:5.8.0'")
    && narrativeContract.includes('serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID'),
  'browser narrative PromptTemplate must carry only the 5.8.0 server asset ID',
)
assertOk(
  settlementContract.includes("version: '1.1.0'")
    && settlementContract.includes("systemPrompt: ''")
    && settlementContract.includes("'mod-engine:narrative-settlement:1.1.0'")
    && settlementContract.includes('serverPromptAssetId: NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID'),
  'browser settlement PromptTemplate must carry only the 1.1.0 server asset ID',
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
  settlementServerPrompt.includes('你是人生模拟器的回合结算引擎')
    && settlementServerPrompt.includes('buildNarrativeSettlementSystemContractLines')
    && settlementServerPrompt.includes('buildNarrativeSettlementDataContractLine')
    && settlementServerPrompt.includes('buildNarrativeSettlementStandardExample')
    && settlementServerPrompt.includes('COMPILED_NARRATIVE_SETTLEMENT_SYSTEM_PROMPT'),
  'server Prompt owner must derive and retain the fixed settlement contract and example',
)

for (const secretMarker of [
  '受世界事实与模拟规则约束的世界叙事演算者',
  '获得新能力、资源或地位不会自动触发官方或机构审查',
  '你是人生模拟器的回合结算引擎',
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
    && !clientProtocol.includes('buildNarrativeSettlementStandardExample'),
  'browser protocol owner must keep only Schema, strict translation and compact repair reminders',
)
assertOk(
  serverEntry.includes("import 'server-only'")
    && serverEntry.includes('resolveModEngineServerPromptAsset')
    && serverEntry.includes('NARRATIVE_SERVER_PROMPT_ASSET_ID')
    && serverEntry.includes('NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID')
    && !serverEntry.includes('LEGACY_SERVER_PROMPT_ASSET_ALIASES')
    && !serverEntry.includes('canonicalAssetId'),
  'server Prompt entry must expose exactly the two current protected assets without migration aliases',
)
assertOk(
  (serverEntry.match(/systemPrompt:/gu) ?? []).length === 3
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
