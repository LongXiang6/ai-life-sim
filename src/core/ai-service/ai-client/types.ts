/**
 * Purpose: Define the shared request, response, cache, and message types used by the AI client components.
 * Owner: core:ai-service
 * Responsibility: Type contracts only; this file does not perform requests, logging, validation, or persistence.
 */

import type { AIModelConfig, ReasoningEffort } from '@/foundation'
import type { ZodSchema } from 'zod'
import type { AICallLogContext, AICallUsageSnapshot } from '../../logger/ai-call-log'
import type { DebugLogCategory } from '../../logger/debug-logger'
import type { CachePoolType } from '../cache-pool'

export interface AiMessage {
  role: string
  content: string
}

export interface AiFunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    strict?: boolean
    parameters: Record<string, unknown>
  }
}

export interface AiFunctionToolChoice {
  type: 'function'
  function: { name: string }
}

export interface AICallOptions {
  config: AIModelConfig
  pool?: CachePoolType
  sessionId?: string
  onChunk?: (text: string) => void
  onResetStream?: () => void
  signal?: AbortSignal
  overrideTemperature?: number
  overrideTopP?: number
  jsonMode?: boolean
  tools?: readonly AiFunctionTool[]
  toolChoice?: AiFunctionToolChoice
  /** 当且仅当固定函数出口返回时，读取该函数参数作为调用文本结果。 */
  responseToolName?: string
  storySeed?: string | number
  providerId?: string
  apiKey?: string
  customBaseUrl?: string
  customModel?: string
  serverPromptAssetId?: string
  userSegments?: string[]
  extraUserMessages?: string[]
  reasoningEffort?: ReasoningEffort
  logCategory?: DebugLogCategory
  logContext?: AICallLogContext
  logMeta?: Record<string, unknown>
  logMetaResolver?: (response: string) => Record<string, unknown>
  outputSchema?: ZodSchema
}

export interface AIResponse {
  choices: Array<{
    message: {
      content?: string | null
      tool_calls?: Array<{
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string
  }>
  usage?: Record<string, unknown>
}

export interface FetchAIResult {
  content: string
  usage?: AICallUsageSnapshot
  finishReason?: string
  requestId?: string
}

export interface RoundCacheMetrics {
  timestamp: number
  strategy: 'S1' | 'S2' | 'S3' | 'S4'
  stablePrefixChars: number
  userMessageCount: number
}

export interface CacheHitInfo {
  hitTokens: number
  missTokens: number
  totalInputTokens: number
}

export type { AICallLogContext, AICallUsageSnapshot }
