/**
 * @module festival-calendar.ts
 * @description 节日日期纯函数 —— 将 CultureState 中的配置按真实月/日精确匹配
 * @mod mod-culture
 */

import type { Festival } from '../types'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/** 当前轻量适配器没有节日锚定年份；多年周期节日必须等年份契约恢复后再宣布。 */
function isObservableWithoutYearAnchor(festival: Festival): boolean {
  return (festival.frequencyYears ?? 1) <= 1
}

export function parseFestivalMonthDay(date: string): { month: number; day: number } | null {
  const match = date.trim().match(/^(\d{1,2})(?:-|\/|月)(\d{1,2})(?:日)?$/)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  const maxDay = DAYS_IN_MONTH[month - 1]
  if (!maxDay || day < 1 || day > maxDay) return null
  return { month, day }
}

/** 只按精确月/日匹配，避免旧实现“同月即视为节日”的误触发。 */
export function findFestivalsOnDate(
  festivals: readonly Festival[],
  month: number,
  day: number,
): Festival[] {
  return festivals.filter((festival) => {
    if (!isObservableWithoutYearAnchor(festival)) return false
    const parsed = parseFestivalMonthDay(festival.date)
    return parsed?.month === month && parsed.day === day
  })
}

export function findFestivalsInMonth(
  festivals: readonly Festival[],
  month: number,
): Festival[] {
  return festivals.filter((festival) => (
    isObservableWithoutYearAnchor(festival)
    && parseFestivalMonthDay(festival.date)?.month === month
  ))
}
