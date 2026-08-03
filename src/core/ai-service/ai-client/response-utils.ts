/**
 * Purpose: Normalize AI response usage and determine provider-reported truncation.
 * Owner: core:ai-service
 * Responsibility: Stateless response calculations shared by logging, retry, and transport components.
 */

import type { AICallUsageSnapshot } from '../../logger/ai-call-log'
import { normalizeAiUsage } from '../normalize-ai-usage'
import type { AIResponse } from './types'

export function isTruncatedResponse(
  _usage: AICallUsageSnapshot | undefined,
  finishReason?: string,
): boolean {
  return finishReason === 'length'
}

export function parseUsage(usage?: AIResponse['usage']): AICallUsageSnapshot | undefined {
  return normalizeAiUsage(usage)
}
