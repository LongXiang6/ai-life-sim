/**
 * @module narrative-settlement-context.ts
 * @description 第二次 AI 调用的同回合动态输入组装器
 * @mod mod-engine
 */

import type {
  HistoricalEventLedgerContract,
  RoundContext,
  SubSystemState,
} from '@/foundation'

import { MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS } from './mvp-runtime-policy'
import { getNarrativeAISubsystemContract } from './subsystem-field-registry'
import { isSubsystemOpenForPrompt } from './subsystem-prompt-gate'
import { HISTORICAL_EVENT_LEDGER_ID } from './historical-event-prompt-projection'

export interface NarrativeSettlementPromptInput {
  userSegments: [string, string, string]
  activeSubsystemIds: string[]
  allowedEvidenceEventIds: string[]
}

function readAllowedEvidenceEventIds(
  state: SubSystemState | undefined,
  contextId: string,
): string[] {
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

/**
 * 固定契约由服务端 Prompt 资产提供；这里只发送本轮完整状态、稳定引用和
 * 第一次最终响应。可写系统顺序跟随阶段配置，避免注册顺序影响缓存前缀。
 */
export function buildNarrativeSettlementPromptInput(input: {
  subsystemStates: Record<string, SubSystemState>
  roundContext: RoundContext
  intentCondition?: string
  narrativeResponse: string
}): NarrativeSettlementPromptInput {
  const activeSubsystemIds = [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS].filter((id) => {
    const state = input.subsystemStates[id]
    return state?.data !== undefined && isSubsystemOpenForPrompt(state, id)
  })
  if (activeSubsystemIds.length === 0) {
    throw new Error('本轮没有可供结算调用读取的活动可写系统状态')
  }

  const stateLines = activeSubsystemIds.map((id) => {
    const contract = getNarrativeAISubsystemContract(id)
    return `⟦可写系统:${contract.aiName}⟧${JSON.stringify({
      目标上下文: input.roundContext.contextId,
      当前状态: input.subsystemStates[id].data,
    })}`
  })
  const allowedEvidenceEventIds = readAllowedEvidenceEventIds(
    input.subsystemStates[HISTORICAL_EVENT_LEDGER_ID],
    input.roundContext.contextId,
  )
  const roundContextLine = `⟦回合上下文⟧${JSON.stringify({
    当前上下文: input.roundContext.contextId,
    玩家目标: 'player:current',
    角色实体: input.roundContext.characterId,
    回合序号: input.roundContext.roundSequence,
    当前时间: input.roundContext.round,
    可引用事件: allowedEvidenceEventIds,
    ...(input.intentCondition ? { 命运意图条件: input.intentCondition } : {}),
  })}`

  return {
    userSegments: [
      stateLines.join('\n'),
      roundContextLine,
      `⟦最终叙事响应⟧${input.narrativeResponse}`,
    ],
    activeSubsystemIds,
    allowedEvidenceEventIds,
  }
}
