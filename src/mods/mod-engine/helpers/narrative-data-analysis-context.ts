/**
 * @module narrative-data-analysis-context.ts
 * @description 非基础属性系统数据分析 AI 的动态输入组装器
 * @mod mod-engine
 */

import type { RoundContext, SubSystemState } from '@/foundation'

import {
  assertRecentStoriesAvailable,
  buildNarrativeAnalysisRoundContext,
  readNarrativeAnalysisEvidenceEventIds,
} from './narrative-background-analysis-context'
import { MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS } from './mvp-runtime-policy'
import type { RecentStoryProjection } from './recent-story-context'
import { getNarrativeAISubsystemContract } from './subsystem-field-registry'
import { isSubsystemOpenForPrompt } from './subsystem-prompt-gate'

export interface NarrativeDataAnalysisPromptInput {
  userSegments: [string, string, string]
  activeSubsystemIds: string[]
  allowedOperationsBySubsystem: Readonly<Record<string, readonly string[]>>
  allowedEvidenceEventIds: string[]
}

export function buildNarrativeDataAnalysisPromptInput(input: {
  subsystemStates: Record<string, SubSystemState>
  roundContext: RoundContext
  recentStories: readonly RecentStoryProjection[]
}): NarrativeDataAnalysisPromptInput {
  assertRecentStoriesAvailable(input.recentStories)
  const activeSubsystemIds = [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS].filter((id) => {
    const state = input.subsystemStates[id]
    return state?.data !== undefined && isSubsystemOpenForPrompt(state, id)
  })
  if (activeSubsystemIds.length === 0) {
    throw new Error('本轮没有可供数据分析读取的活动角色状态或成长系统')
  }
  const allowedOperationsBySubsystem = { 'character-base': ['update-status'] } as const

  const stateLines = activeSubsystemIds.map((id) => {
    const contract = getNarrativeAISubsystemContract(id, allowedOperationsBySubsystem[id as 'character-base'])
    return `⟦可写系统:${contract.aiName}⟧${JSON.stringify({
      目标上下文: input.roundContext.contextId,
      当前完整状态: input.subsystemStates[id].data,
    })}`
  })
  const allowedEvidenceEventIds = readNarrativeAnalysisEvidenceEventIds(
    input.subsystemStates,
    input.roundContext.contextId,
  )

  return {
    userSegments: [
      stateLines.join('\n'),
      `⟦回合上下文⟧${JSON.stringify(buildNarrativeAnalysisRoundContext({
        roundContext: input.roundContext,
        allowedEvidenceEventIds,
      }))}`,
      `⟦最近故事⟧${JSON.stringify(input.recentStories)}`,
    ],
    activeSubsystemIds,
    allowedOperationsBySubsystem,
    allowedEvidenceEventIds,
  }
}
