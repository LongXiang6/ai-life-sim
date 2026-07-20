/**
 * @module narrative-calendar.ts
 * @description 叙事纪年解析 —— 对齐废弃项目 calcEraYear / formatEraYear
 * @mod mod-engine
 */

import type {
  LocalCalendarProfile,
  LocalClockState,
  RoundContext,
  TimeStep,
  WorldSetting,
} from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'

import { SEASON_NAMES } from '../constants'
import { getSeasonForMonth } from './calendar-season.js'
import { timeSystem } from '../subsystems/time-system'

const CANONICAL_DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

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
  calendarName: string
  month: number
  day: number
  localTotalDays: number
  daysPerYear: number
  monthsPerYear: number
  usesCanonicalSolarSeasons: boolean
  age: number
  timeLabel: string
}

export interface NarrativeCalendarNode {
  calendarYear: number
  calendarName: string
  seasonName: string
  month: number
  day: number
  localTotalDays: number
  daysPerYear: number
  monthsPerYear: number
  usesCanonicalSolarSeasons: boolean
}

function readLocalCalendarProjection(config: Record<string, unknown>): {
  calendar: LocalCalendarProfile
  clock: LocalClockState
} | null {
  const calendar = config._localCalendar
  const clock = config._localClock
  if (!calendar || typeof calendar !== 'object' || Array.isArray(calendar)) return null
  if (!clock || typeof clock !== 'object' || Array.isArray(clock)) return null

  const c = calendar as Partial<LocalCalendarProfile>
  const k = clock as Partial<LocalClockState>
  if (
    typeof c.daysPerYear !== 'number'
    || !Number.isFinite(c.daysPerYear)
    || c.daysPerYear <= 0
    || typeof c.monthsPerYear !== 'number'
    || !Number.isFinite(c.monthsPerYear)
    || c.monthsPerYear <= 0
    || typeof c.timeScale !== 'number'
    || !Number.isFinite(c.timeScale)
    || c.timeScale < 0
    || typeof k.totalLocalDays !== 'number'
    || !Number.isFinite(k.totalLocalDays)
    || typeof k.lastGlobalTotalDays !== 'number'
    || !Number.isFinite(k.lastGlobalTotalDays)
  ) return null

  return {
    calendar: {
      calendarId: typeof c.calendarId === 'string' ? c.calendarId : 'local-calendar',
      displayName: typeof c.displayName === 'string' && c.displayName.trim()
        ? c.displayName.trim()
        : '当地历法',
      daysPerYear: Math.max(1, Math.floor(c.daysPerYear)),
      monthsPerYear: Math.max(1, Math.floor(c.monthsPerYear)),
      timeScale: c.timeScale,
      pausedWhenInactive: c.pausedWhenInactive !== false,
    },
    clock: {
      totalLocalDays: Math.max(0, k.totalLocalDays),
      lastGlobalTotalDays: Math.max(0, k.lastGlobalTotalDays),
    },
  }
}

function formatLocalNarrativeTimeLabel(
  timeStep: TimeStep,
  eraLabel: string,
  node: Pick<NarrativeCalendarNode, 'seasonName' | 'month' | 'day'>,
): string {
  const seasonLabel = node.seasonName.endsWith('时节') ? node.seasonName : `${node.seasonName}季`
  switch (timeStep.unit) {
    case 'day':
      return `${eraLabel} · ${seasonLabel} · ${node.month}月${node.day}日`
    case 'month':
      return `${eraLabel} · ${seasonLabel} · ${node.month}月`
    case 'season':
      return `${eraLabel} · ${seasonLabel}`
    case 'year':
    default:
      return eraLabel
  }
}

/** 由唯一全局天数派生当前上下文的当地日期；只读计算，不建立第二条时间线。 */
export function resolveNarrativeCalendarNode(
  globalTotalDays: number,
  worldSetting: WorldSetting | null,
): NarrativeCalendarNode | null {
  const config = (worldSetting?.config ?? {}) as Record<string, unknown>
  const projection = readLocalCalendarProjection(config)
  if (!projection) return null

  const { calendar, clock } = projection
  const simulationScope = worldSetting?.simulationScope ?? 'active'
  const shouldAdvance = simulationScope === 'active'
    || (simulationScope === 'background' && !calendar.pausedWhenInactive)
  const elapsedGlobalDays = Math.max(0, globalTotalDays - clock.lastGlobalTotalDays)
  const localTotalDays = clock.totalLocalDays
    + (shouldAdvance ? elapsedGlobalDays * calendar.timeScale : 0)
  const normalizedLocalDays = Math.max(0, Math.floor(localTotalDays))
  const localYear = Math.floor(normalizedLocalDays / calendar.daysPerYear)
  const dayOfYearZero = normalizedLocalDays % calendar.daysPerYear
  const canonicalCalendar = calendar.calendarId === 'canonical-365'
    && calendar.daysPerYear === 365
    && calendar.monthsPerYear === 12
  let monthIndex: number
  let localDay: number
  if (canonicalCalendar) {
    let remaining = dayOfYearZero
    monthIndex = 0
    while (
      monthIndex < CANONICAL_DAYS_IN_MONTH.length - 1
      && remaining >= CANONICAL_DAYS_IN_MONTH[monthIndex]
    ) {
      remaining -= CANONICAL_DAYS_IN_MONTH[monthIndex]
      monthIndex++
    }
    localDay = remaining + 1
  } else {
    monthIndex = Math.min(
      calendar.monthsPerYear - 1,
      Math.floor(dayOfYearZero * calendar.monthsPerYear / calendar.daysPerYear),
    )
    const monthStartDay = Math.floor(monthIndex * calendar.daysPerYear / calendar.monthsPerYear)
    localDay = dayOfYearZero - monthStartDay + 1
  }
  const eraStartYear = readEraStartYearFromConfig(config)
  const birthEraYear = readBirthEraYearFromConfig(config)
  const calendarYear = resolveCalendarEraYear(localYear + 1, eraStartYear, birthEraYear)
  const seasonIndex = canonicalCalendar
    ? getSeasonForMonth(monthIndex)
    : Math.min(3, Math.floor(monthIndex * 4 / calendar.monthsPerYear))

  return {
    calendarYear,
    calendarName: calendar.displayName,
    seasonName: canonicalCalendar
      ? (SEASON_NAMES[seasonIndex] ?? '')
      : `第${seasonIndex + 1}时节`,
    month: monthIndex + 1,
    day: localDay,
    localTotalDays,
    daysPerYear: calendar.daysPerYear,
    monthsPerYear: calendar.monthsPerYear,
    usesCanonicalSolarSeasons: canonicalCalendar,
  }
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
  const localNode = resolveNarrativeCalendarNode(context.totalDays, worldSetting)
  if (localNode) {
    const defaultEraName = (typeof config._eraName === 'string' && config._eraName)
      ? config._eraName
      : (eraStartYear !== 0 ? '' : '创世纪元')
    const eraLabel = formatEraYear(localNode.calendarYear, defaultEraName)
    const timeStep = context.timeStep ?? { unit: 'year', value: 1 }
    return {
      ...localNode,
      eraLabel,
      age,
      timeLabel: formatLocalNarrativeTimeLabel(timeStep, eraLabel, localNode),
    }
  }

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
    calendarName: '规范阳历',
    month: context.round.month + 1,
    day: ((context.round as { day?: number }).day ?? 0) + 1,
    localTotalDays: context.totalDays,
    daysPerYear: 365,
    monthsPerYear: 12,
    usesCanonicalSolarSeasons: true,
    age,
    timeLabel,
  }
}
