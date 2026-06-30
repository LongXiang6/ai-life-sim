/**
 * @module narrative-calendar.ts
 * @description 叙事纪年解析 —— 对齐废弃项目 calcEraYear / formatEraYear
 * @mod mod-engine
 */

import type { RoundContext, TimeStep, WorldSetting } from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'

import { MONTH_ZH, SEASON_NAMES } from '../constants'
import { timeSystem } from '../subsystems/time-system'

export {
  computeNarrativeMaxTokens,
  NARRATIVE_WORD_COUNT_DEFAULT_MAX,
} from '../constants/narrative-config'

export function readEraStartYearFromConfig(config: Record<string, unknown> | undefined): number {
  if (!config) return 0
  if (typeof config._eraStartYear === 'number' && Number.isFinite(config._eraStartYear)) {
    return config._eraStartYear
  }
  return 0
}

export function readBirthEraYearFromConfig(config: Record<string, unknown> | undefined): number {
  if (!config) return 0
  if (typeof config._birthEraYear === 'number' && Number.isFinite(config._birthEraYear)) {
    return config._birthEraYear
  }
  return readEraStartYearFromConfig(config)
}

/** 角色当前年龄（与 lifespan 子系统公式一致） */
export function resolveCharacterAgeFromContext(context: RoundContext): number {
  const baseState = context.subsystemStates?.['character-base']?.data
  const startingAge = (baseState && typeof baseState === 'object' && 'startingAge' in baseState)
    ? (baseState as Record<string, unknown>).startingAge as number
    : 0
  return (startingAge ?? 0) + Math.max(0, context.round.year - 1)
}

/**
 * 日历纪年：birthEraYear + 已过年数（round.year 从 1 起计，首年 age=0）
 */
export function resolveCalendarEraYear(
  roundYear: number,
  eraStartYear: number,
  birthEraYear?: number,
): number {
  const birth = birthEraYear ?? eraStartYear
  if (eraStartYear !== 0 || birth !== 0) {
    return birth + Math.max(0, roundYear - 1)
  }
  return roundYear
}

export interface NarrativeTimeContext {
  calendarYear: number
  eraLabel: string
  seasonName: string
  age: number
  timeLabel: string
}

/** 按推进步长格式化叙事时间（年步进不附季节；季/月/日步进逐级增加粒度） */
export function formatNarrativeTimeLabel(
  timeStep: TimeStep,
  eraLabel: string,
  round: { season: number; month: number; day?: number },
): string {
  switch (timeStep.unit) {
    case 'day': {
      const monthName = MONTH_ZH[round.month] ?? `${round.month + 1}月`
      const dayNum = (round.day ?? 0) + 1
      const season = SEASON_NAMES[round.season] ?? ''
      return `${eraLabel} · ${season} · ${monthName}第${dayNum}日`
    }
    case 'month': {
      const monthName = MONTH_ZH[round.month] ?? `${round.month + 1}月`
      return `${eraLabel} · ${monthName}`
    }
    case 'season':
      return `${eraLabel} · ${SEASON_NAMES[round.season] ?? ''}`
    case 'year':
    default:
      return eraLabel
  }
}

/** 构建传给 AI 的「时间」字段（对齐废弃项目 时间: timeDesc） */
export function buildNarrativeTimeContext(
  context: RoundContext,
  worldSetting: WorldSetting | null,
): NarrativeTimeContext {
  const config = (worldSetting?.config ?? {}) as Record<string, unknown>
  const eraStartYear = context.eraStartYear ?? readEraStartYearFromConfig(config)
  const birthEraYear = context.birthEraYear ?? readBirthEraYearFromConfig(config)
  const age = resolveCharacterAgeFromContext(context)
  const calendarYear = resolveCalendarEraYear(context.round.year, eraStartYear, birthEraYear)
  // 纪元名称：优先来自世界配置 _eraName，缺省时回退引擎默认值
  const defaultEraName = (typeof config._eraName === 'string' && config._eraName)
    ? config._eraName
    : (eraStartYear !== 0 ? '' : '创世纪元')
  const eraLabel = formatEraYear(calendarYear, defaultEraName)
  const seasonName = timeSystem.getSeasonName()
  const timeStep = context.timeStep ?? { unit: 'year', value: 1 }
  const timeLabel = formatNarrativeTimeLabel(timeStep, eraLabel, context.round)

  return { calendarYear, eraLabel, seasonName, age, timeLabel }
}
