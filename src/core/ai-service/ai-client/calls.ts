/**
 * Purpose: Expose the standard single-turn, conversation, and streaming AI call workflows.
 * Owner: core:ai-service
 * Responsibility: Compose request assembly, transport, retry, and optional schema validation without owning them.
 */

import type { ReasoningEffort } from '@/foundation'
import { fetchAIResponse, fetchAIStreamResponse } from './http-transport'
import {
  buildMessagesFromPrompt,
  buildProxyBody,
  resolveCacheUsageContext,
  resolveCallReasoningEffort,
} from './request-body'
import { executeAiFetchWithRetry } from './retry-executor'
import { validateWithRetry } from './schema-validation'
import type { AICallOptions, AiMessage } from './types'

function proxyOptions(options: AICallOptions, reasoningEffort: ReasoningEffort) {
  return {
    overrideTemperature: options.overrideTemperature,
    overrideTopP: options.overrideTopP,
    jsonMode: options.jsonMode,
    storySeed: options.storySeed,
    providerId: options.providerId,
    apiKey: options.apiKey,
    customBaseUrl: options.customBaseUrl,
    customModel: options.customModel,
    serverPromptAssetId: options.serverPromptAssetId,
    reasoningEffort,
    logContext: options.logContext,
  }
}

export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions,
): Promise<string> {
  const pool = options.pool ?? 'narrative'
  const messages = buildMessagesFromPrompt(
    systemPrompt,
    userPrompt,
    options.userSegments,
    options.extraUserMessages,
  )
  const reasoningEffort = resolveCallReasoningEffort(options)
  const result = await executeAiFetchWithRetry(
    messages,
    options,
    pool,
    () => fetchAIResponse(
      buildProxyBody(options.config, messages, false, pool, options.sessionId, proxyOptions(options, reasoningEffort)),
      resolveCacheUsageContext(options, pool),
      options.signal,
    ),
    options.signal,
  )

  if (options.outputSchema && options.jsonMode) {
    return validateWithRetry(
      result,
      options.outputSchema,
      { systemPrompt, userPrompt, options },
      (retryOptions) => callAI(systemPrompt, userPrompt, retryOptions),
    )
  }
  return result
}

export async function callAIConversation(
  messages: AiMessage[],
  options: AICallOptions,
): Promise<string> {
  const pool = options.pool ?? 'narrative'
  const reasoningEffort = resolveCallReasoningEffort(options)
  return executeAiFetchWithRetry(
    messages,
    options,
    pool,
    () => fetchAIResponse(
      buildProxyBody(options.config, messages, false, pool, options.sessionId, proxyOptions(options, reasoningEffort)),
      resolveCacheUsageContext(options, pool),
      options.signal,
    ),
    options.signal,
  )
}

export async function callAIStreamConversation(
  messages: AiMessage[],
  options: AICallOptions,
): Promise<string> {
  const pool = options.pool ?? 'narrative'
  const reasoningEffort = resolveCallReasoningEffort(options)
  return executeAiFetchWithRetry(
    messages,
    options,
    pool,
    () => fetchAIStreamResponse(
      buildProxyBody(options.config, messages, true, pool, options.sessionId, proxyOptions(options, reasoningEffort)),
      resolveCacheUsageContext(options, pool),
      options.onChunk,
      options.signal,
    ),
    options.signal,
  )
}

export async function callAIStream(
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions,
): Promise<string> {
  const messages = buildMessagesFromPrompt(
    systemPrompt,
    userPrompt,
    options.userSegments,
    options.extraUserMessages,
  )
  return callAIStreamConversation(messages, options)
}
