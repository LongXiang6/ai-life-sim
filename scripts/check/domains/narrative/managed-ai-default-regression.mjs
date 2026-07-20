#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
let failed = 0

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

const provider = read('src/core/ai-service/provider-config.ts')
const proxy = read('src/app/api/proxy/route.ts')
const serverCredentials = read('src/core/ai-service/server-provider-credentials.ts')
const managedAggregation = read('src/core/ai-service/managed-sse-aggregation.ts')
const managedExecution = read('src/core/ai-service/managed-provider-execution.ts')
const worldInitRoute = read('src/app/api/world-init/route.ts')
const worldInitBundle = read('src/mods/mod-world/world-init-bundle.ts')
const store = read('src/mods/mod-settings/store.ts')
const settings = read('src/mods/mod-settings/components/SettingsTabPresets.tsx')
const aiClient = read('src/core/ai-service/ai-client.ts')
const runtimeCallers = [
  read('src/mods/mod-engine/hooks.ts'),
  read('src/mods/mod-engine/helpers/pre-gen-queue.ts'),
  read('src/mods/mod-pages/pages/game-over/page.tsx'),
  read('src/mods/mod-pages/pages/talent-draw/page.tsx'),
  read('src/mods/mod-settings/components/SettingsTabTheme.tsx'),
].join('\n')
const envExample = read('.env.example')

assertOk(
  provider.includes("DEFAULT_AI_PROVIDER_ID = 'managed'")
    && provider.includes("DEFAULT_AI_BASE_URL = 'https://api.longcat.chat/openai/v1'")
    && provider.includes("DEFAULT_AI_MODEL = 'LongCat-2.0'")
    && provider.includes("LEGACY_MANAGED_AI_PROVIDER_ID = 'managed-a6'")
    && provider.includes("LEGACY_MANAGED_AI_MODEL = 'gpt-5.6-luna'")
    && provider.includes("LEGACY_MANAGED_AI_FALLBACK_MODEL = 'gpt-5.6-terra'"),
  'LongCat default and retained a6api managed targets must have one public authority',
)
assertOk(
  !/(?:sk-|ak_)[A-Za-z0-9_-]{20,}/.test(provider + proxy + serverCredentials + managedAggregation + managedExecution + worldInitRoute + worldInitBundle + store + settings + envExample),
  'tracked sources must not contain an API credential',
)
assertOk(
  serverCredentials.includes("managed: 'LONGCAT_API_KEY'")
    && serverCredentials.includes("'managed-a6': 'MANAGED_AI_API_KEY'")
    && proxy.includes('readServerProviderApiKey(providerId)')
    && proxy.includes('isServerManagedProvider(providerId)')
    && proxy.includes('Managed model not allowed'),
  'proxy must resolve each managed credential only from server env and fix both model allowlists',
)
assertOk(
  proxy.includes('aggregateManagedStream')
    && proxy.includes('shouldAggregateManagedNonStream(providerId)')
    && proxy.includes('requestManagedAggregatedCompletion(')
    && proxy.includes('fallbackUsed: managedResult.model !== body.model')
    && managedExecution.includes('providerId,')
    && managedExecution.includes('requestedModel,')
    && managedExecution.includes('aggregateSseCompletion(response.body)')
    && managedExecution.includes('shouldTryManagedFallback(response.status)')
    && managedAggregation.includes("if (!completed) throw new Error('托管通道 SSE 未返回完整结束标记')")
    && managedAggregation.includes("if (!content) throw new Error('托管通道 SSE 返回空正文')"),
  'managed non-stream requests must aggregate completely and safely switch to the fallback before returning output',
)
assertOk(
  worldInitRoute.includes('callProviderDirect')
    && worldInitRoute.includes('readServerProviderApiKey(providerId)')
    && worldInitRoute.includes('isServerManagedProvider(providerId)')
    && worldInitRoute.includes('getProviderModelCandidates(providerId, model)')
    && worldInitBundle.includes('providerId: settings.provider'),
  'background world initialization must use the same managed credential and model fallback authority',
)
assertOk(
  aiClient.includes('options?.providerId ?? DEFAULT_AI_PROVIDER_ID')
    && aiClient.includes('proxyBody.model = DEFAULT_AI_MODEL')
    && aiClient.includes('providerId === DEFAULT_AI_PROVIDER_ID')
    && aiClient.includes("{ type: 'enabled' }")
    && runtimeCallers.includes('customModel || DEFAULT_AI_MODEL')
    && !runtimeCallers.includes("customModel || 'deepseek-v4-flash'"),
  'AI client and runtime fallback callers must use the managed default authority',
)
assertOk(
  store.includes('provider: DEFAULT_AI_PROVIDER_ID')
    && store.includes('customUrl: DEFAULT_AI_BASE_URL')
    && store.includes('customModel: DEFAULT_AI_MODEL')
    && store.includes('version: 7'),
  'new users and restore-default state must select the managed provider without a browser key',
)
assertOk(
  store.includes('hasExplicitModelConfig')
    && store.includes("state.provider === 'custom'")
    && store.includes("version < 7 && state.provider === DEFAULT_AI_PROVIDER_ID")
    && store.includes('LEGACY_MANAGED_AI_PROVIDER_ID'),
  'migration must move empty managed defaults to LongCat while preserving player-owned old-channel keys',
)
assertOk(
  provider.includes('免费体验（龙猫）')
    && provider.includes('免费体验（原通道）')
    && settings.includes('服务器免费体验通道')
    && settings.includes('setCustomKey(\'\')')
    && settings.includes('setProvider(DEFAULT_AI_PROVIDER_ID)')
    && settings.includes('markConnectionUntested(DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL)'),
  'settings reset must clear only the browser key and restore the managed public configuration',
)
assertOk(
  /LONGCAT_API_KEY=\r?\n/.test(envExample) && /MANAGED_AI_API_KEY=\r?\n/.test(envExample),
  'environment example must declare empty slots for both managed credentials',
)

if (failed > 0) process.exit(1)
console.log('PASS: managed-ai-default-regression')
