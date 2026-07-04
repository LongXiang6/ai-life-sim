/**
 * @module time-step-resolver.ts
 * @description 时间步进解析 —— 将 UI/Store 的 TimeStep 规范化为传给 TimeSystem.advance 的步长
 * @mod mod-engine
 *
 * 历史：本文件曾同时产出 simulationTicks / simulationYears / calendarDaysDelta / ageYearsDelta
 * 等"年制"派生量供子系统读取。模拟系统全面重写（2026-07 起，日为唯一整数时间粒度）后，
 * 时间增量统一由 TimeSystem 产出（RoundContext.daysPassed / totalDays），本文件仅保留
 * 步长规范化（校验单位、非法单位回退到年×1），不再产出年制派生量。
 */

import type { TimeStep } from '@/foundation'

export interface ResolvedTick {
  /** 传给 TimeSystem.advance 的规范化步长 */
  calendarAdvance: TimeStep
}

/**
 * 将 UI/Store 的 TimeStep 规范化为日历推进步长。
 * 合法单位（day/month/season/year）原样透传；非法单位回退到年×1（安全默认）。
 */
export function resolveTimeStep(step: TimeStep): ResolvedTick {
  switch (step.unit) {
    case 'day':
    case 'month':
    case 'season':
    case 'year':
      return { calendarAdvance: step }
    default:
      return { calendarAdvance: { unit: 'year', value: 1 } }
  }
}
