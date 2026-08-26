/**
 * Purpose: Project canonical time spans into minimal narrative context.
 * Owner: mod-engine
 * Responsibility: Expose time facts only; story organization belongs to the narrative target.
 *
 * @module time-scale-narrative.ts
 * @mod mod-engine
 */

import { basePointsFromCalendarDays, type TimeStep } from '@/foundation'
import { getSeasonForMonth, SOLAR_SEASON_NAMES as SEASON_NAMES } from './calendar-season.js'

export interface CanonicalCalendarNarrativeInput {
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

function normalizeAmount(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1
}

function eventNodeProgress(input: CanonicalCalendarNarrativeInput): string {
  const count = normalizeAmount(input.eventNodeCount ?? input.timeStep.value)
  const index = Math.max(0, Math.min(count, Math.floor(input.eventNodeIndex ?? 0)))
  const remaining = Math.max(0, count - index)
  return `本自然年已消费${index}/${count}个故事节点，距年界还剩${remaining}个节点`
}

export interface TimeScaleNarrativeProfile {
  key: string
  id: string
  macroLevel: number
  prompt: string
}

/** 时间步长保留稳定诊断标识，但不再携带叙事模板。 */
export const TIME_SCALE_NARRATIVE_PROFILES: readonly TimeScaleNarrativeProfile[] = [
  { key: 'event:12', id: 'event-node-annual-12', macroLevel: 35, prompt: '本轮按事件节点推进。' },
  { key: 'event:24', id: 'event-node-annual-24', macroLevel: 36, prompt: '本轮按事件节点推进。' },
  { key: 'year:1', id: 'annual-panorama', macroLevel: 40, prompt: '本轮覆盖一年。' },
  { key: 'year:3', id: 'three-year-life-stage', macroLevel: 50, prompt: '本轮覆盖三年。' },
  { key: 'year:5', id: 'five-year-growth-arc', macroLevel: 60, prompt: '本轮覆盖五年。' },
  { key: 'year:10', id: 'decade-transformation', macroLevel: 70, prompt: '本轮覆盖十年。' },
  { key: 'year:50', id: 'half-century-history', macroLevel: 80, prompt: '本轮覆盖半个世纪。' },
  { key: 'year:100', id: 'century-epic', macroLevel: 90, prompt: '本轮覆盖一个世纪。' },
  { key: 'year:200', id: 'multi-generational-structure', macroLevel: 100, prompt: '本轮覆盖约两百年。' },
  { key: 'year:500', id: 'civilization-rise-and-fall', macroLevel: 110, prompt: '本轮覆盖约五百年。' },
  { key: 'year:1000', id: 'millennial-era-legacy', macroLevel: 120, prompt: '本轮覆盖约一千年。' },
] as const

const TIME_SCALE_NARRATIVE_PROFILE_BY_KEY = new Map(
  TIME_SCALE_NARRATIVE_PROFILES.map((profile) => [profile.key, profile]),
)

function buildFallbackTimeScaleNarrativeProfile(timeStep: TimeStep): TimeScaleNarrativeProfile {
  const amount = normalizeAmount(timeStep.value)
  const key = `${timeStep.unit}:${amount}`
  if (timeStep.unit === 'event') {
    return {
      key,
      id: 'event-node-annual',
      macroLevel: 35,
      prompt: '本轮按事件节点推进。',
    }
  }
  if (timeStep.unit !== 'year') {
    throw new Error(`未声明的时间叙事视角: ${key}`)
  }
  const nearestYearProfile = TIME_SCALE_NARRATIVE_PROFILES
    .filter((profile) => profile.key.startsWith('year:'))
    .sort((left, right) => {
      const leftDistance = Math.abs(Number(left.key.slice('year:'.length)) - amount)
      const rightDistance = Math.abs(Number(right.key.slice('year:'.length)) - amount)
      return leftDistance - rightDistance || left.macroLevel - right.macroLevel
    })[0]
  return {
    key,
    id: `year-world-fallback-${amount}`,
    macroLevel: nearestYearProfile?.macroLevel ?? 40,
    prompt: `本轮覆盖${amount}年。`,
  }
}

export function getTimeScaleNarrativeProfile(timeStep: TimeStep): TimeScaleNarrativeProfile {
  const key = `${timeStep.unit}:${normalizeAmount(timeStep.value)}`
  return TIME_SCALE_NARRATIVE_PROFILE_BY_KEY.get(key) ?? buildFallbackTimeScaleNarrativeProfile(timeStep)
}

function formatCalendarNode(node: {
  calendarYear: number
  month: number
  day: number
}): string {
  return `${node.calendarYear}年${node.month}月${node.day}日`
}

function buildActualNarrativeWindow(
  input: CanonicalCalendarNarrativeInput,
): string | undefined {
  const elapsedBasePoints = input.basePointsPassed
    ?? (input.daysPassed === undefined ? undefined : basePointsFromCalendarDays(input.daysPassed))
  if (!input.previousNode || typeof elapsedBasePoints !== 'number' || !Number.isFinite(elapsedBasePoints) || elapsedBasePoints <= 0) {
    return undefined
  }

  const previous = formatCalendarNode(input.previousNode)
  const current = formatCalendarNode(input)
  const unitLabel: Record<TimeStep['unit'], string> = {
    year: '年',
    event: '事件节点/年',
  }
  const unit = unitLabel[input.timeStep.unit]
  const amount = normalizeAmount(input.timeStep.value)
  const alignment = input.timeStepAlignment
    ? `这是从${normalizeAmount(input.timeStepAlignment.fromValue)}${unitLabel[input.timeStepAlignment.fromUnit]}切换到当前${amount}${unit}后的边界对齐；前一窗口已经完成。`
    : ''

  return `本轮实际时间窗口：上一叙事节点为${previous}，当前结束节点为${current}；已推进${Math.floor(elapsedBasePoints)}个年度基础点（${amount}${unit}）。${alignment}`
}

/** 构建只包含日期、跨度和可选节律事实的历法说明。 */
export function buildCanonicalCalendarNarrativeHint(
  input: CanonicalCalendarNarrativeInput,
): string {
  const amount = normalizeAmount(input.timeStep.value)
  const actualWindow = buildActualNarrativeWindow(input)
  const endSeason = SEASON_NAMES[getSeasonForMonth(input.month - 1)] ?? '未知'
  const calendarRule = `项目历法中${input.month}月属于${endSeason}；日期、季节和节日仅作为可用背景事实，是否进入故事由当前情境自然决定。`

  if (actualWindow) return `${calendarRule}${actualWindow}`

  switch (input.timeStep.unit) {
    case 'event':
      return `${calendarRule}本轮按事件节点推进，${eventNodeProgress(input)}；节点之间的现实天数由本地历法分配。`
    case 'year': {
      const startYear = input.calendarYear - amount + 1
      const span = amount === 1
        ? `${input.calendarYear}年`
        : `${startYear}年至${input.calendarYear}年，共${amount}年`
      return `${calendarRule}本轮覆盖${span}。`
    }
  }
}

/** 根据当前时间步进生成最小叙事提示。 */
export function buildTimeScaleNarrativeHint(
  timeStep: TimeStep,
  eventNodeProgressText?: string,
): string {
  const amount = normalizeAmount(timeStep.value)
  const profile = getTimeScaleNarrativeProfile(timeStep)
  const unitLabel: Record<TimeStep['unit'], string> = { year: '年', event: '事件节点/年' }
  const scaleText = timeStep.unit === 'event'
    ? `【时间尺度】当前采用事件节点模式；每次推进消费一个故事节点，${eventNodeProgressText || `本自然年配置${amount}个故事节点`}。`
    : `【时间尺度】本轮叙事结束于当前时间节点，覆盖${amount}${unitLabel[timeStep.unit]}。`
  return `${scaleText}${profile.prompt}历史和本轮事实供合理叙事参考。`
}
