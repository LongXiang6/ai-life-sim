/**
 * Purpose: Own the canonical annual base-point clock and derived calendar.
 * Owner: mod-engine/time
 * Responsibility: Advance year/event steps and expose one consistent round projection.
 *
 * @module time-system.ts
 * @description 年度基础点时间子系统
 * @mod mod-engine
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import {
  BASE_POINTS_PER_YEAR,
  CALENDAR_DAYS_PER_YEAR,
  DEFAULT_ANNUAL_EVENT_COUNT,
  advanceAnnualEvent,
  basePointsFromCalendarDays,
  calendarDaysFromBasePoints,
  normalizeAnnualEventCount,
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

function createInitialRound(): RoundInfo {
  return {
    year: 0,
    season: getSeasonForMonth(0),
    month: 0,
    day: 0,
    dayOfYear: 1,
    totalDays: 0,
    totalBasePoints: 0,
    basePointsPassed: 0,
    eventNodeCount: DEFAULT_ANNUAL_EVENT_COUNT,
    eventNodeIndex: 0,
    ...resolveDisplayEra(0),
  }
}

function createDefaultTimeStep(): TimeStep {
  return { ...DEFAULT_ENGINE_CONFIG.timeStep }
}

function normalizeTimeStep(step: Partial<TimeStep> | undefined): TimeStep {
  const rawValue = typeof step?.value === 'number' ? step.value : Number(step?.value)
  const value = Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 1
  if (step?.unit === 'year') return { unit: 'year', value }
  if (step?.unit === 'event') return { unit: 'event', value: normalizeAnnualEventCount(value) }
  // Legacy day/month/season values are normalized only at the runtime boundary.
  return { unit: 'event', value: DEFAULT_ANNUAL_EVENT_COUNT }
}

function normalizeBasePoints(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function inferEventIndex(totalBasePoints: number, eventCount: number): number {
  const count = normalizeAnnualEventCount(eventCount)
  const yearOffset = ((Math.floor(totalBasePoints) % BASE_POINTS_PER_YEAR) + BASE_POINTS_PER_YEAR)
    % BASE_POINTS_PER_YEAR
  let index = Math.floor((yearOffset * count) / BASE_POINTS_PER_YEAR)
  while (index < count && Math.floor(((index + 1) * BASE_POINTS_PER_YEAR) / count) <= yearOffset) index++
  return Math.max(0, Math.min(count - 1, index))
}

function roundFromBasePoints(
  totalBasePoints: number,
  options: {
    eventNodeCount?: number
    eventNodeIndex?: number
    basePointsPassed?: number
  } = {},
): RoundInfo {
  const normalizedBasePoints = normalizeBasePoints(totalBasePoints)
  const totalDays = calendarDaysFromBasePoints(normalizedBasePoints)
  const year = Math.floor(totalDays / CALENDAR_DAYS_PER_YEAR)
  const dayOfYear = (totalDays % CALENDAR_DAYS_PER_YEAR) + 1
  let remaining = dayOfYear - 1
  let month = 0
  let day = 0
  for (let m = 0; m < CALENDAR.MONTHS_PER_YEAR; m++) {
    const daysInMonth = CALENDAR.DAYS_IN_MONTH[m]
    if (remaining < daysInMonth) {
      month = m
      day = remaining
      break
    }
    remaining -= daysInMonth
  }
  return {
    year,
    season: getSeasonForMonth(month),
    month,
    day,
    dayOfYear,
    totalDays,
    totalBasePoints: normalizedBasePoints,
    basePointsPassed: Math.max(0, Math.floor(options.basePointsPassed ?? 0)),
    ...(options.eventNodeCount !== undefined
      ? { eventNodeCount: normalizeAnnualEventCount(options.eventNodeCount) }
      : {}),
    ...(options.eventNodeIndex !== undefined
      ? { eventNodeIndex: Math.max(0, Math.floor(options.eventNodeIndex)) }
      : {}),
    ...resolveDisplayEra(year),
  }
}

/** Event/year transitions never align to an obsolete day/month/season boundary. */
export function shouldAlignTimeStepTransition(
  _prevUnit: TimeStep['unit'],
  _newUnit: TimeStep['unit'],
): boolean {
  return false
}

/** Kept as a no-op API for restored callers; canonical event/year time has no period alignment. */
export function alignRoundToNextPeriod(
  _prevUnit: TimeStep['unit'],
  _newUnit: TimeStep['unit'],
  round: RoundInfo,
  _prevValue = 1,
): RoundInfo {
  return { ...round, basePointsPassed: 0 }
}

export class TimeSystem implements ISubSystem {
  readonly id = 'time' as const
  readonly mod = 'mod-engine' as const
  readonly label = '时间系统' as const
  readonly description = '每年1000基础点、年内按事件轮次推进；日期仅为派生显示' as const

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

  /** Legacy display adapter; business systems should consume getBasePointsPassed(). */
  getDaysPassed(): number {
    return this.lastDaysPassed
  }

  setTimeStep(step: TimeStep): void {
    this.timeStep = normalizeTimeStep(step)
  }

  alignToNextPeriod(prevUnit: TimeStep['unit'], newUnit: TimeStep['unit'], prevValue = 1): RoundInfo {
    const aligned = alignRoundToNextPeriod(prevUnit, newUnit, this.round, prevValue)
    this.round = structuredClone(aligned)
    this.lastBasePointsPassed = 0
    this.lastDaysPassed = 0
    return this.getRound()
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

  /** Advance a macro year span by exactly Y*1000 base points. */
  skipYears(n: number): RoundInfo {
    const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
    const before = this.round.totalBasePoints
    const next = before + count * BASE_POINTS_PER_YEAR
    const eventCount = this.round.eventNodeCount
    const eventIndex = eventCount !== undefined ? inferEventIndex(next, eventCount) : undefined
    this.round = roundFromBasePoints(next, {
      eventNodeCount: eventCount,
      eventNodeIndex: eventIndex,
      basePointsPassed: next - before,
    })
    this.lastBasePointsPassed = next - before
    this.lastDaysPassed = this.round.totalDays - calendarDaysFromBasePoints(before)
    return this.getRound()
  }

  advance(): RoundInfo {
    const beforeBasePoints = this.round.totalBasePoints
    const beforeDays = this.round.totalDays
    let result: RoundInfo
    if (this.timeStep.unit === 'year') {
      const count = Math.max(1, Math.floor(this.timeStep.value))
      const nextBasePoints = beforeBasePoints + count * BASE_POINTS_PER_YEAR
      const eventCount = this.round.eventNodeCount
      result = roundFromBasePoints(nextBasePoints, {
        eventNodeCount: eventCount,
        eventNodeIndex: eventCount !== undefined ? inferEventIndex(nextBasePoints, eventCount) : undefined,
        basePointsPassed: nextBasePoints - beforeBasePoints,
      })
    } else {
      const desiredCount = normalizeAnnualEventCount(this.timeStep.value)
      // Freeze a budget once the current year has consumed an event. A new N
      // takes effect at the next natural-year boundary.
      const activeCount = this.round.eventNodeIndex && this.round.eventNodeCount
        ? this.round.eventNodeCount
        : desiredCount
      const currentYear = Math.floor(beforeBasePoints / BASE_POINTS_PER_YEAR)
      const atYearBoundary = beforeBasePoints % BASE_POINTS_PER_YEAR === 0
      const currentIndex = (this.round.eventNodeCount === activeCount || atYearBoundary)
        && Number.isSafeInteger(this.round.eventNodeIndex)
        ? Math.max(0, Math.min(activeCount - 1, this.round.eventNodeIndex ?? 0))
        : inferEventIndex(beforeBasePoints, activeCount)
      const advanced = advanceAnnualEvent({
        year: currentYear,
        eventIndex: currentIndex,
        eventCount: activeCount,
        totalBasePoints: beforeBasePoints,
      })
      result = roundFromBasePoints(advanced.cursor.totalBasePoints, {
        eventNodeCount: advanced.cursor.eventCount,
        eventNodeIndex: advanced.cursor.eventIndex,
        basePointsPassed: advanced.basePointsPassed,
      })
    }
    this.round = result
    this.lastBasePointsPassed = Math.max(0, result.totalBasePoints - beforeBasePoints)
    this.lastDaysPassed = Math.max(0, result.totalDays - beforeDays)
    this.syncEraFields()
    return this.getRound()
  }

  collectState(_context: RoundContext): SubSystemState {
    const r = this.round
    const monthName = MONTH_ZH[r.month]
    const eventHint = r.eventNodeCount !== undefined
      ? `；本年事件${r.eventNodeIndex ?? 0}/${r.eventNodeCount}`
      : ''
    const summary = `【${this.label}】${r.eraName}${r.eraYear}年（${r.reignTitle}${r.reignYear}年）${monthName}第${r.day + 1}日${eventHint}`
    return {
      id: this.id,
      summary,
      data: structuredClone({
        round: this.round,
        timeStep: this.timeStep,
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
      const migratedBasePoints = incoming.totalBasePoints !== undefined
        ? normalizeBasePoints(incoming.totalBasePoints)
        : basePointsFromCalendarDays(normalizeBasePoints(incoming.totalDays))
      this.round = roundFromBasePoints(migratedBasePoints, {
        eventNodeCount: incoming.eventNodeCount,
        eventNodeIndex: incoming.eventNodeIndex,
        basePointsPassed: incoming.basePointsPassed,
      })
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
    const totalBasePoints = legacy.totalBasePoints !== undefined
      ? normalizeBasePoints(legacy.totalBasePoints)
      : basePointsFromCalendarDays(normalizeBasePoints(legacy.totalDays))
    const eventCount = legacy.eventNodeCount !== undefined
      ? normalizeAnnualEventCount(legacy.eventNodeCount)
      : undefined
    const eventIndex = eventCount !== undefined && Number.isSafeInteger(legacy.eventNodeIndex)
      ? Math.max(0, Math.min(eventCount - 1, legacy.eventNodeIndex ?? 0))
      : eventCount !== undefined
        ? inferEventIndex(totalBasePoints, eventCount)
        : undefined
    this.round = roundFromBasePoints(totalBasePoints, {
      eventNodeCount: eventCount,
      eventNodeIndex: eventIndex,
      basePointsPassed: 0,
    })
    this.lastBasePointsPassed = 0
    this.lastDaysPassed = 0
    this.syncEraFields()
  }
}

export const timeSystem = new TimeSystem()
