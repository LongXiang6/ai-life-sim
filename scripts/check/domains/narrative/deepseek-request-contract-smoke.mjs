/**
 * Purpose: Verify custom and official DeepSeek request-body, retry, and JSON-repair contracts.
 * Owner: quality:narrative
 * Responsibility: DeepSeek request regression only; provider implementation remains in core AI service and proxy owners.
 */

import fs from 'node:fs/promises'
import { z } from 'zod'
import { readModuleSource } from '../../lib/read-module-source.mjs'
import { POST } from '../../../../src/app/api/proxy/route.ts'
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
  assert(enabled.cache_pool === 'narrative-main', 'ordinary narrative calls must resolve the main internal cache pool')

  const disabled = body('custom', 'deepseek-v4-pro', 'disabled', stream)
  assert(disabled.thinking?.type === 'disabled', 'custom DeepSeek disabled reasoning must be explicit')
}

const maximum = body('custom', 'deepseek-v4-pro', 'max')
assert(maximum.thinking?.type === 'enabled' && maximum.reasoning_effort === 'max', 'player-owned DeepSeek must map maximum reasoning explicitly')

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
    && actualNarrativeBody.reasoning_effort === 'high'
    && actualNarrativeBody.cache_pool === 'narrative-main',
  'ordinary narrative calls must preserve the player-selected DeepSeek reasoning mode',
)

function routeRequest(cachePool, model = 'deepseek-v4-flash', seed = 42) {
  return new Request('http://localhost/api/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': '203.0.113.24',
    },
    body: JSON.stringify({
      cache_pool: cachePool,
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 16,
      stream: false,
      seed,
      thinking: model.toLowerCase().includes('deepseek') ? { type: 'disabled' } : undefined,
      providerId: 'custom',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-only-placeholder',
      deadline_context: {
        callKind: cachePool,
        reasoningEffort: 'disabled',
      },
    }),
  })
}

const forwardedBodies = []
globalThis.fetch = async (_input, init) => {
  forwardedBodies.push(JSON.parse(String(init?.body)))
  return new Response(JSON.stringify({
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
try {
  for (const request of [
    routeRequest('narrative-main'),
    routeRequest('narrative-main'),
    routeRequest('narrative-data-analysis'),
    routeRequest('narrative-main', 'gpt-compatible-model', 73),
  ]) {
    const response = await POST(request)
    assert(response.status === 200, 'mocked proxy identity request must succeed')
    await response.text()
  }
} finally {
  globalThis.fetch = originalFetch
}
assert(
  forwardedBodies[0]?.user_id === forwardedBodies[1]?.user_id,
  'the same trusted subject and cache pool must reuse one stable DeepSeek user_id',
)
assert(
  forwardedBodies[0]?.user_id !== forwardedBodies[2]?.user_id,
  'different internal cache pools must use isolated DeepSeek user_id values',
)
assert(
  forwardedBodies.slice(0, 3).every((request) => request.seed === undefined && request.user === undefined),
  'DeepSeek upstream requests must omit seed and generic user fields',
)
assert(
  forwardedBodies[3]?.seed === 73 && typeof forwardedBodies[3]?.user === 'string',
  'non-DeepSeek targets must retain their declared seed and generic trusted user field',
)

const repairRequests = []
globalThis.fetch = async (input, init) => {
  if (String(input) !== '/api/proxy') return new Response(null, { status: 204 })
  repairRequests.push(JSON.parse(String(init?.body)))
  const content = repairRequests.length === 1
    ? '{"系统操作":"不是数组"}'
    : '{"系统操作":[]}'
  return new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: 'stop' }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
let repairedJson
try {
  repairedJson = await callAI('system', 'user', {
    config: { ...config, reasoningEffort: 'disabled' },
    pool: 'narrative',
    providerId: 'custom',
    customBaseUrl: 'https://example.invalid/v1',
    customModel: 'deepseek-v4-pro',
    apiKey: 'test-only-placeholder',
    reasoningEffort: 'disabled',
    jsonMode: true,
    strictSchema: true,
    outputSchema: z.object({ 系统操作: z.array(z.unknown()) }).strict(),
    logContext: { callKind: 'narrative-data-analysis' },
  })
} finally {
  globalThis.fetch = originalFetch
}
assert(repairedJson === '{"系统操作":[]}', 'JSON validation must return the successful repair response')
assert(repairRequests.length === 2, 'JSON validation must make at most one format-repair request')
assert(
  repairRequests[0]?.cache_pool === 'narrative-data-analysis'
    && repairRequests[1]?.cache_pool === 'narrative-data-analysis-repair',
  'JSON repair must switch from the ordinary structured-analysis pool to its repair pool',
)
assert(
  repairRequests[1]?.messages?.at(-1)?.content?.includes('前次输出不是合格的纯 JSON 对象')
    && repairRequests[1]?.messages?.at(-1)?.content?.includes('{"系统操作":"不是数组"}'),
  'the single JSON repair request must carry the schema failure and complete original response',
)

const [clientSource, proxySource, settingsSource] = await Promise.all([
  Promise.resolve(readModuleSource('src/core/ai-service/ai-client.ts')),
  fs.readFile(new URL('../../../../src/app/api/proxy/route.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../../../../src/mods/mod-settings/components/SettingsTabPresets.tsx', import.meta.url), 'utf8'),
])
assert(
  /error\.status === 408 \|\| error\.status === 429 \|\| error\.status >= 500/.test(clientSource),
  'deterministic 400 responses must not enter the internal retry path',
)
assert(
  proxySource.includes("normalizedModel.includes('deepseek')")
    && proxySource.includes("forwardBody.thinking = { type: 'enabled', budget_tokens:"),
  'proxy must defensively normalize legacy custom DeepSeek thinking bodies',
)
assert(
  settingsSource.includes("thinking: testModel.toLowerCase().includes('deepseek')")
    && settingsSource.includes("? { type: 'disabled' }")
    && settingsSource.includes("cache_pool: 'connectivity-test'"),
  'connection tests must send the custom DeepSeek disabled-thinking contract in a dedicated cache pool',
)

console.log('[deepseek-request-contract-smoke] PASS')
process.exit(0)
