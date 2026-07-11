/**
 * @module calendar-context.ts
 * @description dormant CultureSystem 的轻量节日适配器；只读已配置节日，不启动文化模拟
 * @mod mod-culture
 */

import { useCultureStore } from './store'
import { findFestivalsInMonth, findFestivalsOnDate } from './utils/festival-calendar'

export interface CultureCalendarNarrativeInput {
  timeStep: { unit: 'day' | 'month' | 'season' | 'year'; value: number }
  month: number
  day: number
}

/**
 * Remote Interface 暴露的可选叙事上下文。
 * 默认空 store 不硬套任何国家节日；只有世界配置实际写入 festivals 后才输出具名节日。
 */
export function buildCultureCalendarNarrativeContext(
  input: CultureCalendarNarrativeInput,
): string | undefined {
  const festivals = useCultureStore.getState().culture.festivals
  if (festivals.length === 0) return undefined

  const matched = input.timeStep.unit === 'day'
    ? findFestivalsOnDate(festivals, input.month, input.day)
    : input.timeStep.unit === 'month'
      ? findFestivalsInMonth(festivals, input.month)
      : []
  if (matched.length === 0) return undefined

  const label = input.timeStep.unit === 'day' ? '当前日期命中已配置节日' : '本月已配置节日'
  return `【${label}】${matched.map((festival) => `${festival.name}：${festival.description}`).join('；')}`
}
