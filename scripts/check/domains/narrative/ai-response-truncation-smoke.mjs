import assert from 'node:assert/strict'

import {
  AIResponseTruncatedError,
  callAI,
  callAIStream,
} from '../../../../src/core/ai-service/ai-client.ts'

const config = {
  model: 'deepseek-v4-pro',
  temperature: 0,
  maxTokens: 128,
  stream: false,
  reasoningEffort: 'disabled',
}

function assertTruncation(error, expected) {
  assert(error instanceof AIResponseTruncatedError)
  assert.equal(error.name, 'AIResponseTruncatedError')
  assert.equal(error.finishReason, 'length')
  assert.equal(error.requestId, expected.requestId)
  assert.equal(error.maxTokens, config.maxTokens)
  assert.equal(error.content, expected.content)
  assert.equal(error.responseLength, expected.content.length)
  return true
}

const originalFetch = globalThis.fetch
try {
  let nonStreamRequests = 0
  const nonStreamContent = '{"未完成":'
  globalThis.fetch = async () => {
    nonStreamRequests += 1
    return new Response(JSON.stringify({
      choices: [{
        message: { content: nonStreamContent },
        finish_reason: 'length',
      }],
      usage: {
        completion_tokens: config.maxTokens,
        total_tokens: config.maxTokens + 32,
      },
    }), {
      status: 200,
      headers: { 'x-ai-request-id': 'truncation-non-stream' },
    })
  }

  await assert.rejects(
    () => callAI('system', 'user', {
      config,
      reasoningEffort: 'disabled',
    }),
    (error) => assertTruncation(error, {
      content: nonStreamContent,
      requestId: 'truncation-non-stream',
    }),
  )
  assert.equal(nonStreamRequests, 1, 'non-stream truncation must not enter ordinary retries')

  let streamRequests = 0
  let resetCount = 0
  const streamContent = '半截响应'
  globalThis.fetch = async () => {
    streamRequests += 1
    const body = [
      `data: {"choices":[{"delta":{"content":"${streamContent}"},"finish_reason":"length"}],"usage":{"completion_tokens":128,"total_tokens":160}}\n\n`,
      'data: [DONE]\n\n',
    ].join('')
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-ai-request-id': 'truncation-stream',
      },
    })
  }

  await assert.rejects(
    () => callAIStream('system', 'user', {
      config: { ...config, stream: true },
      reasoningEffort: 'disabled',
      onResetStream: () => {
        resetCount += 1
      },
    }),
    (error) => assertTruncation(error, {
      content: streamContent,
      requestId: 'truncation-stream',
    }),
  )
  assert.equal(streamRequests, 1, 'stream truncation must not enter ordinary retries')
  assert.equal(resetCount, 0, 'terminal truncation must not reset the consumer for another attempt')
} finally {
  globalThis.fetch = originalFetch
}

console.log('[ai-response-truncation-smoke] PASS')
