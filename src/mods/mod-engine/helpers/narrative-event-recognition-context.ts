/**
 * Purpose: Assemble dynamic inputs for post-narrative event recognition.
 * Owner: mod-engine
 * Responsibility: Project accepted story facts, causal deliveries, and existing candidates only.
 *
 * @module narrative-event-recognition-context.ts
 * @description 故事返回后的事件识别 AI 动态输入组装器
 * @mod mod-engine
 */

import type {
  HistoricalEventCandidateAudit,
  RoundContext,
  SubSystemState,
} from '@/foundation'

import {
  assertRecentStoriesAvailable,
  buildNarrativeAnalysisRoundContext,
  readNarrativeAnalysisEvidenceEventIds,
} from './narrative-background-analysis-context'
import type { RecentStoryProjection } from './recent-story-context'

const EVENT_CONTEXT_SUBSYSTEM_IDS = [
  'historical-event-ledger',
  'plot-structure',
  'foreshadowing',
  'causal-delay',
  'core-memory',
] as const

export interface NarrativeEventRecognitionPromptInput {
  userSegments: [string, string, string, string, string]
  existingCandidates: HistoricalEventCandidateAudit[]
  allowedEvidenceEventIds: string[]
}

/**
 * 固定识别规则由服务端 Prompt 资产拥有；动态区完整提供回合锚点、
 * 事件相关状态、全部已登记候选与最近三轮完整故事。
 */
export function buildNarrativeEventRecognitionPromptInput(input: {
  subsystemStates: Record<string, SubSystemState>
  roundContext: RoundContext
  existingCandidates: readonly HistoricalEventCandidateAudit[]
  recentStories: readonly RecentStoryProjection[]
  deliveredCausalEventIds?: readonly string[]
}): NarrativeEventRecognitionPromptInput {
  assertRecentStoriesAvailable(input.recentStories)
  const existingCandidates = [...input.existingCandidates]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((audit) => structuredClone(audit))
  const existingProjection = existingCandidates.map(({ candidate }) => ({
    候选编号: candidate.candidateId,
    类型: candidate.eventType,
    标题: candidate.title,
    说明: candidate.description,
    作用域: candidate.scope,
    触发条件: candidate.triggerConditionLabel,
    计划: candidate.schedule,
    相关人物: candidate.participants,
    相关地点: candidate.locations,
    标签: candidate.tags,
  }))
  const allowedEvidenceEventIds = readNarrativeAnalysisEvidenceEventIds(
    input.subsystemStates,
    input.roundContext.contextId,
  )
  const eventStates = Object.fromEntries(EVENT_CONTEXT_SUBSYSTEM_IDS.flatMap((id) => {
    const state = input.subsystemStates[id]
    return state?.data === undefined ? [] : [[id, state.data]]
  }))
  const deliveredCausalIds = [...new Set(input.deliveredCausalEventIds ?? [])]
  const causalState = eventStates['causal-delay'] as {
    causalEvents?: Array<Record<string, unknown>>
  } | undefined
  const deliveredCausalEvents = deliveredCausalIds.map((causalId) => {
    const event = causalState?.causalEvents?.find((candidate) => candidate.id === causalId)
    if (!event) throw new Error(`事件识别缺少已投递因果状态：${causalId}`)
    return {
      因果编号: causalId,
      类型: event.type,
      严重程度: event.severity,
      已成立事实: event.description,
      相关人物: event.relatedPerson,
      相关势力: event.relatedFaction,
      来源事件: event.originEventId,
    }
  })

  return {
    userSegments: [
      `⟦回合上下文⟧${JSON.stringify(buildNarrativeAnalysisRoundContext({
        roundContext: input.roundContext,
        allowedEvidenceEventIds,
      }))}`,
      `⟦事件相关状态⟧${JSON.stringify(eventStates)}`,
      `⟦本轮已投递因果⟧${JSON.stringify(deliveredCausalEvents)}`,
      `⟦已有待触发事件⟧${JSON.stringify(existingProjection)}`,
      `⟦最近故事⟧${JSON.stringify(input.recentStories)}`,
    ],
    existingCandidates,
    allowedEvidenceEventIds,
  }
}
