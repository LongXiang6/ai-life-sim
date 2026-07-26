/** 自定义与官方 DeepSeek 请求体契约回归。 */

import fs from 'node:fs/promises'
import {
  buildProxyBody,
  callAI,
} from '../../../../src/core/ai-service/ai-client.ts'

const config = {
  model: 'deepseek-v4-pro',
  temperature: 0.7,
  maxTokens: 4096,
  stream: false,
  reasoningEffort: 'high',
}
const messages = [{ role: 'user', content: 'ping' }]

function body(providerId, model, reasoningEffort, stream = false) {
  return buildProxyBody(config, messages, stream, 'narrative', 'contract-test', {
    providerId,
    customModel: providerId === 'custom' ? model : undefined,
    reasoningEffort,
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

for (const stream of [false, true]) {
  const enabled = body('custom', 'deepseek-v4-pro', 'high', stream)
  assert(enabled.stream === stream, 'stream and non-stream requests must use the requested mode')
  assert(enabled.thinking?.type === 'enabled', 'custom DeepSeek enabled reasoning must include type=enabled')
  assert(enabled.reasoning_effort === 'high', 'custom DeepSeek high reasoning must use reasoning_effort=high')
  assert(enabled.thinking?.budget_tokens === undefined, 'new DeepSeek reasoning requests must not send legacy token budgets')
  assert(enabled.temperature === undefined && enabled.top_p === undefined, 'DeepSeek thinking mode must omit ineffective sampling parameters')
  assert(stream === Boolean(enabled.stream_options?.include_usage), 'DeepSeek streams must request final usage statistics')

  const disabled = body('custom', 'deepseek-v4-pro', 'disabled', stream)
  assert(disabled.thinking?.type === 'disabled', 'custom DeepSeek disabled reasoning must be explicit')
}

const official = body('deepseek', 'deepseek-v4-pro', 'max')
assert(official.thinking?.type === 'enabled' && official.reasoning_effort === 'max', 'official DeepSeek must map maximum reasoning explicitly')

const genericCustom = body('custom', 'gpt-compatible-model', 'high')
assert(genericCustom.thinking === undefined && genericCustom.reasoning_effort === undefined, 'generic custom models must not inherit DeepSeek reasoning fields')

const originalFetch = globalThis.fetch
let proxyRequestCount = 0
let actualNarrativeBody
globalThis.fetch = async (input, init) => {
  if (String(input) === '/api/proxy') {
    proxyRequestCount += 1
    actualNarrativeBody = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ error: 'invalid thinking payload' }), {
      status: 400,
      headers: { 'x-ai-request-id': 'request-contract-400' },
    })
  }
  return new Response(null, { status: 204 })
}
try {
  await callAI('system', 'user', {
    config,
    providerId: 'custom',
    customBaseUrl: 'https://example.invalid/v1',
    customModel: 'deepseek-v4-pro',
    apiKey: 'test-only-placeholder',
    reasoningEffort: 'high',
  })
  throw new Error('mocked 400 must reject the AI call')
} catch (error) {
  assert(error?.status === 400, 'mocked deterministic failure must retain status 400')
} finally {
  globalThis.fetch = originalFetch
}
assert(proxyRequestCount === 1, 'deterministic 400 must issue exactly one proxy request')
assert(
  actualNarrativeBody?.thinking?.type === 'enabled'
    && actualNarrativeBody.reasoning_effort === 'high',
  'ordinary narrative calls must preserve the player-selected DeepSeek reasoning mode',
)

const [clientSource, proxySource, settingsSource] = await Promise.all([
  fs.readFile(new URL('../../../../src/core/ai-service/ai-client.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../../../../src/app/api/proxy/route.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../../../../src/mods/mod-settings/components/SettingsTabPresets.tsx', import.meta.url), 'utf8'),
])
assert(
  /error\.status === 408 \|\| error\.status === 429 \|\| error\.status >= 500/.test(clientSource),
  'deterministic 400 responses must not enter the internal retry path',
)
assert(
  proxySource.includes("providerId === 'custom' && normalizedModel.includes('deepseek')"),
  'proxy must defensively normalize legacy custom DeepSeek thinking bodies',
)
assert(
  settingsSource.includes("provider === 'custom' && testModel.toLowerCase().includes('deepseek')"),
  'connection tests must send the custom DeepSeek disabled-thinking contract',
)

console.log('[deepseek-request-contract-smoke] PASS')
