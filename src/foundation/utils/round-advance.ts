/**
 * @module round-advance.ts
 * @description 子系统周期推进辅助 —— 统一 roundSequence / simulationTicks / 日历时间
 * @mod foundation
 */

import type { RoundContext } from '../types'

const DEFAULT_DAYS_PER_YEAR = 365

/** 当前模拟轮次序号（引擎 totalRounds，每点一次「推进」+1） */
export function getRoundSequence(context: RoundContext): number {
  return context.roundSequence ?? context.round.year
}

/** 本轮子系统应执行的整数年 tick 数（日/月小步进可为 0；优先用 getAgeYearsDelta 做连续推进） */
export function getSimulationTicks(context: RoundContext): number {
  if (context.simulationTicks !== undefined) return context.simulationTicks
  return Math.max(0, Math.round(getAgeYearsDelta(context)))
}

/** 本轮模拟推进量（年，连续量；日推 ≈ 1/365） */
export function getAgeYearsDelta(context: RoundContext): number {
  if (context.ageYearsDelta !== undefined) return context.ageYearsDelta
  const ticks = context.simulationTicks
  if (ticks !== undefined) return ticks
  return 1
}

/** 本轮历法天数 */
export function getCalendarDaysDelta(context: RoundContext): number {
  if (context.calendarDaysDelta !== undefined) return context.calendarDaysDelta
  return getAgeYearsDelta(context) * DEFAULT_DAYS_PER_YEAR
}

/** 是否应在本轮执行子系统 advance（幂等 guard） */
export function shouldAdvanceSubsystem(lastProcessedRound: number, context: RoundContext): boolean {
  return getRoundSequence(context) !== lastProcessedRound
}

/**
 * 累积模拟年数，满 1 年执行 onFullYear（用于仍按「年事件」离散步进的子系统）
 * @returns 本轮 ageYearsDelta
 */
export function consumeSimulationYears(
  accumulator: { value: number },
  context: RoundContext,
  onFullYear: () => void,
): number {
  const years = getAgeYearsDelta(context)
  if (years <= 0) return 0
  accumulator.value += years
  while (accumulator.value >= 1) {
    onFullYear()
    accumulator.value -= 1
  }
  return years
}
