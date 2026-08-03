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
  strictSchema?: boolean
}

export interface AIResponse {
  choices: Array<{
    message: { content: string }
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
