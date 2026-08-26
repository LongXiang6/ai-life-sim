/**
 * Purpose: Assemble the frozen world-state + history + current-story input for the world-simulation call.
 * Owner: mod-engine
 * Responsibility: Serialize only the approved 04 input fields in sample order.
 */

import type { CompressedSummaries } from '@/foundation'
import type { NarrativeChunk } from '../types'

export interface NarrativeWorldSimulationPromptInput {
  userSegments: [string, string, string]
  sourceRound: number
  sourceTime: {
    label: string
  }
}

export function buildNarrativeWorldSimulationPromptInput(input: {
  currentRound: number
  currentNarrative: NarrativeChunk
  compressedSummaries: CompressedSummaries
  worldNarrativeView?: Record<string, unknown>
  worldFactsText?: string
  currentTime?: string
  timeScaleText?: string
}): NarrativeWorldSimulationPromptInput {
  const currentTime = input.currentTime?.trim() || `第${input.currentRound}轮`
  const history = input.compressedSummaries.summaries.flatMap((summary) => (
    summary.memoryEvents.map((event) => `${event.occurrenceTime}：${event.text}`)
  ))
  const timeScale = input.timeScaleText?.trim() || undefined

  return {
    userSegments: [
      JSON.stringify({
        当前世界状态: {
          世界: input.worldNarrativeView ?? {},
          已确认事实: input.worldFactsText?.trim() || undefined,
        },
      }),
      JSON.stringify({
        历史剧情: {
          历史记忆: history,
        },
      }),
      JSON.stringify({
        本轮故事与时间: {
          当前时间: currentTime,
          ...(timeScale ? { 时间尺度: timeScale } : {}),
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
