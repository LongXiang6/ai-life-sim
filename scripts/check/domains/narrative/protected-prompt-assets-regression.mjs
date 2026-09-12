#!/usr/bin/env node
/**
 * Purpose: Verify the approved 01/02/03 Prompt assets remain server-owned and client-safe.
 * Owner: quality:narrative
 * Responsibility: Protected asset allow-list and injection-boundary regression only.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const assertOk = (condition, message) => {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

const contractPaths = [
  'src/mods/mod-engine/prompts/narrative-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-story-continuity-prompt.ts',
  'src/mods/mod-engine/prompts/narrative-talent-growth-prompt.ts',
]
const serverPaths = [
  'src/mods/mod-engine/server/narrative-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-story-continuity-system-prompt.ts',
  'src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts',
]
const contracts = contractPaths.map(read)
const servers = serverPaths.map(read)
const serverEntry = read('src/mods/mod-engine/server-prompt-assets.ts')
const proxyRoute = read('src/app/api/proxy/route.ts')
const callWrapper = read('src/core/ai-service/ai-call-wrapper.ts')
const requestBody = read('src/core/ai-service/ai-client/request-body.ts')
const clientProtocol = read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts')

for (const contract of contracts) {
  assertOk(contract.includes("systemPrompt: ''"), 'browser Prompt contract must not carry fixed system text')
  assertOk(contract.includes('serverPromptAssetId:'), 'browser Prompt contract must carry a protected asset ID')
}
assertOk(
  serverEntry.includes("import 'server-only'")
    && serverEntry.includes('resolveModEngineServerPromptAsset')
    && serverEntry.includes('NARRATIVE_SERVER_PROMPT_ASSET_ID')
    && serverEntry.includes('NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID')
    && serverEntry.includes('NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID')
    && !serverEntry.includes('NARRATIVE_EVENT_LIBRARY_SERVER_PROMPT_ASSET_ID')
    && [...serverEntry.matchAll(/^\s*\[(NARRATIVE(?:_[A-Z]+)*_SERVER_PROMPT_ASSET_ID)\]:/gmu)].length === 3,
  'server registry must expose exactly the 01/02/03 protected assets',
)
assertOk(
  servers[0].includes('COMPILED_NARRATIVE_SYSTEM_PROMPT')
    && servers[1].includes('COMPILED_NARRATIVE_STORY_CONTINUITY_SYSTEM_PROMPT')
    && servers[2].includes('COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT')
    && servers.every((source) => !/详细故事输出示例|示例正文|few-shot|examples\s*:/iu.test(source)),
  'fixed assets must own only their stable responsibilities without detailed examples',
)
assertOk(
  proxyRoute.includes('resolveModEngineServerPromptAsset(body.prompt_asset)')
    && proxyRoute.includes('promptAsset.systemPrompt')
    && callWrapper.includes('serverPromptAssetId: promptTemplate.serverPromptAssetId')
    && requestBody.includes("messages.filter((message) => message.role !== 'system')"),
  'the client/proxy chain must inject protected assets only at the trusted server boundary',
)
assertOk(
  !clientProtocol.includes('COMPILED_NARRATIVE_')
    && !clientProtocol.includes('StandardExample')
    && !clientProtocol.includes('RepairInstruction'),
  'browser protocol code must not contain fixed Prompt text or repair templates',
)

const promptAssets = fs.readdirSync(path.join(root, 'src/mods/mod-engine/prompts'))
  .filter((name) => /^narrative(?:-[a-z-]+)?-prompt\.ts$/u.test(name))
  .filter((name) => !['narrative-analysis-output-prompt.ts', 'narrative-prompt-components.ts'].includes(name))
  .sort()
const serverAssets = fs.readdirSync(path.join(root, 'src/mods/mod-engine/server'))
  .filter((name) => /^narrative(?:-[a-z-]+)?-system-prompt\.ts$/u.test(name))
  .sort()
assertOk(
  JSON.stringify(promptAssets) === JSON.stringify(contractPaths.map((item) => path.basename(item)).sort())
    && JSON.stringify(serverAssets) === JSON.stringify(serverPaths.map((item) => path.basename(item)).sort()),
  'narrative asset directories must contain only the approved 01/02/03 runtime assets',
)

if (failed > 0) process.exit(1)
console.log('PASS: protected-prompt-assets-regression')
