/**
 * Purpose: Build provider proxy bodies, cache usage context, and shared deadlines.
 * Owner: core:ai-service
 * Responsibility: Deterministic request assembly only; network transport is handled by the single-attempt client.
 */

import type { AIModelConfig, ReasoningEffort } from '@/foundation'
import type { AiUsageContext } from '../usage-stats'
import { computeAiCallDeadlineMs } from '../ai-call-deadline'
import { resolveInternalCachePool } from '../cache-pool'
import type { CachePoolType } from '../cache-pool'
import { DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER_ID } from '../provider-config'
import { normalizeStorySeed } from '../story-seed'
import type { AICallOptions, AiMessage } from './types'

export function buildMessagesFromPrompt(
  systemPrompt: string,
  userPrompt: string,
  userSegments?: string[],
  extraUserMessages?: string[],
): AiMessage[] {
  const userMessages = userSegments?.length ? userSegments : [userPrompt]
  const trailing = extraUserMessages?.filter((message) => message.trim().length > 0) ?? []
  return [
    ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt }] : []),
    ...userMessages.map((content) => ({ role: 'user', content })),
    ...trailing.map((content) => ({ role: 'user', content })),
  ]
}

export function resolveCallReasoningEffort(options: AICallOptions): ReasoningEffort {
  return options.reasoningEffort ?? options.config.reasoningEffort ?? 'disabled'
}

function buildRequestBody(
  config: AIModelConfig,
  messages: AiMessage[],
  stream: boolean,
  options?: Pick<AICallOptions, 'overrideTemperature' | 'overrideTopP' | 'jsonMode' | 'storySeed' | 'reasoningEffort' | 'tools' | 'toolChoice'>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options?.overrideTemperature ?? config.temperature,
    stream,
  }
  if (options?.overrideTopP !== undefined) body.top_p = options.overrideTopP
  if (options?.jsonMode) body.response_format = { type: 'json_object' }
  else if (options?.jsonMode !== false && config.responseFormat) body.response_format = config.responseFormat
  if (options?.tools?.length) body.tools = options.tools
  if (options?.toolChoice) body.tool_choice = options.toolChoice

  const normalizedSeed = normalizeStorySeed(options?.storySeed)
  if (normalizedSeed !== undefined) body.seed = normalizedSeed
  return body
}

export function buildProxyBody(
  config: AIModelConfig,
  messages: AiMessage[],
  stream: boolean,
  pool: CachePoolType,
  sessionId?: string,
  options?: Pick<AICallOptions, 'overrideTemperature' | 'overrideTopP' | 'jsonMode' | 'storySeed' | 'reasoningEffort' | 'tools' | 'toolChoice' | 'providerId' | 'apiKey' | 'customBaseUrl' | 'customModel' | 'serverPromptAssetId' | 'logContext'>,
): Record<string, unknown> {
  const aiBody = buildRequestBody(config, messages, stream, options)
  const proxyMessages = options?.serverPromptAssetId
    ? messages.filter((message) => message.role !== 'system')
    : messages
  const proxyBody: Record<string, unknown> = {
    cache_pool: resolveInternalCachePool(pool, options?.logContext?.callKind),
    model: aiBody.model,
    messages: proxyMessages,
    temperature: aiBody.temperature,
    stream: aiBody.stream,
  }
  if (aiBody.top_p !== undefined) proxyBody.top_p = aiBody.top_p
  if (aiBody.response_format !== undefined) proxyBody.response_format = aiBody.response_format
  if (aiBody.tools !== undefined) proxyBody.tools = aiBody.tools
  if (aiBody.tool_choice !== undefined) proxyBody.tool_choice = aiBody.tool_choice
  if (aiBody.seed !== undefined) proxyBody.seed = aiBody.seed
  if (options?.serverPromptAssetId) proxyBody.prompt_asset = options.serverPromptAssetId

  const trace = options?.logContext
  if (trace?.lifeRunId && Number.isInteger(trace.round) && Number(trace.round) > 0) {
    proxyBody.trace_context = {
      lifeRunId: trace.lifeRunId,
      round: trace.round,
      callKind: trace.callKind || 'narrative',
      ...(trace.executionKind ? { executionKind: trace.executionKind } : {}),
      ...(trace.promptVersion ? { promptVersion: trace.promptVersion } : {}),
      ...(Number.isFinite(trace.targetWordCount) ? { targetWordCount: Math.round(trace.targetWordCount as number) } : {}),
      ...(trace.styleSource ? { styleSource: trace.styleSource } : {}),
      ...(trace.styleText !== undefined ? { styleText: trace.styleText } : {}),
      ...(Number.isInteger(trace.styleVersion) ? { styleVersion: trace.styleVersion } : {}),
    }
  }

  const providerId = options?.providerId ?? DEFAULT_AI_PROVIDER_ID
  if (providerId !== DEFAULT_AI_PROVIDER_ID) throw new Error('当前版本只支持玩家自有 API 配置')
  proxyBody.providerId = providerId

  const reasoningEffort = options?.reasoningEffort ?? config.reasoningEffort ?? 'disabled'
  const batchRounds = options?.logContext?.batchRounds
  proxyBody.deadline_context = {
    callKind: options?.logContext?.callKind?.trim() || pool,
    reasoningEffort,
    ...(Number.isFinite(batchRounds) ? { batchRounds: Math.floor(batchRounds as number) } : {}),
  }
  const modelForThinking = (options?.customModel?.trim() || config.model).toLowerCase()
  const isDeepSeekModel = modelForThinking.includes('deepseek')
  if (isDeepSeekModel) {
    if (reasoningEffort === 'disabled') proxyBody.thinking = { type: 'disabled' }
    else {
      proxyBody.thinking = { type: 'enabled' }
      if (reasoningEffort === 'high' || reasoningEffort === 'max') proxyBody.reasoning_effort = reasoningEffort
      delete proxyBody.temperature
      delete proxyBody.top_p
    }
    if (stream) proxyBody.stream_options = { include_usage: true }
  } else {
    delete proxyBody.thinking
  }

  if (options?.apiKey) proxyBody.apiKey = options.apiKey
  if (options?.customBaseUrl) proxyBody.baseUrl = options.customBaseUrl
  if (options?.customModel) proxyBody.model = options.customModel
  void sessionId
  return proxyBody
}

export function resolveCacheUsageContext(options: AICallOptions, pool: CachePoolType): AiUsageContext {
  return {
    providerId: options.providerId ?? DEFAULT_AI_PROVIDER_ID,
    model: options.customModel?.trim() || options.config.model || DEFAULT_AI_MODEL,
    pool: resolveInternalCachePool(pool, options.logContext?.callKind),
    callKind: options.logContext?.callKind?.trim() || pool,
    reasoningEffort: resolveCallReasoningEffort(options),
    lifeRunId: options.logContext?.lifeRunId,
    round: options.logContext?.round,
    executionKind: options.logContext?.executionKind,
    targetWordCount: options.logContext?.targetWordCount,
  }
}

export function resolveProxyBodyDeadlineMs(proxyBody: Record<string, unknown>): number {
  const context = proxyBody.deadline_context
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('AI 请求缺少共享时限上下文')
  }
  const deadlineContext = context as { callKind?: unknown; reasoningEffort?: unknown; batchRounds?: unknown }
  const callKind = typeof deadlineContext.callKind === 'string' ? deadlineContext.callKind : ''
  const reasoningEffort = deadlineContext.reasoningEffort
  if (!['disabled', 'auto', 'high', 'max'].includes(String(reasoningEffort))) {
    throw new Error('AI 请求包含无效推理时限模式')
  }
  const batchRounds = Number(deadlineContext.batchRounds)
  return computeAiCallDeadlineMs({
    callKind,
    reasoningEffort: reasoningEffort as ReasoningEffort,
    ...(Number.isFinite(batchRounds) && batchRounds > 0 ? { batchRounds: Math.floor(batchRounds) } : {}),
  })
}
