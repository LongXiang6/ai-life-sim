/**
 * @module narrative-calendar.ts
 * @description 叙事纪年解析 —— 对齐废弃项目 calcEraYear / formatEraYear
 * @mod mod-engine
 */

import type { RoundContext, TimeStep, WorldSetting } from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'

import { SEASON_NAMES } from '../constants'
import { getSeasonForMonth } from './calendar-season.js'
import { timeSystem } from '../subsystems/time-system'

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

/** 角色当前年龄由 character-base 的统一角色状态提供。 */
export function resolveCharacterAgeFromContext(context: RoundContext): number {
  const characterBase = context.subsystemStates?.['character-base']?.data as {
    status?: { ageDays?: unknown }
    startingAge?: unknown
  } | undefined
  if (typeof characterBase?.status?.ageDays === 'number' && Number.isFinite(characterBase.status.ageDays)) {
    return Math.floor(Math.max(0, characterBase.status.ageDays) / 365)
  }
  const startingAge = typeof characterBase?.startingAge === 'number' && Number.isFinite(characterBase.startingAge)
    ? characterBase.startingAge
    : 0
  return startingAge + Math.max(0, context.round.year - 1)
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
  calendarName: string
  month: number
  day: number
  localTotalDays: number
  age: number
  timeLabel: string
}

/** 按推进步长格式化叙事时间（年步进不附季节；季/月/日步进逐级增加粒度） */
export function formatNarrativeTimeLabel(
  timeStep: TimeStep,
  eraLabel: string,
  round: { season: number; month: number; day?: number },
): string {
  const seasonName = SEASON_NAMES[getSeasonForMonth(round.month)] ?? ''
  switch (timeStep.unit) {
    case 'day': {
      const monthName = `${round.month + 1}月`
      const dayNum = (round.day ?? 0) + 1
      return `${eraLabel} · ${seasonName}季 · ${monthName}${dayNum}日`
    }
    case 'month': {
      return `${eraLabel} · ${seasonName}季 · ${round.month + 1}月`
    }
    case 'season':
      return `${eraLabel} · ${seasonName}季`
    case 'year':
    default:
      return eraLabel
  }
}

export interface CurrentNarrativeTimeLabelInput {
  timeStep: TimeStep
  round: {
    year: number
    eraYear: number
    eraName: string
    season: number
    month: number
    day?: number
  }
  eraStartYear: number
  worldEraName?: string
}

/** 当前 UI 顶栏时间标签；纪元偏移、世界纪元名与步长粒度统一收口在引擎侧。 */
export function formatCurrentNarrativeTimeLabel(input: CurrentNarrativeTimeLabelInput): string {
  const { timeStep, round, eraStartYear, worldEraName } = input
  const headerEraYear = eraStartYear !== 0
    ? eraStartYear + Math.max(0, round.year - 1)
    : round.eraYear
  const eraLabel = worldEraName
    ? formatEraYear(headerEraYear, worldEraName)
    : eraStartYear !== 0
      ? formatEraYear(headerEraYear, '')
      : formatEraYear(headerEraYear, round.eraName)
  return formatNarrativeTimeLabel(timeStep, eraLabel, round)
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

  return {
    calendarYear,
    eraLabel,
    seasonName,
    calendarName: '统一游戏历法',
    month: context.round.month + 1,
    day: ((context.round as { day?: number }).day ?? 0) + 1,
    localTotalDays: context.totalDays,
    age,
    timeLabel,
  }
}
