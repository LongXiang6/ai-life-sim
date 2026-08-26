/**
 * Purpose: Build the historical fact that binds a character death committed in the same round.
 * Owner: mod-engine
 * Responsibility: Normalize the death event and evidence only; the historical ledger validates and persists it.
 */

import type { OrchestratorSystem } from '../orchestrator-system'
import type {
  HistoricalEventCommitBatch,
  PendingCharacterDeath,
  RoundContext,
} from '@/foundation'
import { calendarDaysFromBasePoints } from '@/foundation'

export interface HistoricalDeathTransactionPlan {
  batch: HistoricalEventCommitBatch
  eventId: string
}

function createHistoricalTransactionId(kind: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `history-${kind}-${suffix}`
}

export function buildHistoricalDeathTransactionPlanRuntime(
  orchestrator: OrchestratorSystem,
  pendingDeath: PendingCharacterDeath,
  context: RoundContext,
  narrativeId: string,
): HistoricalDeathTransactionPlan {
  const eventId = createHistoricalTransactionId('event')
  const evidenceId = createHistoricalTransactionId('evidence')
  const sourceId = `narrative-round:${context.contextId}:${context.roundSequence}:${context.totalBasePoints}`
  return {
    eventId,
    batch: {
      batchId: createHistoricalTransactionId('batch'),
      source: {
        kind: 'narrative',
        sourceId,
        description: '角色状态在本轮数据提交后形成的死亡事实。',
      },
      events: [{
        eventId,
        eventType: 'character-death',
        title: '人物离世',
        description: pendingDeath.causeLabel,
        scope: orchestrator['getCurrentHistoricalScope'](context.contextId),
        status: 'occurred',
        participants: [{
          entityId: pendingDeath.entityId,
          contextId: pendingDeath.contextId,
          role: 'deceased',
        }],
        tags: ['character-death', pendingDeath.causeKind],
        metadata: {
          narrativeId,
          causeKind: pendingDeath.causeKind,
          finalAgeDays: pendingDeath.finalAgeDays,
          occurredAtBasePoints: context.totalBasePoints,
          occurredAtTotalDays: calendarDaysFromBasePoints(context.totalBasePoints),
        },
      }],
      evidence: [{
        evidenceId,
        eventId,
        kind: 'system-commit',
        description: '主故事确认死亡，角色状态已在同轮数据提交中写入死亡原因。',
        sourceId,
        contextId: context.contextId,
        payload: structuredClone(pendingDeath),
      }],
    },
  }
}
