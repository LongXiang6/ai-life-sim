/**
 * @module round-advance.ts
 * @description 子系统轮次序号辅助 —— roundSequence 读取
 * @mod foundation
 *
 * 历史：本文件曾提供 getAgeYearsDelta / consumeSimulationYears / getSimulationTicks /
 * getCalendarDaysDelta / shouldAdvanceSubsystem 等"年制"时间辅助。模拟系统全面重写
 * （2026-07 起，以"日"为唯一整数时间粒度）后，时间读取统一走 TimeSystem 产出的
 * RoundContext.daysPassed / totalDays，上述年制函数全部删除，仅保留与时间无关的
 * roundSequence 读取。
 */

import type { RoundContext } from '../types'

/** 当前模拟轮次序号（引擎 totalRounds，每点一次「推进」+1；与时间增量无关，用于幂等 guard） */
export function getRoundSequence(context: RoundContext): number {
  return context.roundSequence ?? context.round.year
}
