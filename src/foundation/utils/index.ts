/**
 * Purpose: Re-export foundation utility functions from one stable entry point.
 * Owner: foundation
 * Responsibility: Export wiring only; utility implementations remain in their modules.
 *
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
export {
  BASE_POINTS_PER_YEAR,
  DEFAULT_ANNUAL_EVENT_COUNT,
  CALENDAR_DAYS_PER_YEAR,
  normalizeAnnualEventCount,
  annualEventCumulativeBasePoints,
  annualEventBasePointDelta,
  eventRoundDeltaPoints,
  calendarDaysFromBasePoints,
  basePointsFromCalendarDays,
  basePointsToCalendarDays,
  calendarDaysToBasePoints,
  basePointsToYears,
  advanceAnnualEvent,
} from './annual-clock'
export type { AnnualEventCursor, AnnualEventAdvance } from './annual-clock'
export { parseChineseNumber } from './cn-number'
export { extractDynamicAttrsFromNarrative } from './extract-dynamic-attrs'
export type { AttrTagMap, ExtractedAttrs } from './extract-dynamic-attrs'
export { useIsMobile } from './use-is-mobile'
export { stringifyPrompt } from './stringify-prompt'
export { formatEraYear } from './format-time'
export type { EraEntry } from './format-time'
export {
  compareExecutionNodes,
  createExecutionOutcomeCodes,
  resolveExecutionOrder,
  validateExecutionFlowContract,
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
