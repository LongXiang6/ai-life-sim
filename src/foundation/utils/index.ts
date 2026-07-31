/**
 * @module index.ts
 * @description Foundation 工具函数统一导出
 * @mod foundation
 */

export { cn } from './cn'
export { parseJSON } from './parse-json'
export { formatNumber, clamp } from './format-number'
export {
  normalizeDecimalInteger,
  decimalIntegerToBigInt,
  decimalIntegerToSafeNumber,
  compareDecimalIntegers,
  addDecimalIntegers,
  subtractDecimalIntegers,
  multiplyDecimalInteger,
  annualRateDelta,
  allocateDecimalInteger,
  formatChineseMagnitude,
} from './decimal-integer'
export type { DecimalInteger } from './decimal-integer'
export { getRoundSequence } from './round-advance'
export { parseChineseNumber } from './cn-number'
export { extractDynamicAttrsFromNarrative } from './extract-dynamic-attrs'
export type { AttrTagMap, ExtractedAttrs } from './extract-dynamic-attrs'
export type { AttrKey, AttrTier } from './attr-tiers'
export { useIsMobile } from './use-is-mobile'
export { stringifyPrompt } from './stringify-prompt'
export {
  estimateTokenBudget,
  scaleTokenBudgetByInputLength,
  estimateTextTokens,
  bumpTokenBudget,
  TOKEN_BUDGET_DEFAULT_MIN,
  TOKEN_BUDGET_HEADROOM,
} from './estimate-token-budget'
export type { EstimateTokenBudgetOptions } from './estimate-token-budget'
export { formatEraYear } from './format-time'
export type { EraEntry } from './format-time'
export {
  compareExecutionNodes,
  createExecutionOutcomeCodes,
  resolveExecutionOrder,
  runExecutionSequence,
  executionSequenceError,
} from './execution-sequence'

// 通用数值/随机工具（原 utils.ts，统一后归入 barrel）
export const ROUND_DECIMALS = 4

/**
 * 四舍五入到指定小数位
 *
 * @param value - 要舍入的数值
 * @param decimals - 保留的小数位数（默认 4）
 * @returns 舍入后的数值
 */
export function round(value: number, decimals = ROUND_DECIMALS): number {
  return Number(value.toFixed(decimals))
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
