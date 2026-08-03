/**
 * Purpose: Parse the provider SSE response into validated text, usage, and finish state.
 * Owner: core:ai-service
 * Responsibility: Stream decoding and terminal validation only; request creation and retry policy are external.
 */

import { mergeStreamTextChunk, isValidAiContent } from '../stream-text-extractor'
import { readStreamWithIdleTimeout, AI_STREAM_IDLE_TIMEOUT_MS } from '../stream-timeout'
import { AIResponseTruncatedError } from './errors'
import { parseUsage } from './response-utils'
import type { AIResponse, FetchAIResult } from './types'

export async function handleStreamResponse(
  response: Response,
  onChunk?: (text: string) => void,
  idleTimeoutMs = AI_STREAM_IDLE_TIMEOUT_MS,
): Promise<FetchAIResult> {
  const reader = response.body?.getReader()
  if (!reader) return { content: '' }

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''
  let usage: FetchAIResult['usage']
  let finishReason: string | undefined
  let sawDoneMarker = false
  let malformedEventCount = 0

  try {
    const consumeLine = (line: string): void => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) return
      const jsonText = trimmed.slice(5).trim()
      if (!jsonText) return
      if (jsonText === '[DONE]') {
        sawDoneMarker = true
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(jsonText)
      } catch {
        malformedEventCount += 1
        return
      }

      const previousLength = fullText.length
      fullText = mergeStreamTextChunk(fullText, parsed)
      const emitted = fullText.slice(previousLength)
      if (emitted) onChunk?.(emitted)
      const record = parsed as {
        usage?: AIResponse['usage']
        choices?: Array<{ finish_reason?: unknown }>
      }
      if (record.usage) usage = parseUsage(record.usage)
      const chunkFinishReason = record.choices?.[0]?.finish_reason
      if (typeof chunkFinishReason === 'string' && chunkFinishReason) finishReason = chunkFinishReason
    }

    while (true) {
      const { done, value } = await readStreamWithIdleTimeout(reader, idleTimeoutMs)
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) consumeLine(line)
    }
    buffer += decoder.decode()
    if (buffer.trim()) consumeLine(buffer)
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }

  if (!sawDoneMarker && !finishReason) {
    throw new Error(
      `AI 流式响应未返回完整结束标记${malformedEventCount > 0 ? `（另有 ${malformedEventCount} 个无法解析事件）` : ''}`,
    )
  }
  if (finishReason === 'length') {
    throw new AIResponseTruncatedError(
      fullText,
      finishReason,
      response.headers.get('x-ai-request-id') ?? undefined,
      usage,
    )
  }
  if (!isValidAiContent(fullText)) throw new Error('AI 流式响应为空')
  return { content: fullText, usage, finishReason }
}
