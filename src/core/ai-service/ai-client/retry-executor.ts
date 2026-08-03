/**
 * Purpose: Execute AI fetch attempts with bounded retry, usage accounting, logging, and terminal notification.
 * Owner: core:ai-service
 * Responsibility: Retry state machine only; request bodies and HTTP/SSE transport are injected dependencies.
 */

import type { AICallUsageSnapshot } from '../../logger/ai-call-log'
import { logger } from '../../logger/client-logger'
import type { CachePoolType } from '../cache-pool'
import { isValidAiContent } from '../stream-text-extractor'
import { recordAiUsage } from '../usage-stats'
import { logFailedAICall, logSuccessfulAICall } from './call-logging'
import {
  AIHttpError,
  AIResponseTruncatedError,
  formatAiError,
  isAiResponseTruncatedError,
  isRetryableAiError,
  notifyAiError,
} from './errors'
import { resolveCacheUsageContext } from './request-body'
import { isTruncatedResponse, resolveMaxTokens } from './response-utils'
import type { AICallOptions, AiMessage, FetchAIResult } from './types'

const MAX_RETRY = 3
const RETRY_DELAY_MS = 1500

function getBackoffDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter) return retryAfter * 1000
  return RETRY_DELAY_MS * (attempt + 1)
}

export async function executeAiFetchWithRetry(
  messages: AiMessage[],
  options: AICallOptions,
  pool: CachePoolType,
  fetchAttempt: () => Promise<FetchAIResult>,
  _signal?: AbortSignal,
): Promise<string> {
  let lastUsage: AICallUsageSnapshot | undefined
  let lastFinishReason: string | undefined
  let lastContent: string | undefined
  let lastRequestId: string | undefined

  for (let attempt = 0; attempt < MAX_RETRY; attempt += 1) {
    const attemptStartedAt = performance.now()
    try {
      const { content, usage, finishReason, requestId } = await fetchAttempt()
      lastUsage = usage
      lastFinishReason = finishReason
      lastContent = content
      lastRequestId = requestId
      const resolvedMeta = options.logMetaResolver?.(content) ?? {}
      const actualNarrativeChars = Number(resolvedMeta.narrativeChars)
      recordAiUsage(usage, {
        ...resolveCacheUsageContext(options, pool),
        ...(Number.isFinite(actualNarrativeChars) ? { actualNarrativeChars } : {}),
        ...(finishReason ? { finishReason } : {}),
        durationMs: Math.max(0, Math.round(performance.now() - attemptStartedAt)),
      })

      const maxTokens = resolveMaxTokens(options)
      if (isTruncatedResponse(usage, maxTokens, finishReason)) {
        throw new AIResponseTruncatedError(content, finishReason, requestId, maxTokens, usage)
      }
      if (!isValidAiContent(content)) {
        if (attempt < MAX_RETRY - 1) {
          await logFailedAICall(
            messages,
            options,
            pool,
            content.trim() ? 'AI 返回无效内容' : 'AI 返回空响应',
            usage,
            finishReason,
            content,
            requestId,
            {
              attempt: attempt + 1,
              maxAttempts: MAX_RETRY,
              responseInvalid: true,
              willRetry: true,
            },
          )
          options.onResetStream?.()
          await new Promise((resolve) => setTimeout(resolve, getBackoffDelay(attempt)))
          continue
        }
        await logFailedAICall(
          messages,
          options,
          pool,
          'AI 返回空响应',
          usage,
          finishReason,
          lastContent,
          requestId,
          {
            attempt: attempt + 1,
            maxAttempts: MAX_RETRY,
            willRetry: false,
            responseInvalid: true,
          },
        )
        throw new Error('AI 返回了空内容')
      }

      await logSuccessfulAICall(
        messages,
        content,
        options,
        pool,
        usage,
        finishReason,
        requestId,
        { attempt: attempt + 1, maxAttempts: MAX_RETRY },
      )
      return content
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      if (error instanceof AIHttpError) lastRequestId = error.requestId
      if (isAiResponseTruncatedError(error)) {
        lastUsage = error.usage ?? lastUsage
        lastFinishReason = error.finishReason ?? lastFinishReason
        lastContent = error.content
        lastRequestId = error.requestId ?? lastRequestId
      }

      if (attempt < MAX_RETRY - 1 && isRetryableAiError(error)) {
        const retryKind = error instanceof AIHttpError ? `HTTP ${error.status}` : '临时网络错误'
        await logFailedAICall(
          messages,
          options,
          pool,
          error instanceof Error ? error.message : String(error),
          lastUsage,
          lastFinishReason,
          lastContent,
          lastRequestId,
          {
            attempt: attempt + 1,
            maxAttempts: MAX_RETRY,
            retryable: true,
            retryKind,
            willRetry: true,
          },
        )
        logger.warn(
          'ai-client',
          `AI 调用暂时失败，正在重试 (${attempt + 1}/${MAX_RETRY}) · ${retryKind}`,
          { requestId: lastRequestId, attempt: attempt + 1 },
        )
        options.onResetStream?.()
        const retryAfter = error instanceof AIHttpError ? error.retryAfter : undefined
        const delay = Math.max(getBackoffDelay(attempt), retryAfter ? retryAfter * 1000 : 0)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      notifyAiError(`AI 调用失败：${formatAiError(error)}`)
      if (!(error instanceof Error && error.message === 'AI 返回了空内容')) {
        await logFailedAICall(
          messages,
          options,
          pool,
          error instanceof Error ? error.message : String(error),
          lastUsage,
          lastFinishReason,
          lastContent,
          lastRequestId,
          {
            attempt: attempt + 1,
            maxAttempts: MAX_RETRY,
            willRetry: false,
            ...(isAiResponseTruncatedError(error)
              ? {
                  failureKind: 'response-truncated',
                  responseLength: error.responseLength,
                  maxTokens: error.maxTokens ?? resolveMaxTokens(options),
                }
              : {}),
          },
        )
      }
      throw error
    }
  }

  notifyAiError('AI 调用失败，已达最大重试次数')
  await logFailedAICall(
    messages,
    options,
    pool,
    '已达最大重试次数',
    lastUsage,
    lastFinishReason,
    lastContent,
    lastRequestId,
    { attempt: MAX_RETRY, maxAttempts: MAX_RETRY, willRetry: false },
  )
  throw new Error('AI 调用失败，已达最大重试次数')
}
