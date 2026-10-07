/**
 * Purpose: Provide the canonical calendar conversions used by engine systems.
 * Owner: mod-engine/time-system
 * Responsibility: Keep month/day and absolute-day arithmetic on the shared calendar definition.
 */

import { CALENDAR } from '../constants'

export interface CalendarDate {
  year: number
  month: number
  day: number
}

/** Convert a 1-based day-of-year into the engine's 0-based month/day cursor. */
export function monthAndDayFromDayOfYear(dayOfYear: number): { month: number; day: number } {
  let remaining = Math.max(0, Math.floor(dayOfYear) - 1)
  for (let month = 0; month < CALENDAR.MONTHS_PER_YEAR; month += 1) {
    const daysInMonth = CALENDAR.DAYS_IN_MONTH[month]
    if (remaining < daysInMonth) return { month, day: remaining }
    remaining -= daysInMonth
  }
  return {
    month: CALENDAR.MONTHS_PER_YEAR - 1,
    day: CALENDAR.DAYS_IN_MONTH.at(-1)! - 1,
  }
}

/** Convert a 1-based calendar month/day into a 1-based day-of-year. */
export function dayOfYearFromMonthAndDay(month: number, day: number): number {
  const normalizedMonth = Math.min(
    CALENDAR.MONTHS_PER_YEAR,
    Math.max(1, Math.floor(month)),
  )
  const daysInMonth = CALENDAR.DAYS_IN_MONTH[normalizedMonth - 1] ?? CALENDAR.DAYS_IN_MONTH[0]
  const normalizedDay = Math.min(daysInMonth, Math.max(1, Math.floor(day)))
  return CALENDAR.DAYS_IN_MONTH
    .slice(0, normalizedMonth - 1)
    .reduce((sum, days) => sum + days, 0) + normalizedDay
}

export function daysInCalendarMonth(month: number): number {
  const normalizedMonth = Math.min(
    CALENDAR.MONTHS_PER_YEAR,
    Math.max(1, Math.floor(month)),
  )
  return CALENDAR.DAYS_IN_MONTH[normalizedMonth - 1] ?? CALENDAR.DAYS_IN_MONTH[0]
}

/** Convert a non-negative absolute day count into a 1-based calendar date. */
export function calendarDateFromTotalDays(totalDays: number, calendarYearOffset = 0): CalendarDate {
  const normalizedDays = Math.max(0, Math.floor(totalDays))
  const elapsedYears = Math.floor(normalizedDays / CALENDAR.DAYS_PER_YEAR)
  const { month, day } = monthAndDayFromDayOfYear(
    (normalizedDays % CALENDAR.DAYS_PER_YEAR) + 1,
  )
  return {
    year: elapsedYears + calendarYearOffset,
    month: month + 1,
    day: day + 1,
  }
}

/** Convert a calendar date to the absolute day count used by the engine. */
export function totalDaysFromCalendarDate(date: CalendarDate): number {
  return date.year * CALENDAR.DAYS_PER_YEAR
    + dayOfYearFromMonthAndDay(date.month, date.day)
    - 1
}
