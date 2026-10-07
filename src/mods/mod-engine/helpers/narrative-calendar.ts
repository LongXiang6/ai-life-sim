/**
 * Purpose: Resolve canonical calendar labels for narrative prompts.
 * Owner: mod-engine
 * Responsibility: Translate round time state into stable era, season, and calendar context.
 *
 * @module narrative-calendar.ts
 * @description 叙事纪年解析
 * @mod mod-engine
 */

import {
  normalizeCanonicalTimeStep,
  type RoundContext,
  type TimeStep,
  type WorldSetting,
} from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'

import { CALENDAR, SEASON_NAMES } from '../constants'
import { getSeasonForMonth } from './calendar-season.js'
import { buildCanonicalCalendarNarrativeHint } from './time-scale-narrative'

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
  return startingAge + Math.max(0, context.round.year)
}

/** 日历纪年：birthEraYear + 已过自然年数（round.year 从 0 起计）。 */
export function resolveCalendarEraYear(
  roundYear: number,
  eraStartYear: number,
  birthEraYear?: number,
): number {
  const birth = birthEraYear ?? eraStartYear
  if (eraStartYear !== 0 || birth !== 0) {
    return birth + Math.max(0, roundYear)
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
  narrativeWindow?: string
}

/** 按日/月/季/年推进步长格式化叙事时间。 */
export function formatNarrativeTimeLabel(
  timeStep: TimeStep,
  eraLabel: string,
  round: {
    season: number
    month: number
    day?: number
  },
): string {
  const canonical = normalizeCanonicalTimeStep(timeStep)
  const seasonName = SEASON_NAMES[getSeasonForMonth(round.month)] ?? ''
  switch (canonical.unit) {
    case 'day':
      return `${eraLabel} · ${round.month + 1}月${(round.day ?? 0) + 1}日`
    case 'month':
      return `${eraLabel} · ${round.month + 1}月`
    case 'season':
      return `${eraLabel} · ${seasonName}季`
    case 'year':
      return eraLabel
  }
}

function formatNarrativePromptTimeLabel(
  timeStep: TimeStep,
  eraLabel: string,
  round: { season: number; month: number; day?: number },
): string {
  return formatNarrativeTimeLabel(timeStep, eraLabel, round)
}

function calendarNodeFromTotalDays(
  totalDays: number,
  calendarYearOffset: number,
): {
  calendarYear: number
  month: number
  day: number
} {
  const normalizedDays = Math.max(0, Math.floor(totalDays))
  const elapsedYears = Math.floor(normalizedDays / CALENDAR.DAYS_PER_YEAR)
  let remainingDays = normalizedDays % CALENDAR.DAYS_PER_YEAR
  let month = 0
  for (let index = 0; index < CALENDAR.MONTHS_PER_YEAR; index += 1) {
    const daysInMonth = CALENDAR.DAYS_IN_MONTH[index]
    if (remainingDays < daysInMonth) {
      month = index
      break
    }
    remainingDays -= daysInMonth
  }
  return {
    calendarYear: elapsedYears + calendarYearOffset,
    month: month + 1,
    day: remainingDays + 1,
  }
}

function buildNarrativeWindow(
  context: RoundContext,
  timeStep: TimeStep,
  calendarYear: number,
): string | undefined {
  const elapsedDays = context.daysPassed
  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) return undefined
  const currentTotalDays = Math.max(0, Math.floor(context.totalDays))
  const currentElapsedYears = Math.floor(currentTotalDays / CALENDAR.DAYS_PER_YEAR)
  const calendarYearOffset = calendarYear - currentElapsedYears
  const previousNode = calendarNodeFromTotalDays(
    currentTotalDays - elapsedDays,
    calendarYearOffset,
  )
  return buildCanonicalCalendarNarrativeHint({
    timeStep,
    calendarYear,
    seasonName: SEASON_NAMES[getSeasonForMonth(context.round.month)] ?? '',
    month: context.round.month + 1,
    day: ((context.round as { day?: number }).day ?? 0) + 1,
    previousNode,
    daysPassed: elapsedDays,
  })
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
  const { round, eraStartYear, worldEraName } = input
  const timeStep = normalizeCanonicalTimeStep(input.timeStep)
  const headerEraYear = eraStartYear !== 0
    ? eraStartYear + Math.max(0, round.year)
    : round.eraYear
  const eraLabel = worldEraName
    ? formatEraYear(headerEraYear, worldEraName)
    : eraStartYear !== 0
      ? formatEraYear(headerEraYear, '')
      : formatEraYear(headerEraYear, round.eraName)
  return formatNarrativeTimeLabel(timeStep, eraLabel, round)
}

/** 构建传给 AI 的时间字段。 */
export function buildNarrativeTimeContext(
  context: RoundContext,
  worldSetting: WorldSetting | null,
): NarrativeTimeContext {
  const config = (worldSetting?.config ?? {}) as Record<string, unknown>
  const eraStartYear = context.eraStartYear ?? readEraStartYearFromConfig(config)
  const birthEraYear = context.birthEraYear ?? readBirthEraYearFromConfig(config)
  const age = resolveCharacterAgeFromContext(context)
  const calendarYear = resolveCalendarEraYear(context.round.year, eraStartYear, birthEraYear)
  const defaultEraName = (typeof config._eraName === 'string' && config._eraName)
    ? config._eraName
    : (eraStartYear !== 0 ? '' : '创世纪元')
  const eraLabel = formatEraYear(calendarYear, defaultEraName)
  const seasonName = SEASON_NAMES[getSeasonForMonth(context.round.month)] ?? ''
  const timeStep = normalizeCanonicalTimeStep(context.timeStep ?? { unit: 'month', value: 1 })
  const timeLabel = formatNarrativePromptTimeLabel(timeStep, eraLabel, context.round)

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
    narrativeWindow: buildNarrativeWindow(context, timeStep, calendarYear),
  }
}
