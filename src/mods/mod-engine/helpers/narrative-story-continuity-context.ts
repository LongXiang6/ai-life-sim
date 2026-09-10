/**
 * Purpose: Assemble the next five-round story-continuity compression batch.
 * Owner: mod-engine
 * Responsibility: Select one eligible five-round batch and serialize the approved 02 input only.
 */

import { basePointsFromCalendarDays } from '@/foundation'
import type { CompressedSummaries } from '@/foundation'
import {
  type RecentStoryProjection,
} from './recent-story-context'
import type { NarrativeChunk } from '../types'

export interface NarrativeStoryContinuityPromptInput {
  userSegments: [string, string, string]
  sourceRounds: number[]
  sourceNarratives: NarrativeChunk[]
  sourceTime: {
    label: string
    totalBasePoints: number | null
    totalDays: number | null
  }
}

const COMPRESSION_MIN_RECENT_ROUNDS = 10
const COMPRESSION_BATCH_SIZE = 5
const COMPRESSION_CADENCE = 5

function storyTime(story: RecentStoryProjection): string {
  return story.规范时间.时间标签?.trim() || `第${story.回合}轮`
}

export function buildNarrativeStoryContinuityPromptInput(input: {
  currentRound: number
  currentNarrative: NarrativeChunk
  narrativeHistory: readonly NarrativeChunk[]
  compressedSummaries: CompressedSummaries
  compressionStats?: {
    lastAttemptRound?: number | null
  }
  recentStories: readonly RecentStoryProjection[]
}): NarrativeStoryContinuityPromptInput | undefined {
  const completedRounds = new Set(
    input.compressedSummaries.summaries.flatMap((summary) => (
      summary.sourceRounds?.length ? summary.sourceRounds : [summary.sourceRound]
    )),
  )
  const pendingStories = input.recentStories
    .filter((story) => !completedRounds.has(story.回合))
    .sort((left, right) => left.回合 - right.回合)
  const lastAttemptRound = input.compressionStats?.lastAttemptRound ?? null
  if (
    pendingStories.length <= COMPRESSION_MIN_RECENT_ROUNDS
    || (lastAttemptRound !== null && input.currentRound - lastAttemptRound < COMPRESSION_CADENCE)
  ) {
    return undefined
  }
  const sourceStories = pendingStories.slice(0, COMPRESSION_BATCH_SIZE)
  if (sourceStories.length !== COMPRESSION_BATCH_SIZE) return undefined
  const sourceRounds = sourceStories.map((story) => story.回合)
  const history = input.compressedSummaries.summaries.flatMap((summary) => (
    summary.memoryEvents.map((event) => `${event.occurrenceTime}：${event.text}`)
  ))
  const firstHistoricalRound = Math.max(1, input.currentRound - input.narrativeHistory.length)
  const sourceNarratives = sourceStories.map((story) => {
    const narrative = story.回合 === input.currentRound
      ? input.currentNarrative
      : input.narrativeHistory.find((entry) => entry.transitionAudit?.round === story.回合)
        ?? input.narrativeHistory[story.回合 - firstHistoricalRound]
    if (!narrative) throw new Error(`故事连续性提取缺少第 ${story.回合} 轮完整故事`)
    return structuredClone(narrative)
  })
  const firstTime = storyTime(sourceStories[0])
  const lastTime = storyTime(sourceStories.at(-1)!)
  const currentStory = input.recentStories.find((story) => story.回合 === input.currentRound)
  const currentTime = input.currentNarrative.displayTimeLabel?.trim()
    || (currentStory ? storyTime(currentStory) : lastTime)

  return {
    userSegments: [
      JSON.stringify({ 历史剧情: history }),
      JSON.stringify({
        待压缩五轮正文: sourceStories.map((story) => ({
          轮次: story.回合,
          时间窗口: storyTime(story),
          正文: story.故事全文,
        })),
      }),
      JSON.stringify({
        压缩范围: {
          起始回合: sourceRounds[0],
          结束回合: sourceRounds.at(-1),
          时间窗口: firstTime === lastTime ? firstTime : `${firstTime}至${lastTime}`,
        },
      }),
    ],
    sourceRounds,
    sourceNarratives,
    sourceTime: {
      label: currentTime,
      totalBasePoints: input.currentNarrative.totalBasePoints
        ?? (input.currentNarrative.totalDays === undefined
          ? null
          : basePointsFromCalendarDays(input.currentNarrative.totalDays)),
      totalDays: input.currentNarrative.totalDays ?? null,
    },
  }
}
