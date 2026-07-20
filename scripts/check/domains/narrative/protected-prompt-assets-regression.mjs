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

const promptContract = read('src/mods/mod-engine/prompts/narrative-prompt.ts')
const clientComponents = read('src/mods/mod-engine/prompts/narrative-prompt-components.ts')
const clientProtocol = read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts')
const serverPrompt = read('src/mods/mod-engine/server/narrative-system-prompt.ts')
const serverEntry = read('src/mods/mod-engine/server-prompt-assets.ts')
const manifest = read('src/mods/mod-engine/manifest.ts')
const generatedSecondary = read('src/core/mod-loader/mod-secondary-api-importers.generated.ts')
const aiClient = read('src/core/ai-service/ai-client.ts')
const callWrapper = read('src/core/ai-service/ai-call-wrapper.ts')
const proxyRoute = read('src/app/api/proxy/route.ts')
const settingsModal = read('src/mods/mod-settings/components/SettingsModal.tsx')
const settingsIndex = read('src/mods/mod-settings/index.ts')

assertOk(
  promptContract.includes("version: '4.5.0'")
    && promptContract.includes("systemPrompt: ''")
    && promptContract.includes('serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID'),
  'browser PromptTemplate must carry only the server asset ID',
)
assertOk(
  serverPrompt.includes('你是人生模拟器的主叙事引擎')
    && serverPrompt.includes('buildNarrativeAIProtocolStandardExample')
    && serverPrompt.includes('player-setting-ownership')
    && serverPrompt.includes('first-round-origin')
    && serverPrompt.includes('COMPILED_NARRATIVE_SYSTEM_PROMPT'),
  'server Prompt owner must retain the fixed narrative asset and standard example',
)
for (const secretMarker of [
  '你是人生模拟器的主叙事引擎',
  '获得新能力、资源或地位不会自动触发官方或机构审查',
  '你撞开仓房木门，把林舟的铜扣递给阿禾',
]) {
  assertOk(
    !clientComponents.includes(secretMarker) && !clientProtocol.includes(secretMarker),
    `client Prompt or protocol module leaked fixed asset: ${secretMarker}`,
  )
}
assertOk(
  !clientProtocol.includes('buildNarrativeAIProtocolBaseRules')
    && !clientProtocol.includes('buildNarrativeAIProtocolStandardExample'),
  'browser protocol owner must keep only Schema, parsing, translation and repair reminders',
)
assertOk(
  serverEntry.includes("import 'server-only'")
    && serverEntry.includes('resolveModEngineServerPromptAsset'),
  'server Prompt public entry must carry the server-only hard gate and resolver',
)
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
