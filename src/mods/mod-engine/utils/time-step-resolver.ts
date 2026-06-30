/**
 * @module time-step-resolver.ts
 * @description 时间步进解析 —— 日历推进 vs 子系统 simulationTicks
 * @mod mod-engine
 */

import type { TimeStep } from '@/foundation'
import { CALENDAR } from '../constants'

export interface ResolvedTick {
  /** 传给 TimeSystem.advance 的步长 */
  calendarAdvance: TimeStep
  /** 子系统整数年循环次数（日推可为 0） */
  simulationTicks: number
  /** 角色年龄增量（年），与子系统连续推进共用 */
  simulationYears: number
  /** 本轮历法天数（生命周期/冷却/气候灾害） */
  calendarDaysDelta: number
  /** @deprecated 使用 simulationYears */
  ageYearsDelta: number
}

const DAYS_PER_YEAR = CALENDAR.DAYS_PER_YEAR
const AVG_MONTH_DAYS = DAYS_PER_YEAR / CALENDAR.MONTHS_PER_YEAR
const AVG_SEASON_DAYS = DAYS_PER_YEAR / CALENDAR.SEASONS_PER_YEAR

function integerYearTicks(years: number): number {
  if (years <= 0) return 0
  return Math.round(years)
}

/**
 * 将 UI/Store 的 TimeStep 解析为日历推进量与子系统 tick 数
 */
export function resolveTimeStep(step: TimeStep): ResolvedTick {
  switch (step.unit) {
    case 'day': {
      const simulationYears = step.value / DAYS_PER_YEAR
      const calendarDaysDelta = step.value
      return {
        calendarAdvance: step,
        simulationTicks: simulationYears >= 1 ? integerYearTicks(simulationYears) : 0,
        simulationYears,
        calendarDaysDelta,
        ageYearsDelta: simulationYears,
      }
    }
    case 'month': {
      const calendarDaysDelta = step.value * AVG_MONTH_DAYS
      const simulationYears = calendarDaysDelta / DAYS_PER_YEAR
      return {
        calendarAdvance: step,
        simulationTicks: integerYearTicks(simulationYears),
        simulationYears,
        calendarDaysDelta,
        ageYearsDelta: simulationYears,
      }
    }
    case 'season': {
      const calendarDaysDelta = step.value * AVG_SEASON_DAYS
      const simulationYears = calendarDaysDelta / DAYS_PER_YEAR
      return {
        calendarAdvance: step,
        simulationTicks: integerYearTicks(simulationYears),
        simulationYears,
        calendarDaysDelta,
        ageYearsDelta: simulationYears,
      }
    }
    case 'year': {
      const calendarDaysDelta = step.value * DAYS_PER_YEAR
      const simulationYears = step.value
      return {
        calendarAdvance: step,
        simulationTicks: integerYearTicks(simulationYears),
        simulationYears,
        calendarDaysDelta,
        ageYearsDelta: simulationYears,
      }
    }
    default: {
      const simulationYears = 1
      return {
        calendarAdvance: { unit: 'year', value: 1 },
        simulationTicks: 1,
        simulationYears,
        calendarDaysDelta: DAYS_PER_YEAR,
        ageYearsDelta: simulationYears,
      }
    }
  }
}
