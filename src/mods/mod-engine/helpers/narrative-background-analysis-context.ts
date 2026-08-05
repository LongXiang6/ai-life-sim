/**
 * Purpose: Build shared round references and recent-story inputs for background narrative analysis.
 * Owner: mod-engine
 * Responsibility: Validate and project accepted narrative context without writing background results.
 *
 * @module narrative-background-analysis-context.ts
 * @description 后台 AI 共用的回合引用与最近故事校验
 * @mod mod-engine
 */

import type {
  HistoricalEventLedgerContract,
  RoundContext,
  SubSystemState,
} from '@/foundation'

import { HISTORICAL_EVENT_LEDGER_ID } from './historical-event-prompt-projection'
import type { RecentStoryProjection } from './recent-story-context'

export function readNarrativeAnalysisEvidenceEventIds(
  subsystemStates: Record<string, SubSystemState>,
  contextId: string,
): string[] {
  const state = subsystemStates[HISTORICAL_EVENT_LEDGER_ID]
  if (state?.id !== HISTORICAL_EVENT_LEDGER_ID || !state.data || typeof state.data !== 'object') {
    return []
  }

  const contract = state.data as Partial<HistoricalEventLedgerContract>
  if (contract.contextId !== contextId || !Array.isArray(contract.relevantEvents)) return []

  return [...new Set(contract.relevantEvents.flatMap((event) => (
    event && typeof event.eventId === 'string' && event.eventId.trim()
      ? [event.eventId]
      : []
  )))]
}

export function buildNarrativeAnalysisRoundContext(input: {
  roundContext: RoundContext
  allowedEvidenceEventIds: readonly string[]
}): Record<string, unknown> {
  return {
    当前上下文: input.roundContext.contextId,
    玩家目标: 'player:current',
    角色实体: input.roundContext.characterId,
    回合序号: input.roundContext.roundSequence,
    当前时间: input.roundContext.round,
    规范总天数: input.roundContext.totalDays,
    本轮推进天数: input.roundContext.daysPassed,
    可引用事件: [...input.allowedEvidenceEventIds],
  }
}

export function assertRecentStoriesAvailable(
  stories: readonly RecentStoryProjection[],
): void {
  if (stories.length === 0) throw new Error('后台 AI 缺少当前完整故事')
  if (stories.some((story) => !story.故事全文.trim())) {
    throw new Error('后台 AI 最近故事包含空正文')
  }
}
