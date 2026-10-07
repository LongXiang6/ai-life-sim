/**
 * Purpose: Own the canonical calendar cursor and derived business-time projection.
 * Owner: mod-engine/time
 * Responsibility: Advance day/month/season/year steps and expose one consistent round projection.
 *
 * @module time-system.ts
 * @description 日历时间子系统
 * @mod mod-engine
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import {
  BASE_POINTS_PER_YEAR,
  CALENDAR_DAYS_PER_YEAR,
  basePointsFromCalendarDays,
  calendarDaysFromBasePoints,
  normalizeCanonicalTimeStep,
} from '@/foundation'
import type { TimeStep, RoundInfo } from '../types'
import {
  CALENDAR,
  DEFAULT_ENGINE_CONFIG,
  SEASON_NAMES,
  MONTH_ZH,
  ERA_SPAN,
  ERA_NAME_POOL,
  REIGN_TITLES,
  REIGN_DURATION,
} from '../constants'
import { getSeasonForMonth } from '../helpers/calendar-season.js'

function resolveDisplayEra(year: number): Pick<RoundInfo, 'eraName' | 'eraYear' | 'reignTitle' | 'reignYear'> {
  const safeYear = Math.max(1, Math.floor(year))
  const eraIndex = Math.max(0, Math.floor((safeYear - 1) / ERA_SPAN))
  const eraName = ERA_NAME_POOL[eraIndex % ERA_NAME_POOL.length]
  const eraStartYear = eraIndex * ERA_SPAN
  const eraYear = safeYear - eraStartYear
  const reignIndex = Math.floor((safeYear - 1) / REIGN_DURATION) % REIGN_TITLES.length
  const reignTitle = REIGN_TITLES[reignIndex]
  const reignYear = ((safeYear - 1) % REIGN_DURATION) + 1
  return { eraName, eraYear, reignTitle, reignYear }
}

function normalizeNonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function monthAndDayFromDayOfYear(dayOfYear: number): { month: number; day: number } {
  let remaining = Math.max(0, Math.floor(dayOfYear) - 1)
  for (let month = 0; month < CALENDAR.MONTHS_PER_YEAR; month += 1) {
    const daysInMonth = CALENDAR.DAYS_IN_MONTH[month]
    if (remaining < daysInMonth) return { month, day: remaining }
    remaining -= daysInMonth
  }
  return { month: CALENDAR.MONTHS_PER_YEAR - 1, day: CALENDAR.DAYS_IN_MONTH.at(-1)! - 1 }
}

export function projectRoundFromTotalDays(totalDays: number, previousTotalDays = 0): RoundInfo {
  const normalizedDays = normalizeNonNegativeInteger(totalDays)
  const normalizedPreviousDays = normalizeNonNegativeInteger(previousTotalDays)
  const year = Math.floor(normalizedDays / CALENDAR_DAYS_PER_YEAR)
  const dayOfYear = (normalizedDays % CALENDAR_DAYS_PER_YEAR) + 1
  const { month, day } = monthAndDayFromDayOfYear(dayOfYear)
  const totalBasePoints = basePointsFromCalendarDays(normalizedDays)
  const previousBasePoints = basePointsFromCalendarDays(normalizedPreviousDays)
  return {
    year,
    season: getSeasonForMonth(month),
    month,
    day,
    dayOfYear,
    totalDays: normalizedDays,
    totalBasePoints,
    basePointsPassed: Math.max(0, totalBasePoints - previousBasePoints),
    ...resolveDisplayEra(year),
  }
}

function createInitialRound(): RoundInfo {
  return projectRoundFromTotalDays(0)
}

function createDefaultTimeStep(): TimeStep {
  return { ...DEFAULT_ENGINE_CONFIG.timeStep }
}

function normalizeTimeStep(step: Partial<TimeStep> | undefined): TimeStep {
  return normalizeCanonicalTimeStep(step)
}

function daysInCurrentSeason(month: number): number {
  const firstMonth = Math.max(0, Math.floor(month))
  let total = 0
  for (let index = 0; index < CALENDAR.MONTHS_PER_SEASON; index += 1) {
    total += CALENDAR.DAYS_IN_MONTH[(firstMonth + index) % CALENDAR.MONTHS_PER_YEAR]
  }
  return total
}

function daysForStep(round: RoundInfo, timeStep: TimeStep): number {
  switch (timeStep.unit) {
    case 'day':
      return Math.max(1, Math.floor(timeStep.value))
    case 'month':
      return CALENDAR.DAYS_IN_MONTH[round.month] ?? CALENDAR.DAYS_IN_MONTH[0]
    case 'season':
      return daysInCurrentSeason(round.month)
    case 'year':
      return Math.max(1, Math.floor(timeStep.value)) * CALENDAR_DAYS_PER_YEAR
  }
}

export class TimeSystem implements ISubSystem {
  readonly id = 'time' as const
  readonly mod = 'mod-engine' as const
  readonly label = '时间系统' as const
  readonly description = '按真实日历的日、月、季或年推进；基础点仅作业务投影' as const

  private round: RoundInfo = createInitialRound()
  private timeStep: TimeStep = createDefaultTimeStep()
  private lastBasePointsPassed = 0
  private lastDaysPassed = 0

  getRound(): RoundInfo {
    return { ...this.round }
  }

  getBasePointsPassed(): number {
    return this.lastBasePointsPassed
  }

  getDaysPassed(): number {
    return this.lastDaysPassed
  }

  setTimeStep(step: TimeStep): void {
    this.timeStep = normalizeTimeStep(step)
  }

  getSeasonName(): string {
    return SEASON_NAMES[getSeasonForMonth(this.round.month)]
  }

  static resolveDisplayEra(year: number): Pick<RoundInfo, 'eraName' | 'eraYear' | 'reignTitle' | 'reignYear'> {
    return resolveDisplayEra(year)
  }

  private syncEraFields(): void {
    const era = resolveDisplayEra(this.round.year)
    this.round.eraName = era.eraName
    this.round.eraYear = era.eraYear
    this.round.reignTitle = era.reignTitle
    this.round.reignYear = era.reignYear
  }

  skipYears(n: number): RoundInfo {
    const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
    return this.commitAdvance(count * CALENDAR_DAYS_PER_YEAR)
  }

  private commitAdvance(days: number): RoundInfo {
    const previousDays = this.round.totalDays
    const nextDays = previousDays + Math.max(0, Math.floor(days))
    this.round = projectRoundFromTotalDays(nextDays, previousDays)
    this.lastDaysPassed = this.round.totalDays - previousDays
    this.lastBasePointsPassed = this.round.basePointsPassed ?? 0
    this.syncEraFields()
    return this.getRound()
  }

  advance(): RoundInfo {
    return this.commitAdvance(daysForStep(this.round, this.timeStep))
  }

  collectState(_context: RoundContext): SubSystemState {
    const r = this.round
    const monthName = MONTH_ZH[r.month]
    const summary = `【${this.label}】${r.eraName}${r.eraYear}年（${r.reignTitle}${r.reignYear}年）${monthName}第${r.day + 1}日`
    return {
      id: this.id,
      summary,
      data: structuredClone({
        round: this.round,
        timeStep: this.timeStep,
        calendarDaysPerYear: CALENDAR_DAYS_PER_YEAR,
        basePointsPerYear: BASE_POINTS_PER_YEAR,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] Invalid changes: expected object`)
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') throw new Error(`[${this.id}] Missing changes.description`)
    const c = changes.changes
    if (c.round && typeof c.round === 'object' && !Array.isArray(c.round)) {
      const incoming = c.round as Partial<RoundInfo>
      const totalDays = incoming.totalDays !== undefined
        ? normalizeNonNegativeInteger(incoming.totalDays)
        : calendarDaysFromBasePoints(normalizeNonNegativeInteger(incoming.totalBasePoints))
      this.round = projectRoundFromTotalDays(totalDays)
      this.syncEraFields()
    }
    if (c.timeStep) this.setTimeStep(c.timeStep as unknown as TimeStep)
  }

  reset(): void {
    this.round = createInitialRound()
    this.timeStep = createDefaultTimeStep()
    this.lastBasePointsPassed = 0
    this.lastDaysPassed = 0
  }

  exportRound(): RoundInfo {
    return structuredClone(this.round)
  }

  importRound(round: RoundInfo): void {
    const legacy = round as RoundInfo & { totalBasePoints?: number }
    const totalDays = legacy.totalDays !== undefined
      ? normalizeNonNegativeInteger(legacy.totalDays)
      : calendarDaysFromBasePoints(normalizeNonNegativeInteger(legacy.totalBasePoints))
    this.round = projectRoundFromTotalDays(totalDays)
    this.lastBasePointsPassed = 0
    this.lastDaysPassed = 0
    this.syncEraFields()
  }
}

export const timeSystem = new TimeSystem()
