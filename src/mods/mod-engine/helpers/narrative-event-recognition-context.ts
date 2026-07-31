/**
 * @module narrative-event-recognition-context.ts
 * @description 故事返回后的事件识别 AI 动态输入组装器
 * @mod mod-engine
 */

import type {
  HistoricalEventCandidateAudit,
  RoundContext,
} from '@/foundation'

export interface NarrativeEventRecognitionPromptInput {
  userSegments: [string, string, string]
  existingCandidates: HistoricalEventCandidateAudit[]
}

/**
 * 固定识别规则由服务端 Prompt 资产拥有；动态区只提供本轮时间锚点、
 * 已登记候选和第一次完整叙事，避免重复注册同一待触发事项。
 */
export function buildNarrativeEventRecognitionPromptInput(input: {
  roundContext: RoundContext
  narrativeResponse: string
  existingCandidates: readonly HistoricalEventCandidateAudit[]
}): NarrativeEventRecognitionPromptInput {
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

  return {
    userSegments: [
      `⟦回合上下文⟧${JSON.stringify({
        当前上下文: input.roundContext.contextId,
        角色实体: input.roundContext.characterId,
        回合序号: input.roundContext.roundSequence,
        当前时间: input.roundContext.round,
        规范总天数: input.roundContext.totalDays,
      })}`,
      `⟦已有待触发事件⟧${JSON.stringify(existingProjection)}`,
      `⟦最终叙事响应⟧${input.narrativeResponse}`,
    ],
    existingCandidates,
  }
}
