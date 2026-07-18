#!/usr/bin/env node

import assert from 'node:assert/strict'

import { aggregateSseCompletion } from '../../../../src/core/ai-service/managed-sse-aggregation.ts'

const encoder = new TextEncoder()

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
  `data: ${JSON.stringify({ id: 'chat-1', created: 1, model: 'grok-4.5-build', choices: [{ delta: { content: completeContent.slice(0, 4096) } }] })}\n\n`,
  `data: ${JSON.stringify({ choices: [{ delta: { content: completeContent.slice(4096) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\n`,
  'data: [DONE]\n\n',
].join('')
const validBytes = encoder.encode(validSse)
const aggregated = await aggregateSseCompletion(streamFromBytes(validBytes, [1, 17, 113, 4097, validBytes.length - 3]))
const parsed = JSON.parse(aggregated.responseBody)

assert.equal(parsed.choices[0].message.content, completeContent, 'SSE aggregation must preserve the complete content')
assert.equal(aggregated.contentChars, completeContent.length, 'content length must describe the complete result')
assert.equal(parsed.model, 'grok-4.5-build', 'upstream model metadata should survive aggregation')
assert.deepEqual(parsed.usage, { prompt_tokens: 10, completion_tokens: 20 }, 'usage should survive aggregation when provided')

await expectRejects('data: {"choices":[{"delta":{"content":"未完成"}}]}\n\n', '完整结束标记')
await expectRejects('data: {not-json}\n\ndata: [DONE]\n\n', '无法解析')
await expectRejects('data: [DONE]\n\n', '空正文')

console.log('PASS: managed-sse-aggregation-smoke')
