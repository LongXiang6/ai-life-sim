/**
 * Purpose: Define the shared request, response, cache, and message types used by the AI client components.
 * Owner: core:ai-service
 * Responsibility: Type contracts only; this file does not perform requests, logging, validation, or persistence.
 */

import type { AIModelConfig, ReasoningEffort } from '@/foundation'
import type { ZodSchema } from 'zod'
import type { CachePoolType } from '../cache-pool'

export interface AICallLogContext {
  lifeRunId?: string
  round?: number
  age?: number
  era?: string
  strategy?: string
  callKind?: string
  trigger?: string
  pool?: string
  model?: string
  sessionId?: string
  executionKind?: string
  promptVersion?: string
  targetWordCount?: number
  styleSource?: 'default' | 'custom'
  styleText?: string
  styleVersion?: number
}

export interface AICallUsageSnapshot {
  hitTokens?: number
  missTokens?: number
  completionTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

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
  logContext?: AICallLogContext
  logMeta?: Record<string, unknown>
  logMetaResolver?: (response: string) => Record<string, unknown>
  outputSchema?: ZodSchema
}

export interface AIResponse {
  choices: Array<{
    message: {
      content?: string | null
      /** 推理模型的思考/最终内容回退字段；部分供应商在 content 为空时把结果放在这里。 */
      reasoning_content?: string | null
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
