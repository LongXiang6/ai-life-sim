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
const serverTargets = read('src/core/ai-service/server-provider-targets.ts')
const aiServiceIndex = read('src/core/ai-service/index.ts')
const managedAggregation = read('src/core/ai-service/managed-sse-aggregation.ts')
const managedExecution = read('src/core/ai-service/managed-provider-execution.ts')
const worldInitRoute = read('src/app/api/world-init/route.ts')
const worldInitBundle = read('src/mods/mod-world/world-init-bundle.ts')
const store = read('src/mods/mod-settings/store.ts')
const settings = read('src/mods/mod-settings/components/SettingsTabPresets.tsx')
const settingsTheme = read('src/mods/mod-settings/components/SettingsTabTheme.tsx')
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
    && provider.includes("DEFAULT_AI_MODEL = 'LongCat-2.0'")
    && provider.includes("LEGACY_MANAGED_AI_PROVIDER_ID = 'managed-a6'")
    && provider.includes("LEGACY_MANAGED_AI_MODEL = 'gpt-5.6-luna'")
    && provider.includes("LEGACY_MANAGED_AI_FALLBACK_MODEL = 'gpt-5.6-terra'")
    && !provider.includes('DEFAULT_AI_BASE_URL')
    && !provider.includes('LEGACY_MANAGED_AI_BASE_URL')
    && !/managed:\s*\{[\s\S]{0,220}baseUrl:/.test(provider)
    && !/\[LEGACY_MANAGED_AI_PROVIDER_ID\]:\s*\{[\s\S]{0,220}baseUrl:/.test(provider),
  'browser Provider metadata must expose managed IDs and models without either managed target URL',
)
assertOk(
  !/(?:sk-|ak_)[A-Za-z0-9_-]{20,}/.test(provider + proxy + serverCredentials + serverTargets + managedAggregation + managedExecution + worldInitRoute + worldInitBundle + store + settings + envExample),
  'tracked sources must not contain an API credential',
)
assertOk(
  serverCredentials.includes("managed: 'LONGCAT_API_KEY'")
    && serverCredentials.includes("'managed-a6': 'MANAGED_AI_API_KEY'")
    && serverTargets.includes("managed: 'LONGCAT_BASE_URL'")
    && serverTargets.includes("'managed-a6': 'MANAGED_A6_BASE_URL'")
    && serverTargets.includes("import 'server-only'")
    && !aiServiceIndex.includes('server-provider-targets')
    && proxy.includes('readServerProviderApiKey(providerId)')
    && proxy.includes('readServerProviderBaseUrl(providerId)')
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
    && worldInitRoute.includes('readServerProviderBaseUrl(providerId)')
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
    && store.includes("customUrl: ''")
    && store.includes('customModel: DEFAULT_AI_MODEL')
    && store.includes('version: 8'),
  'new users and restore-default state must select the managed provider without browser Key or URL',
)
assertOk(
  store.includes('hasExplicitModelConfig')
    && store.includes("state.provider === 'custom'")
    && store.includes('version < 8')
    && store.includes("migrated.provider = 'custom'")
    && store.includes("migrated.customUrl = ''"),
  'migration must clear preset URLs while converting player-owned preset overrides to custom configuration',
)
assertOk(
  store.includes('normalizeImportedModelSettings')
    && store.includes("return { provider: 'custom', customKey, customUrl, customModel }")
    && store.includes("customUrl: ''")
    && settingsTheme.includes('normalizeImportedModelSettings(settings)')
    && !settingsTheme.includes("if (typeof settings.customUrl === 'string') setCustomUrl(settings.customUrl)"),
  'settings import must not restore a managed target URL into browser state while preserving complete player-owned custom data',
)
assertOk(
  provider.includes('免费体验（龙猫）')
    && provider.includes('免费体验（原通道）')
    && settings.includes('服务器预设模式不显示或保存 API 网址与 Key')
    && settings.includes("provider === 'custom'")
    && settings.includes('使用自己的 API')
    && settings.includes('setCustomKey(\'\')')
    && settings.includes('setCustomUrl(\'\')')
    && settings.includes('setProvider(DEFAULT_AI_PROVIDER_ID)')
    && settings.includes("connectionTargetKey(DEFAULT_AI_PROVIDER_ID, '')"),
  'preset UI and reset must hide managed URL fields and keep a separate custom-API path',
)
assertOk(
  /LONGCAT_API_KEY=\r?\n/.test(envExample)
    && /LONGCAT_BASE_URL=\r?\n/.test(envExample)
    && /MANAGED_AI_API_KEY=\r?\n/.test(envExample)
    && /MANAGED_A6_BASE_URL=\r?\n/.test(envExample),
  'environment example must declare empty private slots for both managed credentials and targets',
)

if (failed > 0) process.exit(1)
console.log('PASS: managed-ai-default-regression')
