/**
 * Purpose: Perform one non-streaming or streaming proxy request and return normalized response facts.
 * Owner: core:ai-service
 * Responsibility: HTTP status handling and response extraction; retry policy belongs to retry-executor.
 */

import { logger } from '../../logger/client-logger'
import { recordCacheUsage } from '../cache-stats'
import { AI_STREAM_IDLE_TIMEOUT_MS } from '../stream-timeout'
import type { AiUsageContext } from '../usage-stats'
import { fetchWithDeadline } from './deadline-fetch'
import { AIHttpError, parseRetryAfter } from './errors'
import { resolveProxyBodyDeadlineMs } from './request-body'
import { parseUsage } from './response-utils'
import { handleStreamResponse } from './stream-response'
import type { AIResponse, FetchAIResult } from './types'

export async function fetchAIResponse(
  proxyBody: Record<string, unknown>,
  cacheContext: AiUsageContext,
  signal?: AbortSignal,
): Promise<FetchAIResult> {
  const { response, clearDeadline } = await fetchWithDeadline('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyBody),
    signal,
  }, resolveProxyBodyDeadlineMs(proxyBody))
  try {
    const requestId = response.headers.get('x-ai-request-id') ?? undefined
    if (response.status === 429) {
      const retryAfter = await parseRetryAfter(response)
      const errorText = await response.text().catch(() => 'Rate limited')
      logger.errorRaw('ai-client', 'AI API 返回 429', errorText, undefined, {
        requestId,
        status: response.status,
      })
      throw new AIHttpError(response.status, errorText, requestId, false, retryAfter)
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      logger.errorRaw('ai-client', `AI API 返回 ${response.status}`, errorText, undefined, {
        requestId,
        status: response.status,
      })
      throw new AIHttpError(response.status, errorText, requestId)
    }

    const data = (await response.json()) as AIResponse
    const usage = parseUsage(data.usage)
    if (usage) recordCacheUsage(usage, cacheContext)
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage,
      finishReason: data.choices?.[0]?.finish_reason,
      requestId,
    }
  } finally {
    clearDeadline()
  }
}

export async function fetchAIStreamResponse(
  proxyBody: Record<string, unknown>,
  cacheContext: AiUsageContext,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<FetchAIResult> {
  const { response, clearDeadline } = await fetchWithDeadline('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyBody),
    signal,
  }, resolveProxyBodyDeadlineMs(proxyBody))
  try {
    const requestId = response.headers.get('x-ai-request-id') ?? undefined
    if (response.status === 429) {
      const retryAfter = await parseRetryAfter(response)
      const errorText = await response.text().catch(() => 'Rate limited')
      logger.errorRaw('ai-client', 'AI Stream 返回 429', errorText, undefined, {
        requestId,
        status: response.status,
      })
      throw new AIHttpError(response.status, errorText, requestId, true, retryAfter)
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      logger.errorRaw('ai-client', `AI Stream 返回 ${response.status}`, errorText, undefined, {
        requestId,
        status: response.status,
      })
      throw new AIHttpError(response.status, errorText, requestId, true)
    }

    const maxTokens = typeof proxyBody.max_tokens === 'number' ? proxyBody.max_tokens : undefined
    const result = await handleStreamResponse(response, onChunk, AI_STREAM_IDLE_TIMEOUT_MS, maxTokens)
    if (result.usage) recordCacheUsage(result.usage, cacheContext)
    return { ...result, requestId }
  } finally {
    clearDeadline()
  }
}
