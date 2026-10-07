/**
 * Purpose: Project calendar spans into minimal narrative context.
 * Owner: mod-engine
 * Responsibility: Expose time facts only; story organization belongs to the narrative target.
 *
 * @module time-scale-narrative.ts
 * @mod mod-engine
 */

import { normalizeCanonicalTimeStep, type TimeStep } from '@/foundation'
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
}

function normalizeAmount(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1
}

export interface TimeScaleNarrativeProfile {
  key: string
  id: string
  macroLevel: number
  prompt: string
}

/** 时间步长保留稳定诊断标识，但不携带叙事模板。 */
export const TIME_SCALE_NARRATIVE_PROFILES: readonly TimeScaleNarrativeProfile[] = [
  { key: 'day:1', id: 'daily-detail', macroLevel: 10, prompt: '本轮覆盖一个日历日。' },
  { key: 'month:1', id: 'monthly-life', macroLevel: 20, prompt: '本轮覆盖一个自然月。' },
  { key: 'season:1', id: 'seasonal-life', macroLevel: 30, prompt: '本轮覆盖一个自然季。' },
  { key: 'year:1', id: 'annual-panorama', macroLevel: 40, prompt: '本轮覆盖一年。' },
  { key: 'year:3', id: 'three-year-life-stage', macroLevel: 50, prompt: '本轮覆盖三年。' },
  { key: 'year:5', id: 'five-year-growth-arc', macroLevel: 60, prompt: '本轮覆盖五年。' },
  { key: 'year:10', id: 'decade-transformation', macroLevel: 70, prompt: '本轮覆盖十年。' },
] as const

const TIME_SCALE_NARRATIVE_PROFILE_BY_KEY = new Map(
  TIME_SCALE_NARRATIVE_PROFILES.map((profile) => [profile.key, profile]),
)

function buildFallbackTimeScaleNarrativeProfile(timeStep: TimeStep): TimeScaleNarrativeProfile {
  const amount = normalizeAmount(timeStep.value)
  const key = `${timeStep.unit}:${amount}`
  const unitLabel: Record<TimeStep['unit'], string> = {
    day: '日',
    month: '个月',
    season: '季',
    year: '年',
  }
  const nearestProfile = TIME_SCALE_NARRATIVE_PROFILES
    .filter((profile) => profile.key.startsWith(`${timeStep.unit}:`))
    .sort((left, right) => left.macroLevel - right.macroLevel)[0]
  return {
    key,
    id: `${timeStep.unit}-calendar-fallback-${amount}`,
    macroLevel: nearestProfile?.macroLevel ?? 40,
    prompt: `本轮覆盖${amount}${unitLabel[timeStep.unit]}。`,
  }
}

export function getTimeScaleNarrativeProfile(timeStep: TimeStep): TimeScaleNarrativeProfile {
  const canonical = normalizeCanonicalTimeStep(timeStep)
  const key = `${canonical.unit}:${canonical.value}`
  return TIME_SCALE_NARRATIVE_PROFILE_BY_KEY.get(key) ?? buildFallbackTimeScaleNarrativeProfile(canonical)
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
  const elapsedDays = input.daysPassed
    ?? (typeof input.basePointsPassed === 'number' ? Math.max(0, Math.floor(input.basePointsPassed * 365 / 1000)) : undefined)
  if (!input.previousNode || typeof elapsedDays !== 'number' || !Number.isFinite(elapsedDays) || elapsedDays <= 0) {
    return undefined
  }

  const unitLabel: Record<TimeStep['unit'], string> = {
    day: '日',
    month: '月',
    season: '季',
    year: '年',
  }
  const previous = formatCalendarNode(input.previousNode)
  const current = formatCalendarNode(input)
  const amount = normalizeAmount(input.timeStep.value)
  return `本轮实际时间窗口：上一叙事节点为${previous}，当前结束节点为${current}；已推进${elapsedDays}天（${amount}${unitLabel[input.timeStep.unit]}）。`
}

/** 构建只包含日期、跨度和可选节律事实的历法说明。 */
export function buildCanonicalCalendarNarrativeHint(
  input: CanonicalCalendarNarrativeInput,
): string {
  const timeStep = normalizeCanonicalTimeStep(input.timeStep)
  const normalizedInput = { ...input, timeStep }
  const actualWindow = buildActualNarrativeWindow(normalizedInput)
  const endSeason = SEASON_NAMES[getSeasonForMonth(normalizedInput.month - 1)] ?? '未知'
  const calendarRule = `项目历法中${normalizedInput.month}月属于${endSeason}；日期和季节仅作为可用背景事实，是否进入故事由当前情境自然决定。`
  if (actualWindow) return `${calendarRule}${actualWindow}`

  const amount = timeStep.value
  switch (timeStep.unit) {
    case 'day':
      return `${calendarRule}本轮覆盖${amount}日。`
    case 'month':
      return `${calendarRule}本轮覆盖${amount}个月。`
    case 'season':
      return `${calendarRule}本轮覆盖${amount}季。`
    case 'year': {
      const startYear = normalizedInput.calendarYear - amount + 1
      const span = amount === 1
        ? `${normalizedInput.calendarYear}年`
        : `${startYear}年至${normalizedInput.calendarYear}年，共${amount}年`
      return `${calendarRule}本轮覆盖${span}。`
    }
  }
}

/** 根据当前时间步进生成最小叙事提示。 */
export function buildTimeScaleNarrativeHint(
  timeStep: TimeStep,
  _legacyProgressText?: string,
): string {
  const canonical = normalizeCanonicalTimeStep(timeStep)
  const amount = canonical.value
  const profile = getTimeScaleNarrativeProfile(canonical)
  const unitLabel: Record<TimeStep['unit'], string> = {
    day: '日',
    month: '个月',
    season: '季',
    year: '年',
  }
  return `【时间尺度】本轮叙事结束于当前时间节点，覆盖${amount}${unitLabel[canonical.unit]}。${profile.prompt}历史和本轮事实供合理叙事参考。`
}
