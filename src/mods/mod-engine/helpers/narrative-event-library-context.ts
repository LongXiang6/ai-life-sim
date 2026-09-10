/**
 * Purpose: Assemble the frozen world-state + history + current-story input for the 04 event-library call.
 * Owner: mod-engine
 * Responsibility: Serialize only the approved 04 input fields in sample order.
 */

import type { CompressedSummaries } from '@/foundation'
import type { RecentStoryProjection } from './recent-story-context'
import type { NarrativeChunk } from '../types'

export interface NarrativeEventLibraryPromptInput {
  userSegments: [string, string, string]
  sourceRound: number
  sourceTime: {
    label: string
  }
}

export function buildNarrativeEventLibraryPromptInput(input: {
  currentRound: number
  currentNarrative: NarrativeChunk
  compressedSummaries: CompressedSummaries
  recentStories?: readonly RecentStoryProjection[]
  worldNarrativeView?: Record<string, unknown>
  worldFactsText?: string
  currentTime?: string
  timeScaleText?: string
}): NarrativeEventLibraryPromptInput {
  const currentTime = input.currentTime?.trim() || `第${input.currentRound}轮`
  const summarizedRounds = new Set(
    input.compressedSummaries.summaries.map((summary) => summary.sourceRound),
  )
  const history = input.compressedSummaries.summaries.flatMap((summary) => (
    summary.memoryEvents.map((event) => `${event.occurrenceTime}：${event.text}`)
  ))
  for (const story of input.recentStories ?? []) {
    if (story.回合 === input.currentRound || summarizedRounds.has(story.回合)) continue
    const time = story.规范时间.时间标签?.trim() || `第${story.回合}轮`
    const text = story.故事全文.trim()
    if (text) history.push(`${time}：${text}`)
  }
  const timeScale = input.timeScaleText?.trim() || '年'

  return {
    userSegments: [
      JSON.stringify({
        当前世界状态: {
          世界: input.worldNarrativeView ?? {},
          已确认事实: input.worldFactsText?.trim() || '',
        },
      }),
      JSON.stringify({ 历史剧情: history }),
      JSON.stringify({
        本轮故事与时间: {
          当前时间: currentTime,
          时间尺度: timeScale,
          正文: input.currentNarrative.text,
        },
      }),
    ],
    sourceRound: input.currentRound,
    sourceTime: {
      label: currentTime,
    },
  }
}
