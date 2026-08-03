/**
 * Purpose: Normalize AI response usage and determine output-budget truncation.
 * Owner: core:ai-service
 * Responsibility: Stateless response calculations shared by logging, retry, and transport components.
 */

import type { AICallUsageSnapshot } from '../../logger/ai-call-log'
import { normalizeAiUsage } from '../normalize-ai-usage'
import type { AICallOptions, AIResponse } from './types'

export function resolveMaxTokens(options: AICallOptions): number {
  return options.overrideMaxTokens ?? options.config.maxTokens
}

export function isTruncatedResponse(
  usage: AICallUsageSnapshot | undefined,
  maxTokens: number,
  finishReason?: string,
): boolean {
  if (finishReason === 'length') return true
  return usage?.completionTokens !== undefined && usage.completionTokens >= maxTokens
}

export function parseUsage(usage?: AIResponse['usage']): AICallUsageSnapshot | undefined {
  return normalizeAiUsage(usage)
}
