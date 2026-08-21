/**
 * Purpose: Record successful and failed AI calls with stable cache and validation metadata.
 * Owner: core:ai-service
 * Responsibility: AI call audit records only; network transport remains separate.
 */

import { recordAICallLog } from '../../logger/ai-call-log'
import type { AICallUsageSnapshot } from '../../logger/ai-call-log'
import type { DebugLogCategory } from '../../logger/debug-logger'
import { resolveInternalCachePool } from '../cache-pool'
import type { CachePoolType } from '../cache-pool'
import { isValidAiContent } from '../stream-text-extractor'
import { isTruncatedResponse } from './response-utils'
import type { AICallOptions, AiMessage } from './types'

const POOL_TO_CATEGORY: Record<CachePoolType, DebugLogCategory> = {
  narrative: 'narrative-rounds',
  worldInit: 'world-init',
  fate: 'talent-generate',
  lowFrequency: 'background-events',
  adaptation: 'background-events',
}

function resolveLogCategory(pool: CachePoolType, category?: DebugLogCategory): DebugLogCategory {
  return category ?? POOL_TO_CATEGORY[pool]
}

export async function logSuccessfulAICall(
  messages: AiMessage[],
  response: string,
  options: AICallOptions,
  pool: CachePoolType,
  usage?: AICallUsageSnapshot,
  finishReason?: string,
  requestId?: string,
  extraMeta?: Record<string, unknown>,
): Promise<void> {
  if (!isValidAiContent(response)) return
  const cachePool = resolveInternalCachePool(pool, options.logContext?.callKind)
  await recordAICallLog({
    category: resolveLogCategory(pool, options.logCategory),
    messages,
    response,
    requestId,
    logContext: {
      ...options.logContext,
      pool: cachePool,
      model: options.logContext?.model ?? options.customModel ?? options.config.model,
      sessionId: options.logContext?.sessionId ?? options.sessionId,
    },
    usage,
    extraMeta: {
      truncated: isTruncatedResponse(usage, finishReason),
      ...(finishReason ? { finishReason } : {}),
      ...(requestId ? { requestId } : {}),
      ...(options.logMetaResolver?.(response) ?? {}),
      ...options.logMeta,
      ...extraMeta,
    },
  })
}

export async function logFailedAICall(
  messages: AiMessage[],
  options: AICallOptions,
  pool: CachePoolType,
  reason: string,
  usage?: AICallUsageSnapshot,
  finishReason?: string,
  lastContent?: string,
  requestId?: string,
  extraMeta?: Record<string, unknown>,
): Promise<void> {
  const resolverMeta = lastContent && options.logMetaResolver ? options.logMetaResolver(lastContent) : {}
  const cachePool = resolveInternalCachePool(pool, options.logContext?.callKind)
  await recordAICallLog({
    category: resolveLogCategory(pool, options.logCategory),
    messages,
    response: lastContent?.trim() ? lastContent : `[调用失败] ${reason}`,
    requestId,
    logContext: {
      ...options.logContext,
      pool: cachePool,
      model: options.logContext?.model ?? options.customModel ?? options.config.model,
      sessionId: options.logContext?.sessionId ?? options.sessionId,
      callKind: options.logContext?.callKind ?? 'api-failed',
    },
    usage,
    extraMeta: {
      failed: true,
      failureReason: reason,
      truncated: isTruncatedResponse(usage, finishReason),
      ...(finishReason ? { finishReason } : {}),
      ...(requestId ? { requestId } : {}),
      validationPassed: false,
      validationError: reason,
      validationDetails: typeof resolverMeta.validationDetails === 'string'
        ? resolverMeta.validationDetails
        : `调用失败: ${reason}`,
      ...resolverMeta,
      ...options.logMeta,
      ...extraMeta,
    },
  })
}
