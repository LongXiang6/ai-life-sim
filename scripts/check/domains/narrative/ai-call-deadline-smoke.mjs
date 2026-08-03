/**
 * Purpose: Verify narrative budgets and the shared browser/proxy total-deadline lifecycle.
 * Owner: quality:narrative
 * Responsibility: AI deadline fault injection only; deadline computation and transport remain owned by core and proxy modules.
 */

import fs from 'node:fs/promises'
import { readModuleSource } from '../../lib/read-module-source.mjs'

import { POST } from '../../../../src/app/api/proxy/route.ts'
import {
  buildProxyBody,
  callAI,
} from '../../../../src/core/ai-service/ai-client.ts'
import {
  computeAiCallDeadlineMs,
} from '../../../../src/core/ai-service/ai-call-deadline.ts'
import {
  computeNarrativeMaxTokens,
} from '../../../../src/mods/mod-engine/constants/narrative-config.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

function abortError(message) {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

const maxTokens2000 = computeNarrativeMaxTokens(2000)
const narrativeDeadlineMs = computeAiCallDeadlineMs({
  callKind: 'narrative-main',
  maxTokens: maxTokens2000,
  reasoningEffort: 'disabled',
})
assertOk(
  maxTokens2000 === 2688,
  'the 2000-character setting must budget against the legal 2400-character upper bound',
)
assertOk(
  narrativeDeadlineMs === 155_000 && narrativeDeadlineMs > 90_000,
  'the 2000-character main narrative must receive a workload deadline above the old fixed 90 seconds',
)
assertOk(
  computeAiCallDeadlineMs({
    callKind: 'narrative-main',
    maxTokens: maxTokens2000,
    reasoningEffort: 'high',
  }) > narrativeDeadlineMs,
  'reasoning effort must increase the same workload deadline contract',
)

const config = {
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  maxTokens: maxTokens2000,
  reasoningEffort: 'disabled',
}
const proxyBody = buildProxyBody(
  config,
  [{ role: 'user', content: '生成完整长篇故事' }],
  false,
  'narrative',
  'deadline-contract',
  {
    providerId: 'custom',
    customBaseUrl: 'https://api.deepseek.com/v1',
    customModel: 'deepseek-v4-flash',
    logContext: { callKind: 'narrative-main' },
    reasoningEffort: 'disabled',
  },
)
assertOk(
  proxyBody.max_tokens === maxTokens2000
    && proxyBody.deadline_context?.callKind === 'narrative-main'
    && proxyBody.deadline_context?.reasoningEffort === 'disabled',
  'the browser request must carry the exact shared deadline inputs consumed by the proxy',
)

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const fastDeadlineTimer = (callback, delay, ...args) => (
  originalSetTimeout(callback, Number(delay) >= 60_000 ? 0 : delay, ...args)
)

let browserReadStarted = false
let browserAbortObserved = false
globalThis.setTimeout = fastDeadlineTimer
globalThis.fetch = async (_input, init) => ({
  status: 200,
  ok: true,
  headers: new Headers(),
  json: () => new Promise((_resolve, reject) => {
    browserReadStarted = true
    const signal = init?.signal
    const rejectAborted = () => {
      browserAbortObserved = true
      reject(abortError('browser deadline injected'))
    }
    if (signal?.aborted) rejectAborted()
    else signal?.addEventListener('abort', rejectAborted, { once: true })
  }),
})
try {
  await Promise.race([
    callAI('system', 'user', {
      config: { ...config, maxTokens: 1 },
      pool: 'narrative',
      providerId: 'custom',
      customBaseUrl: 'https://api.deepseek.com/v1',
      customModel: 'deepseek-v4-flash',
      apiKey: 'test-only-placeholder',
      reasoningEffort: 'disabled',
      logContext: { callKind: 'narrative-main' },
    }).then(() => {
      throw new Error('browser deadline injection must reject')
    }).catch((error) => {
      if (error?.name !== 'AbortError') throw error
    }),
    new Promise((_, reject) => originalSetTimeout(
      () => reject(new Error('browser deadline guard was cleared before body completion')),
      1_000,
    )),
  ])
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
  failed += 1
} finally {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
}
assertOk(
  browserReadStarted && browserAbortObserved,
  'the browser total deadline must remain active after response headers while JSON body reading is pending',
)

let proxyReadStarted = false
let proxyAbortObserved = false
globalThis.setTimeout = fastDeadlineTimer
globalThis.fetch = async (_input, init) => ({
  status: 200,
  ok: true,
  headers: new Headers({ 'content-type': 'application/json' }),
  body: null,
  text: () => new Promise((_resolve, reject) => {
    proxyReadStarted = true
    const signal = init?.signal
    const rejectAborted = () => {
      proxyAbortObserved = true
      reject(abortError('proxy deadline injected'))
    }
    if (signal?.aborted) rejectAborted()
    else signal?.addEventListener('abort', rejectAborted, { once: true })
  }),
})
try {
  const response = await Promise.race([
    POST(new Request('http://localhost/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cache_pool: 'narrative-main',
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: '生成完整长篇故事' }],
        max_tokens: 1,
        stream: false,
        thinking: { type: 'disabled' },
        providerId: 'custom',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'test-only-placeholder',
        deadline_context: {
          callKind: 'narrative-main',
          reasoningEffort: 'disabled',
        },
      }),
    })),
    new Promise((_, reject) => originalSetTimeout(
      () => reject(new Error('proxy deadline guard was cleared before body completion')),
      1_000,
    )),
  ])
  const body = await response.json()
  assertOk(
    response.status === 504 && String(body.error).includes('工作量总时限'),
    'the proxy must publish a 504 workload deadline result when body reading exceeds the shared limit',
  )
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
  failed += 1
} finally {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
}
assertOk(
  proxyReadStarted && proxyAbortObserved,
  'the proxy total deadline must remain active after upstream headers while the response body is pending',
)

const [clientSource, proxySource] = await Promise.all([
  Promise.resolve(readModuleSource('src/core/ai-service/ai-client.ts')),
  fs.readFile(new URL('../../../../src/app/api/proxy/route.ts', import.meta.url), 'utf8'),
])
assertOk(
  !clientSource.includes('const TIMEOUT_MS = 90000')
    && clientSource.includes('fetchWithDeadline')
    && clientSource.includes('await handleStreamResponse')
    && proxySource.includes('computeAiCallDeadlineMs')
    && !proxySource.includes('UPSTREAM_TIMEOUT_MS')
    && proxySource.includes('AI_STREAM_IDLE_TIMEOUT_MS'),
  'browser and proxy must share workload deadlines while streams retain an independent idle timeout',
)

if (failed > 0) process.exit(1)
console.log('PASS: ai-call-deadline-smoke')
process.exit(0)
