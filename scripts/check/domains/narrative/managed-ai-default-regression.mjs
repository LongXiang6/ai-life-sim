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
  read('src/mods/mod-settings/components/SettingsTabPrompt.tsx'),
].join('\n')
const envExample = read('.env.example')

assertOk(
  provider.includes("DEFAULT_AI_PROVIDER_ID = 'managed'")
    && provider.includes("DEFAULT_AI_BASE_URL = 'https://a6.a6api.com/v1'")
    && provider.includes("DEFAULT_AI_MODEL = 'gpt-5.6-luna'")
    && provider.includes("DEFAULT_AI_FALLBACK_MODEL = 'gpt-5.6-terra'"),
  'public managed provider, base URL, primary model and server fallback must have one authority',
)
assertOk(!/sk-[A-Za-z0-9_-]{20,}/.test(provider + proxy + serverCredentials + managedAggregation + managedExecution + worldInitRoute + worldInitBundle + store + settings + envExample), 'tracked sources must not contain an API credential')
assertOk(
  serverCredentials.includes("managed: 'MANAGED_AI_API_KEY'")
    && proxy.includes('readServerProviderApiKey(providerId)')
    && proxy.includes('providerId === DEFAULT_AI_PROVIDER_ID')
    && proxy.includes('Managed model not allowed'),
  'proxy must read the managed credential only from server env and fix its model allowlist',
)
assertOk(
  proxy.includes('aggregateManagedStream')
    && proxy.includes('requestManagedAggregatedCompletion(')
    && proxy.includes('fallbackUsed: managedResult.model === DEFAULT_AI_FALLBACK_MODEL')
    && managedExecution.includes('aggregateSseCompletion(response.body)')
    && managedExecution.includes('shouldTryManagedFallback(response.status)')
    && managedAggregation.includes("if (!completed) throw new Error('托管通道 SSE 未返回完整结束标记')")
    && managedAggregation.includes("if (!content) throw new Error('托管通道 SSE 返回空正文')"),
  'managed non-stream requests must aggregate completely and safely switch to the fallback before returning output',
)
assertOk(
  worldInitRoute.includes('callProviderDirect')
    && worldInitRoute.includes('readServerProviderApiKey(providerId)')
    && worldInitRoute.includes('providerId === DEFAULT_AI_PROVIDER_ID')
    && worldInitRoute.includes('getProviderModelCandidates(providerId, model)')
    && worldInitBundle.includes('providerId: settings.provider'),
  'background world initialization must use the same managed credential and model fallback authority',
)
assertOk(
  aiClient.includes('options?.providerId ?? DEFAULT_AI_PROVIDER_ID')
    && aiClient.includes('proxyBody.model = DEFAULT_AI_MODEL')
    && runtimeCallers.includes('customModel || DEFAULT_AI_MODEL')
    && !runtimeCallers.includes("customModel || 'deepseek-v4-flash'"),
  'AI client and runtime fallback callers must use the managed default authority',
)
assertOk(
  store.includes('provider: DEFAULT_AI_PROVIDER_ID')
    && store.includes('customUrl: DEFAULT_AI_BASE_URL')
    && store.includes('customModel: DEFAULT_AI_MODEL')
    && store.includes('version: 6'),
  'new users and restore-default state must select the managed provider without a browser key',
)
assertOk(
  store.includes('hasExplicitModelConfig')
    && store.includes("state.provider === 'custom'")
    && store.includes("version < 6 && state.provider === DEFAULT_AI_PROVIDER_ID"),
  'migration must update the managed public target while preserving player-owned custom configuration',
)
assertOk(
  settings.includes('服务器免费体验通道')
    && settings.includes('setCustomKey(\'\')')
    && settings.includes('setProvider(DEFAULT_AI_PROVIDER_ID)')
    && settings.includes('markConnectionUntested(DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL)'),
  'settings reset must clear only the browser key and restore the managed public configuration',
)
assertOk(/MANAGED_AI_API_KEY=\r?\n/.test(envExample), 'environment example must declare an empty managed credential slot')

if (failed > 0) process.exit(1)
console.log('PASS: managed-ai-default-regression')
