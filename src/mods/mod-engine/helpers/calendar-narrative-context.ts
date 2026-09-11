/**
 * Purpose: Assemble fixed-calendar and social-rhythm guidance for the main narrative.
 * Owner: mod-engine / time-system
 * Responsibility: Prompt projection only; time state and story selection remain with their owners.
 */

import { basePointsFromCalendarDays, type TimeStep } from '@/foundation'
import { buildCanonicalCalendarNarrativeHint } from './time-scale-narrative'

export interface CalendarNarrativeContextInput {
  timeStep: TimeStep
  calendarYear: number
  seasonName?: string
  month: number
  day: number
  previousNode?: {
    calendarYear: number
    month: number
    day: number
  }
  basePointsPassed?: number
  daysPassed?: number
  eventNodeIndex?: number
  eventNodeCount?: number
  timeStepAlignment?: {
    fromUnit: TimeStep['unit']
    fromValue: number
  }
}

export function buildCalendarNarrativeContext(input: CalendarNarrativeContextInput): string {
  const canonicalSpanRule = buildCanonicalCalendarNarrativeHint(input)
  // `daysPassed` is retained only as a legacy boundary value; never use it as
  // if it were the canonical annual base-point delta.
  const elapsedBasePoints = input.basePointsPassed
    ?? (input.daysPassed === undefined ? undefined : basePointsFromCalendarDays(input.daysPassed))
  const hasActualWindow = input.previousNode !== undefined
    && typeof elapsedBasePoints === 'number'
    && elapsedBasePoints > 0
  let granularityRule: string
  switch (input.timeStep.unit) {
    case 'event':
      granularityRule = hasActualWindow
        ? '本轮按事件节点推进；时间范围提供本轮的时间事实。'
        : '本轮按事件节点推进；日期作为可用时间事实。'
      break
    case 'year':
      granularityRule = hasActualWindow
        ? '本轮按年度时间范围推进；日期和季节作为本轮可用时间事实。'
        : '本轮按年度时间范围推进；日期和季节作为可用时间事实。'
      break
  }

  const worldviewRule = '日期和季节仅作为本轮事实参考。'

  return ['【历法与社会作息（窗口事实与社会节律）】', canonicalSpanRule, worldviewRule, granularityRule]
    .filter(Boolean)
    .join('\n')
}
