/**
 * Purpose: Build one atomic historical-event ledger transaction from event-recognition output.
 * Owner: mod-engine
 * Responsibility: Normalize event, evidence, transition, and causal-edge writes without committing stores.
 */

import type { OrchestratorSystem } from '../orchestrator-system'
import type {
  HistoricalCausalEdgeInput,
  HistoricalEventCommitBatch,
  HistoricalEventCreateInput,
  HistoricalEventEvidenceInput,
  HistoricalEventTransitionInput,
  PendingDeathFact,
  RoundContext,
} from '@/foundation'
import {
  causalDelay,
  type NarrativeEventCommitData,
} from '../../orchestrator-shared'
import type { HistoricalEventLedgerRuntime } from './historical-ledger-runtime'

export interface HistoricalNarrativeTransactionPlan {
  batch: HistoricalEventCommitBatch
  eventIds: string[]
  deferredEventIds: string[]
  causalResolutionEventIds: Record<string, string>
}

export interface HistoricalNarrativeTransactionOptions {
  context?: RoundContext
  narrativeId?: string
  causalResolutionIds?: readonly string[]
}

function createHistoricalTransactionId(kind: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `history-${kind}-${suffix}`
}

export function buildHistoricalNarrativeTransactionPlanRuntime(
  orchestrator: OrchestratorSystem,
  
  ledger: HistoricalEventLedgerRuntime,
  parsed: NarrativeEventCommitData,
  keyEvents: Array<{ text: string; importance: number; entities?: string[] }>,
  pendingDeath?: PendingDeathFact,
  options: HistoricalNarrativeTransactionOptions = {},
): HistoricalNarrativeTransactionPlan | undefined {
  const context = options.context ?? orchestrator['buildRoundContext']()
  const scope = orchestrator['getCurrentHistoricalScope'](context.contextId)
  const sourceId = `narrative-round:${context.contextId}:${context.roundSequence}:${context.totalDays}`
  const source = {
    kind: 'narrative' as const,
    sourceId,
    description: '主叙事完整结构化数据通过本地校验后的历史事实提交',
  }
  const events: HistoricalEventCreateInput[] = []
  const evidence: HistoricalEventEvidenceInput[] = []
  const transitions: HistoricalEventTransitionInput[] = []
  const causalEdges: HistoricalCausalEdgeInput[] = []
  const eventIds: string[] = []
  const narrativeFactEventIds: string[] = []
  const deferredEventIds: string[] = []
  const causalResolutionEventIds: Record<string, string> = {}

  const appendEvent = (
    input: Omit<HistoricalEventCreateInput, 'eventId'>,
    evidenceDescription: string,
    payload: unknown,
    evidenceKind: HistoricalEventEvidenceInput['kind'] = 'narrative',
  ): { eventId: string; evidenceId: string } => {
    const eventId = createHistoricalTransactionId('event')
    const evidenceId = createHistoricalTransactionId('evidence')
    events.push({ ...input, eventId })
    evidence.push({
      evidenceId,
      eventId,
      kind: evidenceKind,
      description: evidenceDescription,
      sourceId,
      contextId: context.contextId || undefined,
      payload,
    })
    eventIds.push(eventId)
    return { eventId, evidenceId }
  }

  for (const keyEvent of keyEvents) {
    const appended = appendEvent({
      eventType: parsed.semanticSignals?.eventType ?? 'narrative-key-event',
      title: keyEvent.text,
      description: keyEvent.text,
      scope,
      status: 'occurred',
      participants: (keyEvent.entities ?? []).map((label) => ({ label })),
      tags: ['narrative-key-event'],
      metadata: {
        importance: keyEvent.importance,
        narrativeImportance: parsed.importance,
        arcStatus: parsed.arcStatus,
      },
    }, '主叙事关键事件通过完整协议、Schema 与回合提交校验', {
      digest: parsed.digest,
      keyEvent,
    })
    narrativeFactEventIds.push(appended.eventId)
  }

  if (keyEvents.length === 0 && parsed.semanticSignals) {
    const appended = appendEvent({
      eventType: parsed.semanticSignals.eventType,
      title: parsed.digest || '本轮叙事事实',
      description: parsed.digest || '本轮叙事事实',
      scope,
      status: 'occurred',
      tags: ['narrative-digest-fact'],
      metadata: {
        importance: parsed.importance,
        arcStatus: parsed.arcStatus,
        semanticSignals: parsed.semanticSignals,
      },
    }, '本轮没有独立关键事件，使用已验证摘要与完整语义记录事实', {
      digest: parsed.digest,
      semanticSignals: parsed.semanticSignals,
    })
    narrativeFactEventIds.push(appended.eventId)
  }

  if (pendingDeath) {
    const appended = appendEvent({
      eventType: 'character-death',
      title: '人物离世',
      description: pendingDeath.causeLabel,
      scope,
      status: 'occurred',
      participants: [{
        entityId: pendingDeath.entityId,
        contextId: pendingDeath.contextId,
        role: 'deceased',
      }],
      tags: ['character-death', pendingDeath.causeKind],
      metadata: {
        causeKind: pendingDeath.causeKind,
        finalAgeDays: pendingDeath.finalAgeDays,
        occurredAtTotalDays: pendingDeath.occurredAtTotalDays,
      },
    }, '健康系统在本轮原子提交中确认人物死亡', pendingDeath, 'system-commit')
    narrativeFactEventIds.push(appended.eventId)
  }

  const primaryNarrativeEventId = narrativeFactEventIds[0]
  const causalConfig = causalDelay.getConfig()
  for (const item of parsed.deferredCausality ?? []) {
    const dueTotalDays = context.totalDays + causalConfig.delayDaysBySeverity[item.severity]
    const appended = appendEvent({
      eventType: `deferred-${item.type}`,
      title: item.description,
      description: item.description,
      scope,
      status: 'scheduled',
      participants: [
        ...(item.relatedPerson ? [{ label: item.relatedPerson, role: 'related-person' }] : []),
        ...(item.relatedFaction ? [{ label: item.relatedFaction, role: 'related-faction' }] : []),
      ],
      schedule: { dueTotalDays },
      tags: ['deferred-causality', item.type, item.severity],
      metadata: {
        causalType: item.type,
        severity: item.severity,
      },
    }, '延期因果事项来自本轮已通过完整校验的结构化数据', {
      digest: parsed.digest,
      deferredCausality: item,
    })
    deferredEventIds.push(appended.eventId)
    if (primaryNarrativeEventId) {
      causalEdges.push({
        edgeId: createHistoricalTransactionId('causal-edge'),
        fromEventId: primaryNarrativeEventId,
        toEventId: appended.eventId,
        relation: 'causes',
        scope,
        evidenceIds: [appended.evidenceId],
      })
    }
  }

  const causalResolutionIds = new Set(options.causalResolutionIds ?? [])
  const dueCausalEvents = causalDelay.getCausalEvents().filter((item) => (
    causalResolutionIds.has(item.id)
  ))
  for (const due of dueCausalEvents) {
    const appended = appendEvent({
      eventType: 'causal-resolution',
      title: `延期事项兑现：${due.description}`,
      description: parsed.digest || due.description,
      scope,
      status: 'occurred',
      participants: [
        ...(due.relatedPerson ? [{ label: due.relatedPerson, role: 'related-person' }] : []),
        ...(due.relatedFaction ? [{ label: due.relatedFaction, role: 'related-faction' }] : []),
      ],
      tags: ['causal-resolution', due.type, due.severity],
      metadata: {
        causalDelayId: due.id,
        originEventId: due.originEventId,
      },
    }, `本轮完整叙事提交成功后兑现延期事项：${due.description}`, {
      digest: parsed.digest,
      causalDelayId: due.id,
      originEventId: due.originEventId,
    })
    causalResolutionEventIds[due.id] = appended.eventId
    narrativeFactEventIds.push(appended.eventId)

    if (!due.originEventId) continue
    const origin = ledger.getEvent(due.originEventId)
    if (!origin) continue
    if (origin.status === 'scheduled') {
      transitions.push({
        transitionId: createHistoricalTransactionId('transition'),
        eventId: origin.eventId,
        toStatus: 'active',
        reason: '延期事项已经到达规范处理时间并进入本轮叙事',
        evidenceIds: [appended.evidenceId],
      })
      transitions.push({
        transitionId: createHistoricalTransactionId('transition'),
        eventId: origin.eventId,
        toStatus: 'resolved',
        reason: '完整叙事与依赖状态已成功提交，延期事项完成兑现',
        evidenceIds: [appended.evidenceId],
      })
    } else if (
      origin.status === 'active'
      || origin.status === 'occurred'
      || origin.status === 'prevented'
    ) {
      transitions.push({
        transitionId: createHistoricalTransactionId('transition'),
        eventId: origin.eventId,
        toStatus: 'resolved',
        reason: '完整叙事与依赖状态已成功提交，延期事项完成兑现',
        evidenceIds: [appended.evidenceId],
      })
    }
    causalEdges.push({
      edgeId: createHistoricalTransactionId('causal-edge'),
      fromEventId: origin.eventId,
      toEventId: appended.eventId,
      relation: 'resolves',
      scope: orchestrator['buildHistoricalCausalScope'](origin.scope, scope),
      evidenceIds: [appended.evidenceId],
    })
  }

  if (
    events.length === 0
    && evidence.length === 0
    && transitions.length === 0
    && causalEdges.length === 0
  ) {
    return undefined
  }

  return {
    batch: {
      batchId: createHistoricalTransactionId('batch'),
      source,
      events,
      transitions,
      evidence,
      causalEdges,
    },
    eventIds,
    deferredEventIds,
    causalResolutionEventIds,
  }
}
