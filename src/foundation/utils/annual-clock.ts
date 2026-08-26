/**
 * Purpose: Provide the canonical annual base-point clock used by simulation rounds.
 * Owner: foundation:time
 * Responsibility: Keep annual event allocation and calendar projection deterministic.
 *
 * @module annual-clock.ts
 * @description 年度基础点时钟纯函数
 * @mod foundation
 */

/** One natural year is represented by this many integer simulation points. */
export const BASE_POINTS_PER_YEAR = 1_000 as const

/** One event round must consume at least one point. */
export const MAX_ANNUAL_EVENT_COUNT = BASE_POINTS_PER_YEAR

/** Default annual story-event budget used when a legacy step is restored. */
export const DEFAULT_ANNUAL_EVENT_COUNT = 12 as const

/** The derived display calendar remains a 365-day civil calendar. */
export const CALENDAR_DAYS_PER_YEAR = 365 as const

export interface AnnualEventCursor {
  /** Absolute natural year, with year 0 as the initial epoch. */
  year: number
  /** Number of event rounds already consumed in the current year. */
  eventIndex: number
  /** Frozen event budget for the current year. */
  eventCount: number
  /** Absolute base-point position. */
  totalBasePoints: number
}

export interface AnnualEventAdvance {
  cursor: AnnualEventCursor
  /** Integer base points consumed by this event round. */
  basePointsPassed: number
  crossedYear: boolean
}

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正安全整数`)
  }
  return value
}

/** Normalize persisted or UI budgets while preventing zero-point event rounds. */
export function normalizeAnnualEventCount(value: number, fallback = DEFAULT_ANNUAL_EVENT_COUNT): number {
  const normalizedFallback = Math.min(assertPositiveInteger(fallback, '默认事件数'), MAX_ANNUAL_EVENT_COUNT)
  if (!Number.isFinite(value)) return normalizedFallback
  const candidate = Math.floor(value)
  return candidate > 0 && Number.isSafeInteger(candidate)
    ? Math.min(candidate, MAX_ANNUAL_EVENT_COUNT)
    : normalizedFallback
}

/**
 * Return the exact cumulative point target after `eventIndex` events in a year.
 * Index 0 is the beginning of the year and index N is the year boundary.
 */
export function annualEventCumulativeBasePoints(
  eventIndex: number,
  eventCount: number,
): number {
  const count = normalizeAnnualEventCount(eventCount)
  if (!Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex > count) {
    throw new Error(`事件索引必须位于 0 到 ${count} 之间`)
  }
  return Math.floor((eventIndex * BASE_POINTS_PER_YEAR) / count)
}

/** Integer point delta between two event boundaries in the same annual budget. */
export function annualEventBasePointDelta(
  previousIndex: number,
  nextIndex: number,
  eventCount: number,
): number {
  if (nextIndex < previousIndex) {
    throw new Error('事件索引不能倒退')
  }
  return annualEventCumulativeBasePoints(nextIndex, eventCount)
    - annualEventCumulativeBasePoints(previousIndex, eventCount)
}

/** Stable public name for the per-round event allocation helper. */
export const eventRoundDeltaPoints = annualEventBasePointDelta

/** Project an absolute base-point position to the derived 365-day calendar. */
export function calendarDaysFromBasePoints(totalBasePoints: number): number {
  if (!Number.isFinite(totalBasePoints) || totalBasePoints <= 0) return 0
  return Math.floor((Math.floor(totalBasePoints) * CALENDAR_DAYS_PER_YEAR) / BASE_POINTS_PER_YEAR)
}

/** Stable public name for the derived calendar projection. */
export const basePointsToCalendarDays = calendarDaysFromBasePoints

/** Best-effort one-time migration of a legacy absolute day cursor to base points. */
export function basePointsFromCalendarDays(totalDays: number): number {
  if (!Number.isFinite(totalDays) || totalDays <= 0) return 0
  return Math.floor((Math.floor(totalDays) * BASE_POINTS_PER_YEAR) / CALENDAR_DAYS_PER_YEAR)
}

/** Stable public name for one-time legacy day migration. */
export const calendarDaysToBasePoints = basePointsFromCalendarDays

/** Convert an absolute base-point position to elapsed natural years. */
export function basePointsToYears(totalBasePoints: number): number {
  if (!Number.isFinite(totalBasePoints) || totalBasePoints <= 0) return 0
  return Math.floor(totalBasePoints) / BASE_POINTS_PER_YEAR
}

/**
 * Advance one event round using the frozen annual budget.
 * The cumulative formula guarantees that all N deltas sum to exactly 1000.
 */
export function advanceAnnualEvent(cursor: AnnualEventCursor): AnnualEventAdvance {
  const eventCount = normalizeAnnualEventCount(cursor.eventCount)
  const year = Number.isSafeInteger(cursor.year) && cursor.year >= 0 ? cursor.year : 0
  const eventIndex = Number.isSafeInteger(cursor.eventIndex)
    ? Math.max(0, Math.min(eventCount - 1, cursor.eventIndex))
    : 0
  const expectedCurrent = year * BASE_POINTS_PER_YEAR
    + annualEventCumulativeBasePoints(eventIndex, eventCount)
  const current = Number.isSafeInteger(cursor.totalBasePoints) && cursor.totalBasePoints >= 0
    ? cursor.totalBasePoints
    : expectedCurrent

  const nextIndex = eventIndex + 1
  if (nextIndex >= eventCount) {
    const nextTotal = (year + 1) * BASE_POINTS_PER_YEAR
    return {
      cursor: {
        year: year + 1,
        eventIndex: 0,
        eventCount,
        totalBasePoints: nextTotal,
      },
      basePointsPassed: Math.max(0, nextTotal - current),
      crossedYear: true,
    }
  }

  const nextTotal = year * BASE_POINTS_PER_YEAR
    + annualEventCumulativeBasePoints(nextIndex, eventCount)
  return {
    cursor: {
      year,
      eventIndex: nextIndex,
      eventCount,
      totalBasePoints: nextTotal,
    },
    basePointsPassed: Math.max(0, nextTotal - current),
    crossedYear: false,
  }
}
