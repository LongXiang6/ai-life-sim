/**
 * Purpose: Provide the compatibility projection between calendar days and business points.
 * Owner: foundation:time
 * Responsibility: Keep the existing numeric time contract deterministic without owning calendar advancement.
 *
 * @module annual-clock.ts
 * @description 日历与基础点换算纯函数
 * @mod foundation
 */

/** One natural year is represented by this many compatibility points. */
export const BASE_POINTS_PER_YEAR = 1_000 as const

/** The civil calendar projection uses a 365-day year. */
export const CALENDAR_DAYS_PER_YEAR = 365 as const

/** Project an absolute calendar day cursor to the existing business-point scale. */
export function basePointsFromCalendarDays(totalDays: number): number {
  if (!Number.isFinite(totalDays) || totalDays <= 0) return 0
  return Math.floor((Math.floor(totalDays) * BASE_POINTS_PER_YEAR) / CALENDAR_DAYS_PER_YEAR)
}

/** Stable public name for the calendar-to-point projection. */
export const calendarDaysToBasePoints = basePointsFromCalendarDays

/** Project an absolute business-point cursor to elapsed calendar days. */
export function calendarDaysFromBasePoints(totalBasePoints: number): number {
  if (!Number.isFinite(totalBasePoints) || totalBasePoints <= 0) return 0
  return Math.floor((Math.floor(totalBasePoints) * CALENDAR_DAYS_PER_YEAR) / BASE_POINTS_PER_YEAR)
}

/** Stable public name for the point-to-calendar projection. */
export const basePointsToCalendarDays = calendarDaysFromBasePoints

/** Convert an absolute point position to elapsed natural years. */
export function basePointsToYears(totalBasePoints: number): number {
  if (!Number.isFinite(totalBasePoints) || totalBasePoints <= 0) return 0
  return Math.floor(totalBasePoints) / BASE_POINTS_PER_YEAR
}
