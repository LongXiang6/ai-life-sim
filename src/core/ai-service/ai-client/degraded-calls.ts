/**
 * Purpose: Provide the existing conversation-to-single-turn and stream-to-local-fallback degradation workflows.
 * Owner: core:ai-service
 * Responsibility: Degradation ordering and local fallback publication only; standard calls own provider retries.
 */

import { logFallbackAICall } from './call-logging'
import { callAI, callAIConversation, callAIStream, callAIStreamConversation } from './calls'
import { buildMessagesFromPrompt } from './request-body'
import { validateWithRetry } from './schema-validation'
import type { AICallOptions, AiMessage } from './types'

function throwIfAborted(options: AICallOptions): void {
  if (!options.signal?.aborted) return
  const error = new Error('AI request aborted')
  error.name = 'AbortError'
  throw error
}

export async function callAIDegraded(
  messages: AiMessage[],
  fallbackText: string,
  options: AICallOptions,
): Promise<string> {
  try {
    const result = await callAIConversation(messages, options)
    if (result && result.trim() !== '' && result.trim() !== '无') return result
    throw new Error('AI returned empty response')
  } catch {
    throwIfAborted(options)
  }

  try {
    const systemMessage = messages.find((message) => message.role === 'system')
    const recentUserMessage = [...messages].reverse().find((message) => message.role === 'user')
    const recentAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant')
    if (recentUserMessage && systemMessage) {
      const userContent = recentAssistantMessage
        ? `【上轮回复】${recentAssistantMessage.content}\n\n【本轮输入】${recentUserMessage.content}`
        : recentUserMessage.content
      const result = await callAI(systemMessage.content, userContent, options)
      if (result && result.trim() !== '' && result.trim() !== '无') return result
      throw new Error('AI returned empty response at L1')
    }
  } catch {
    throwIfAborted(options)
  }

  throwIfAborted(options)
  logFallbackAICall(messages, fallbackText, options, options.pool ?? 'narrative', 'degraded-L2')
  return fallbackText
}

export async function callAIStreamDegraded(
  systemPrompt: string,
  userPrompt: string,
  fallbackText: string,
  options: Omit<AICallOptions, 'onChunk'> & {
    onChunk?: (text: string) => void
    messages?: AiMessage[]
  },
): Promise<string> {
  const typedOptions = options as AICallOptions
  const pool = options.pool ?? 'narrative'
  const messages = options.messages?.length
    ? options.messages
    : buildMessagesFromPrompt(systemPrompt, userPrompt, options.userSegments, options.extraUserMessages)

  try {
    const result = options.messages?.length
      ? await callAIStreamConversation(options.messages, typedOptions)
      : await callAIStream(systemPrompt, userPrompt, typedOptions)
    if (result && result.trim() !== '' && result.trim() !== '无') {
      if (typedOptions.outputSchema && typedOptions.jsonMode) {
        return validateWithRetry(
          result,
          typedOptions.outputSchema,
          { systemPrompt, userPrompt, options: typedOptions },
          (retryOptions) => callAI(systemPrompt, userPrompt, retryOptions),
        )
      }
      return result
    }
    throw new Error('Stream returned empty response')
  } catch (error) {
    if (options.signal?.aborted) throw error
  }

  options.onResetStream?.()
  options.onChunk?.(fallbackText)
  logFallbackAICall(messages, fallbackText, typedOptions, pool, 'stream-degraded')
  return fallbackText
}
