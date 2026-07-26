#!/usr/bin/env node

import assert from 'node:assert/strict'

import { requestManagedAggregatedCompletion } from '../../../../src/core/ai-service/managed-provider-execution.ts'
import { aggregateSseCompletion } from '../../../../src/core/ai-service/managed-sse-aggregation.ts'
import {
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
  LEGACY_MANAGED_AI_FALLBACK_MODEL,
  LEGACY_MANAGED_AI_MODEL,
  LEGACY_MANAGED_AI_PROVIDER_ID,
  getProviderModelCandidates,
  shouldTryManagedFallback,
} from '../../../../src/core/ai-service/provider-config.ts'

const encoder = new TextEncoder()

assert.deepEqual(
  getProviderModelCandidates(DEFAULT_AI_PROVIDER_ID, DEFAULT_AI_MODEL),
  [DEFAULT_AI_MODEL],
  'the LongCat default must stay on its fixed public model without cross-provider fallback',
)
assert.deepEqual(
  getProviderModelCandidates(LEGACY_MANAGED_AI_PROVIDER_ID, LEGACY_MANAGED_AI_MODEL),
  [LEGACY_MANAGED_AI_MODEL, LEGACY_MANAGED_AI_FALLBACK_MODEL],
  'the retained a6api channel must try its public primary model before its internal fallback',
)
assert.deepEqual(
  getProviderModelCandidates('deepseek', 'deepseek-v4-flash'),
  ['deepseek-v4-flash'],
  'official local providers must never inherit the managed fallback route',
)
assert.deepEqual(
  getProviderModelCandidates(DEFAULT_AI_PROVIDER_ID, 'tampered-model'),
  [],
  'a browser request must not choose an arbitrary managed model',
)
assert.equal(shouldTryManagedFallback(429), true, 'rate limiting should allow the managed fallback')
assert.equal(shouldTryManagedFallback(500), true, 'temporary upstream failures should allow the managed fallback')
assert.equal(shouldTryManagedFallback(401), false, 'credential failures must not be hidden by a model fallback')

function streamFromBytes(bytes, splitPoints = []) {
  const boundaries = [0, ...splitPoints, bytes.length]
  return new ReadableStream({
    start(controller) {
      for (let index = 0; index < boundaries.length - 1; index++) {
        const start = boundaries[index]
        const end = boundaries[index + 1]
        if (end > start) controller.enqueue(bytes.slice(start, end))
      }
      controller.close()
    },
  })
}

async function expectRejects(sse, expectedMessage) {
  await assert.rejects(
    () => aggregateSseCompletion(streamFromBytes(encoder.encode(sse))),
    (error) => error instanceof Error && error.message.includes(expectedMessage),
  )
}

const completeContent = `第一段${'完整语义'.repeat(1500)}尾声`
const validSse = [
  `data: ${JSON.stringify({ id: 'chat-1', created: 1, model: 'gpt-5.6-luna-build', choices: [{ delta: { content: completeContent.slice(0, 4096) } }] })}\n\n`,
  `data: ${JSON.stringify({ choices: [{ delta: { content: completeContent.slice(4096) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\n`,
  'data: [DONE]\n\n',
].join('')
const validBytes = encoder.encode(validSse)
const aggregated = await aggregateSseCompletion(streamFromBytes(validBytes, [1, 17, 113, 4097, validBytes.length - 3]))
const parsed = JSON.parse(aggregated.responseBody)

assert.equal(parsed.choices[0].message.content, completeContent, 'SSE aggregation must preserve the complete content')
assert.equal(aggregated.contentChars, completeContent.length, 'content length must describe the complete result')
assert.equal(parsed.model, 'gpt-5.6-luna-build', 'upstream model metadata should survive aggregation')
assert.deepEqual(parsed.usage, { prompt_tokens: 10, completion_tokens: 20 }, 'usage should survive aggregation when provided')
assert.equal(aggregated.rawResponseBody, validSse, 'managed aggregation must expose the exact raw SSE for archival')

const attemptedModels = []
const fallbackResult = await requestManagedAggregatedCompletion({
  providerId: LEGACY_MANAGED_AI_PROVIDER_ID,
  requestedModel: LEGACY_MANAGED_AI_MODEL,
  apiUrl: 'https://managed.example/v1/chat/completions',
  apiKey: 'test-key',
  forwardBody: { messages: [{ role: 'user', content: 'fallback smoke' }] },
  clientSignal: new AbortController().signal,
  timeoutMs: 1_000,
  fetchImpl: async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body))
    attemptedModels.push(requestBody.model)
    if (requestBody.model === LEGACY_MANAGED_AI_MODEL) {
      return new Response(
        streamFromBytes(encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }
    return new Response(streamFromBytes(encoder.encode(validSse)), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  },
})
assert.equal(fallbackResult.kind, 'success', 'an incomplete primary stream must safely retry the managed fallback')
assert.equal(fallbackResult.model, LEGACY_MANAGED_AI_FALLBACK_MODEL, 'the successful result must identify the fallback model')
assert.deepEqual(
  attemptedModels,
  [LEGACY_MANAGED_AI_MODEL, LEGACY_MANAGED_AI_FALLBACK_MODEL],
  'fallback execution must preserve the declared model order',
)

let authAttempts = 0
const authFailureResult = await requestManagedAggregatedCompletion({
  providerId: LEGACY_MANAGED_AI_PROVIDER_ID,
  requestedModel: LEGACY_MANAGED_AI_MODEL,
  apiUrl: 'https://managed.example/v1/chat/completions',
  apiKey: 'invalid-test-key',
  forwardBody: { messages: [{ role: 'user', content: 'auth smoke' }] },
  clientSignal: new AbortController().signal,
  timeoutMs: 1_000,
  fetchImpl: async () => {
    authAttempts++
    return Response.json({ error: { message: 'unauthorized' } }, { status: 401 })
  },
})
assert.equal(authFailureResult.kind, 'upstream-error', 'authentication failure must remain explicit')
assert.equal(authAttempts, 1, 'authentication failure must not spend a second request on the fallback model')

await expectRejects('data: {"choices":[{"delta":{"content":"未完成"}}]}\n\n', '完整结束标记')
await expectRejects('data: {not-json}\n\ndata: [DONE]\n\n', '无法解析')
await expectRejects('data: [DONE]\n\n', '空正文')
await expectRejects(
  'data: {"choices":[{"delta":{"content":"被截断正文"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
  '达到 max_tokens',
)

console.log('PASS: managed-sse-aggregation-smoke')
