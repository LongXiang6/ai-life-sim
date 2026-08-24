#!/usr/bin/env node
/**
 * Purpose: Regress player-owned AI settings and credential routing across active call paths.
 * Owner: quality:narrative
 * Responsibility: Static provider, proxy, world-init, and settings contract assertions only.
 */

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
const serverTargets = read('src/core/ai-service/server-provider-targets.ts')
const worldInitBundle = read('src/mods/mod-world/world-init-bundle.ts')
const store = read('src/mods/mod-settings/store.ts')
const settings = read('src/mods/mod-settings/components/SettingsTabPresets.tsx')
const modelSettings = read('src/mods/mod-settings/components/SettingsTabModel.tsx')
const apiError = read('src/core/ai-service/api-error.ts')
const mainNarrative = read('src/mods/mod-engine/helpers/main-narrative-call.ts')
const envExample = read('.env.example')
const productionEnvGate = read('scripts/ops/validate-production-env.mjs')
const settingsPersistenceVersion = Number(
  store.match(/name:\s*'mod-settings:store'[\s\S]*?version:\s*(\d+)/)?.[1],
)

assertOk(
  provider.includes("DEFAULT_AI_PROVIDER_ID = 'custom'")
    && provider.includes("DEEPSEEK_PRESET_BASE_URL = 'https://api.deepseek.com/v1'")
    && provider.includes("DEEPSEEK_PRESET_MODEL = 'deepseek-v4-flash'")
    && provider.includes('DEFAULT_AI_BASE_URL = DEEPSEEK_PRESET_BASE_URL')
    && provider.includes('DEFAULT_AI_MODEL = DEEPSEEK_PRESET_MODEL'),
  'player-owned API and DeepSeek fill defaults must come from one provider authority',
)
assertOk(
  !provider.includes('managed-a6')
    && !provider.includes('LongCat-2.0')
    && !provider.includes('免费体验')
    && !fs.existsSync(path.join(root, 'src/core/ai-service/server-provider-credentials.ts'))
    && !fs.existsSync(path.join(root, 'src/core/ai-service/managed-provider-execution.ts'))
    && !fs.existsSync(path.join(root, 'src/core/ai-service/managed-sse-aggregation.ts')),
  'removed server-managed providers must have no active source or registration',
)
assertOk(
  proxy.includes("providerId !== DEFAULT_AI_PROVIDER_ID")
    && proxy.includes("const baseUrl = body.baseUrl || ''")
    && proxy.includes("const apiKey = body.apiKey?.trim() || ''")
    && !proxy.includes('readServerProviderApiKey')
    && !proxy.includes('requestManagedAggregatedCompletion')
    && serverTargets.includes('isRegisteredProviderBaseUrl(baseUrl)'),
  'proxy must require the player request target and key without a server credential fallback',
)
assertOk(
  provider.includes('isDeepSeekOfficialBaseUrl')
    && proxy.includes('isDeepSeekOfficialBaseUrl(baseUrl)')
    && mainNarrative.includes('customBaseUrl: settings.customUrl || undefined')
    && mainNarrative.includes('apiKey: settings.customKey || undefined'),
  'protected core narrative must keep the player relay URL and key; only an official DeepSeek target may use its beta endpoint',
)
assertOk(
  !fs.existsSync(path.join(root, 'src/app/api/world-init/route.ts'))
    && worldInitBundle.includes('commitWorldInitialization')
    && !fs.existsSync(path.join(root, 'src/mods/mod-world/utils/world-init-pipeline.ts'))
    && !worldInitBundle.includes('generateWorldInitBundle')
    && !worldInitBundle.includes('startBackgroundWorldInit'),
  'world initialization must use the local commit path without a server route or retired AI enrichment pipeline',
)
assertOk(
  settingsPersistenceVersion >= 12
    && store.includes('customUrl: DEFAULT_AI_BASE_URL')
    && store.includes('normalizeImportedModelSettings')
    && store.includes('return isApiConfigured()')
    && !store.includes("fetch(`/api/proxy?"),
  'settings persistence, import, merge, and availability must stay custom-only',
)
assertOk(
  settings.includes('填入 DeepSeek 预设')
    && settings.includes('清空 Key')
    && settings.includes('apiKey: customKey.trim()')
    && settings.includes('预设按钮不会覆盖已经输入的 Key')
    && !settings.includes('vendorGrid')
    && !settings.includes('免费体验')
    && !modelSettings.includes('生成档位'),
  'settings UI must expose only player fields, DeepSeek fill, connection test, and key clearing',
)
assertOk(
  !apiError.includes('免费体验通道')
    && !envExample.includes('LONGCAT_API_KEY')
    && !envExample.includes('MANAGED_AI_API_KEY')
    && !productionEnvGate.includes('managed provider variables'),
  'player guidance and deployment validation must not point back to removed free providers',
)
assertOk(
  !/(?:sk-|ak_)[A-Za-z0-9_-]{20,}/.test(provider + proxy + serverTargets + worldInitBundle + store + settings + envExample),
  'tracked sources must not contain an API credential',
)

if (failed > 0) process.exit(1)
console.log('PASS: player-api-settings-regression')
