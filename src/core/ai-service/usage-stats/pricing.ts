/**
 * Purpose: Own the versioned DeepSeek token price table used by browser usage estimates.
 * Owner: core:ai-service
 * Responsibility: Price lookup only; token aggregation and storage stay separate.
 */

import type { AiUsageContext } from './contracts'

export const DEEPSEEK_PRICE_VERSION = 'deepseek-cny-2026-07-26'
export const DEEPSEEK_PRICE_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing'

export interface ModelPrice {
  hitNanoYuanPerToken: number
  missNanoYuanPerToken: number
  outputNanoYuanPerToken: number
}

const DEEPSEEK_PRICES: Record<string, ModelPrice> = {
  'deepseek-v4-flash': {
    hitNanoYuanPerToken: 20,
    missNanoYuanPerToken: 1_000,
    outputNanoYuanPerToken: 2_000,
  },
  'deepseek-v4-pro': {
    hitNanoYuanPerToken: 25,
    missNanoYuanPerToken: 3_000,
    outputNanoYuanPerToken: 6_000,
  },
}

export function resolveUsagePrice(context: AiUsageContext): ModelPrice | undefined {
  const model = context.model.trim().toLowerCase()
  if (context.providerId !== 'deepseek' && context.providerId !== 'custom') return undefined
  return DEEPSEEK_PRICES[model]
}
