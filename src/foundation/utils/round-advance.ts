/**
 * Purpose: Read the canonical simulation round sequence from a round context.
 * Owner: foundation:time
 * Responsibility: Round-sequence projection only; annual clock ownership stays in TimeSystem.
 *
 * @module round-advance.ts
 * @description 子系统轮次序号辅助 —— roundSequence 读取
 * @mod foundation
 *
 * 历史：本文件曾提供 getAgeYearsDelta / consumeSimulationYears / getSimulationTicks /
 * getCalendarDaysDelta / shouldAdvanceSubsystem 等旧时间辅助。模拟系统切换为真实
 * 日历推进后，业务子系统继续消费 TimeSystem 产出的基础点投影，精确日历事实
 * 由 daysPassed / totalDays 保存。本文件只保留与时间推进无关的 roundSequence 读取。
 */

import type { RoundContext } from '../types'

/** 当前模拟轮次序号（引擎 totalRounds，每点一次「推进」+1；与时间增量无关，用于幂等 guard） */
export function getRoundSequence(context: RoundContext): number {
  return context.roundSequence ?? context.round.year
}
