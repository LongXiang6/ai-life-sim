/**
 * Purpose: Assemble the oldest unfinished story-continuity source in the recent detailed window.
 * Owner: mod-engine
 * Responsibility: Select one source round and serialize the approved 02 input only.
 */

import { basePointsFromCalendarDays } from '@/foundation'
import type { CompressedSummaries } from '@/foundation'
import {
  RECENT_STORY_PREVIOUS_WINDOW,
  type RecentStoryProjection,
} from './recent-story-context'
import type { NarrativeChunk } from '../types'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export interface NarrativeStoryContinuityPromptInput {
  userSegments: [string, string, string]
  sourceRound: number
  sourceNarrative: NarrativeChunk
  sourceTime: {
    label: string
    totalBasePoints: number | null
    totalDays: number | null
  }
}

function storyTime(story: RecentStoryProjection): string {
  return story.规范时间.时间标签?.trim() || `第${story.回合}轮`
}

interface CalendarDay {
  year: number
  month: number
  day: number
}

function parseLastCalendarDay(label: string): CalendarDay | undefined {
  const yearMatches = [...label.matchAll(/(-?\d+)年/gu)]
  const monthMatches = [...label.matchAll(/(\d{1,2})月/gu)]
  const dayMatches = [...label.matchAll(/(\d{1,2})日/gu)]
  const year = Number(yearMatches.at(-1)?.[1])
  const month = Number(monthMatches.at(-1)?.[1])
  const day = Number(dayMatches.at(-1)?.[1])
  if (
    !Number.isSafeInteger(year)
    || !Number.isSafeInteger(month)
    || month < 1
    || month > 12
    || !Number.isSafeInteger(day)
    || day < 1
    || day > DAYS_IN_MONTH[month - 1]
  ) {
    return undefined
  }
  return { year, month, day }
}

function nextCalendarDay(point: CalendarDay): CalendarDay {
  const next = { ...point, day: point.day + 1 }
  if (next.day <= DAYS_IN_MONTH[next.month - 1]) return next
  next.day = 1
  next.month += 1
  if (next.month <= 12) return next
  next.month = 1
  next.year += 1
  return next
}

function calendarPrefix(label: string): string {
  const yearIndex = label.search(/-?\d+年/u)
  return yearIndex > 0 ? label.slice(0, yearIndex).trim() : ''
}

function formatCurrentStoryWindow(previousTime: string, currentTime: string): string {
  const previousEnd = parseLastCalendarDay(previousTime)
  const currentEnd = parseLastCalendarDay(currentTime)
  if (!previousEnd || !currentEnd) {
    return previousTime === currentTime ? currentTime : `${previousTime}至${currentTime}`
  }

  const start = nextCalendarDay(previousEnd)
  const prefix = calendarPrefix(currentTime) || calendarPrefix(previousTime)
  const startLabel = `${prefix}${start.year}年${start.month}月${start.day}日`
  const endLabel = start.year === currentEnd.year
    ? `${currentEnd.month}月${currentEnd.day}日`
    : `${currentEnd.year}年${currentEnd.month}月${currentEnd.day}日`
  return `${startLabel}至${endLabel}`
}

export function buildNarrativeStoryContinuityPromptInput(input: {
  currentRound: number
  currentNarrative: NarrativeChunk
  narrativeHistory: readonly NarrativeChunk[]
  compressedSummaries: CompressedSummaries
  recentStories: readonly RecentStoryProjection[]
}): NarrativeStoryContinuityPromptInput {
  const completedRounds = new Set(
    input.compressedSummaries.summaries.map((summary) => summary.sourceRound),
  )
  const sourceStory = input.recentStories.find((story) => !completedRounds.has(story.回合))
  if (!sourceStory) throw new Error(`故事连续性提取缺少第 ${input.currentRound} 轮可处理正文`)
  const sourceRound = sourceStory.回合
  const history = input.compressedSummaries.summaries.flatMap((summary) => (
    summary.memoryEvents.map((event) => `${event.occurrenceTime}：${event.text}`)
  ))
  const currentTime = storyTime(sourceStory)
  const firstHistoricalRound = Math.max(1, input.currentRound - input.narrativeHistory.length)
  const sourceNarrative = sourceRound === input.currentRound
    ? input.currentNarrative
    : input.narrativeHistory.find((entry) => entry.transitionAudit?.round === sourceRound)
      ?? input.narrativeHistory[sourceRound - firstHistoricalRound]
  if (!sourceNarrative) throw new Error(`故事连续性提取缺少第 ${sourceRound} 轮完整故事`)
  const previousStoriesByRound = new Map<number, { round: number; time: string; text: string }>()
  for (const [index, entry] of input.narrativeHistory.entries()) {
    const round = entry.transitionAudit?.round ?? firstHistoricalRound + index
    if (round >= sourceRound) continue
    previousStoriesByRound.set(round, {
      round,
      time: entry.displayTimeLabel?.trim() || `第${round}轮`,
      text: entry.text,
    })
  }
  for (const story of input.recentStories) {
    if (story.回合 >= sourceRound) continue
    previousStoriesByRound.set(story.回合, {
      round: story.回合,
      time: storyTime(story),
      text: story.故事全文,
    })
  }
  const recentPreviousStories = [...previousStoriesByRound.values()]
    .sort((left, right) => left.round - right.round)
    .slice(-RECENT_STORY_PREVIOUS_WINDOW)
  const previousTime = recentPreviousStories.at(-1)?.time
  const currentTimeWindow = previousTime
    ? formatCurrentStoryWindow(previousTime, currentTime)
    : currentTime

  return {
    userSegments: [
      JSON.stringify({ 历史记忆: history }),
      JSON.stringify({
        最近四轮正文: recentPreviousStories.map((story) => ({
          时间窗口: story.time,
          正文: story.text,
        })),
      }),
      JSON.stringify({
        当前回合: {
          当前时间: currentTime,
          时间窗口: currentTimeWindow,
          正文: sourceStory.故事全文,
        },
      }),
    ],
    sourceRound,
    sourceNarrative: structuredClone(sourceNarrative),
    sourceTime: {
      label: currentTime,
      totalBasePoints: sourceStory.规范时间.基础点
        ?? (sourceStory.规范时间.总天数 === null
          ? null
          : basePointsFromCalendarDays(sourceStory.规范时间.总天数)),
      totalDays: sourceStory.规范时间.总天数,
    },
  }
}
