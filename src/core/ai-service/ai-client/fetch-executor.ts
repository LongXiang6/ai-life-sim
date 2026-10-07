/**
 * Purpose: Execute one AI fetch with usage accounting, logging, and terminal notification.
 * Owner: core:ai-service
 * Responsibility: A single transport attempt only; callers explicitly decide whether to start another request.
 */

import type { AICallUsageSnapshot } from './types'
import type { CachePoolType } from '../cache-pool'
import { isValidAiContent } from '../stream-text-extractor'
import { recordAiUsage } from '../usage-stats'
import {
  AIHttpError,
  AIResponseTruncatedError,
  formatAiError,
  isAiResponseTruncatedError,
  notifyAiError,
} from './errors'
import { resolveCacheUsageContext } from './request-body'
import { isTruncatedResponse } from './response-utils'
import type { AICallOptions, AiMessage, FetchAIResult } from './types'

export async function executeAiFetch(
  messages: AiMessage[],
  options: AICallOptions,
  pool: CachePoolType,
  fetchAttempt: () => Promise<FetchAIResult>,
): Promise<string> {
  const attemptStartedAt = performance.now()
  let usage: AICallUsageSnapshot | undefined
  let finishReason: string | undefined
  let content: string | undefined
  let requestId: string | undefined

  try {
    const result = await fetchAttempt()
    usage = result.usage
    finishReason = result.finishReason
    content = result.content
    requestId = result.requestId

    const resolvedMeta = options.logMetaResolver?.(content) ?? {}
    const actualNarrativeChars = Number(resolvedMeta.narrativeChars)
    recordAiUsage(usage, {
      ...resolveCacheUsageContext(options, pool),
      ...(Number.isFinite(actualNarrativeChars) ? { actualNarrativeChars } : {}),
      ...(finishReason ? { finishReason } : {}),
      durationMs: Math.max(0, Math.round(performance.now() - attemptStartedAt)),
    })

    if (isTruncatedResponse(usage, finishReason)) {
      throw new AIResponseTruncatedError(content, finishReason, requestId, usage)
    }
    if (!isValidAiContent(content)) {
      throw new Error(content.trim() ? 'AI 返回无效内容' : 'AI 返回空响应')
    }

    return content
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof AIHttpError) requestId = error.requestId
    if (isAiResponseTruncatedError(error)) {
      usage = error.usage ?? usage
      finishReason = error.finishReason ?? finishReason
      content = error.content
      requestId = error.requestId ?? requestId
    }

    notifyAiError(`AI 调用失败：${formatAiError(error)}`)
    throw error
  }
}
