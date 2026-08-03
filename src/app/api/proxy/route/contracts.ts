/**
 * Purpose: Define and validate the server AI proxy request contract.
 * Owner: app:api
 * Responsibility: Zod request validation and transport-local types only.
 */

import { z } from 'zod'

import { INTERNAL_CACHE_POOLS } from '@/core/ai-service/cache-pool'
import { DEFAULT_AI_PROVIDER_ID } from '@/core/ai-service/provider-config'
import { normalizeProxyStorySeedInput } from '@/core/ai-service/story-seed'

export const ProxyRequestSchema = z.object({
  cache_pool: z.enum(INTERNAL_CACHE_POOLS),
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional(),
  stream_options: z.object({ include_usage: z.boolean() }).strict().optional(),
  response_format: z.object({ type: z.string() }).optional(),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.preprocess(normalizeProxyStorySeedInput, z.number().finite().optional()),
  thinking: z.object({ type: z.enum(['disabled', 'enabled']) }).strict().optional(),
  reasoning_effort: z.enum(['high', 'max']).optional(),
  providerId: z.string().default(DEFAULT_AI_PROVIDER_ID),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  prompt_asset: z.string().min(1).max(128).optional(),
  deadline_context: z.object({
    callKind: z.string().min(1).max(96),
    reasoningEffort: z.enum(['disabled', 'auto', 'high', 'max']),
  }).strict(),
  trace_context: z.object({
    lifeRunId: z.string().min(1).max(160),
    round: z.number().int().positive(),
    callKind: z.string().min(1).max(96),
    executionKind: z.string().min(1).max(32).optional(),
    promptVersion: z.string().min(1).max(64).optional(),
    targetWordCount: z.number().int().positive().optional(),
    styleSource: z.enum(['default', 'custom']).optional(),
    styleText: z.string().optional(),
    styleVersion: z.number().int().nonnegative().optional(),
  }).strict().optional(),
})

export type ProxyRequest = z.infer<typeof ProxyRequestSchema>

export interface UpstreamAttempt {
  model: string
  status?: number
  durationMs: number
  error?: string
}
