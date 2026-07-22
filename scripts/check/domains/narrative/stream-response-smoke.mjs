/**
 * 浏览器侧 SSE 聚合回归：正文、推理隔离、终态与空闲超时。
 */

import assert from 'node:assert/strict'

import { handleStreamResponse } from '../../../../src/core/ai-service/ai-client.ts'

const encoder = new TextEncoder()

function responseFromChunks(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
}

const emitted = []
const complete = await handleStreamResponse(responseFromChunks([
  'data: {"choices":[{"delta":{"reasoning_content":"内部推理不得显示"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"完整"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"正文"},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]',
]), (chunk) => emitted.push(chunk))

assert.equal(complete.content, '完整正文', 'the final SSE event may omit its trailing newline')
assert.equal(emitted.join(''), '完整正文', 'visible chunks must contain body text only')
assert(!complete.content.includes('内部推理'), 'reasoning_content must never enter the narrative body')

await assert.rejects(
  () => handleStreamResponse(responseFromChunks([
    'data: {"choices":[{"delta":{"content":"半截正文"}}]}\n\n',
  ])),
  /完整结束标记/,
)

await assert.rejects(
  () => handleStreamResponse(responseFromChunks([
    'data: {"choices":[{"delta":{"content":"被截断正文"},"finish_reason":"length"}]}\n\n',
    'data: [DONE]\n\n',
  ])),
  /达到 max_tokens/,
)

await assert.rejects(
  () => handleStreamResponse(responseFromChunks([
    'data: {"choices":[{"delta":{"reasoning_content":"只有推理"}}]}\n\n',
    'data: [DONE]\n\n',
  ])),
  /响应为空/,
)

const stalledResponse = new Response(new ReadableStream({ start() {} }))
await assert.rejects(
  () => handleStreamResponse(stalledResponse, undefined, 5),
  /超过 5ms 未产生新数据/,
)

console.log('PASS: stream-response-smoke')
