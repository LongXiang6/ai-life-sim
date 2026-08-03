/**
 * Purpose: Validate and atomically commit one event-recognition result after narrative acceptance.
 * Owner: mod-engine
 * Responsibility: Commit historical facts, causal dispositions, memories, foreshadowing, and intent resolution.
 */

import type { OrchestratorSystem } from '../orchestrator-system'
import type {
  ISubSystem,
  PendingDeathFact,
} from '@/foundation'
import {
  causalDelay,
  coreMemory,
  digestLedger,
  foreshadowing,
  memoryLifecycle,
  plotStructure,
  type CharacterCreation,
  type NarrativeEventCommitData,
} from '../../orchestrator-shared'
import {
  validateIntentResolutionForState,
} from '../../helpers/branch-intent-resolution'
import type {
  AcceptedNarrativeRecord,
  NarrativeEventRecognitionResult,
} from './narrative-event-recognition-contracts'

export function applyNarrativeEventRecognitionRuntime(
  orchestrator: OrchestratorSystem,
  accepted: AcceptedNarrativeRecord,
  result: NarrativeEventRecognitionResult,
): void {
  try {
    const parsed: NarrativeEventCommitData = {
      ...structuredClone(accepted.narrative),
      ...structuredClone(result.metadata),
      notableEvents: result.metadata.notableEvents ?? [],
    }
    const digest = parsed.digest?.trim()
    if (!digest) throw new Error('事件识别结果缺少结算摘要')

    const expectedIntent = accepted.focusedIntentId
      ? orchestrator['branchIntents'].find((intent) => intent.intentId === accepted.focusedIntentId)
      : undefined
    if (accepted.focusedIntentId && !expectedIntent) {
      throw new Error(`事件识别对应的命运意图已经不可用：${accepted.focusedIntentId}`)
    }
    if (!accepted.focusedIntentId && parsed.intentResolution) {
      throw new Error('正文接纳时没有待判定命运意图，事件识别不得提交判定')
    }
    if (expectedIntent) {
      const intentResolutionError = validateIntentResolutionForState(
        expectedIntent,
        parsed.intentResolution,
      )
      if (intentResolutionError) throw new Error(intentResolutionError)
    }

    const dispositions = parsed.deliveredCausalDispositions ?? []
    const expectedCausalIds = new Set(accepted.deliveredCausalEventIds)
    const dispositionIds = new Set(dispositions.map((item) => item.causalId))
    if (
      dispositionIds.size !== expectedCausalIds.size
      || [...expectedCausalIds].some((causalId) => !dispositionIds.has(causalId))
    ) {
      throw new Error('事件识别的到期因果判定与主叙事实际投递集合不一致')
    }
    const resolvedCausalIds = dispositions
      .filter((item) => item.status === 'resolved')
      .map((item) => item.causalId)

    const structuredKeyEvents = parsed.keyEvents ?? []
    const ledger = orchestrator['getHistoricalEventLedgerRuntime']()
    const healthRuntime = orchestrator['subsystems'].find((item) => item.id === 'health') as (ISubSystem & {
      getPendingDeath: (entityId: string) => PendingDeathFact | undefined
    }) | undefined
    const pendingDeath = healthRuntime?.getPendingDeath(accepted.roundContext.characterId)
    const historicalInputRequired = structuredKeyEvents.length > 0
      || parsed.semanticSignals !== undefined
      || (parsed.deferredCausality?.length ?? 0) > 0
      || pendingDeath !== undefined
      || result.candidates.length > 0
      || resolvedCausalIds.length > 0
    if (historicalInputRequired && !ledger) {
      throw new Error('historical-event-ledger 未注册或公开契约不完整')
    }

    const historicalPlan = ledger
      ? orchestrator['buildHistoricalNarrativeTransactionPlan'](
          ledger,
          parsed,
          structuredKeyEvents,
          pendingDeath,
          {
            context: accepted.roundContext,
            narrativeId: accepted.narrativeId,
            causalResolutionIds: resolvedCausalIds,
          },
        )
      : undefined
    for (const [index, item] of (parsed.deferredCausality ?? []).entries()) {
      causalDelay.assertCausalEventRegistrationAvailable({
        type: item.type,
        description: item.description,
        relatedPerson: item.relatedPerson,
        relatedFaction: item.relatedFaction,
        registration: {
          scope: accepted.roundContext.contextId ? 'context' : 'global',
          contextId: accepted.roundContext.contextId || undefined,
          createdTotalDays: accepted.roundContext.totalDays,
          originEventId: historicalPlan?.deferredEventIds[index],
          originNarrativeId: accepted.narrativeId,
        },
      })
    }
    if (historicalPlan && ledger) {
      const preflight = ledger.preflightBatch(historicalPlan.batch, accepted.roundContext)
      if (!preflight.ok) {
        throw new Error(`历史批次预检失败：${preflight.errors.join('；')}`)
      }
    }

    let acceptedHistoricalEventIds: string[] = []
    if (historicalPlan && ledger) {
      const historicalCommit = ledger.commitBatch(
        historicalPlan.batch,
        accepted.roundContext,
      )
      if (
        !historicalCommit.ok
        || historicalCommit.eventIds.length !== historicalPlan.eventIds.length
        || historicalPlan.eventIds.some((eventId) => !historicalCommit.eventIds.includes(eventId))
      ) {
        throw new Error(historicalCommit.errors.join('；') || '历史批次提交结果不完整')
      }
      acceptedHistoricalEventIds = [...historicalCommit.eventIds]
      orchestrator['notifyHistoricalEventsCommitted'](acceptedHistoricalEventIds, accepted.roundContext)
    }

    if (result.candidates.length > 0 && ledger) {
      const submission = ledger.submitCandidates({
        source: {
          kind: 'narrative',
          sourceId: `narrative-event-recognition:${accepted.roundContext.contextId}:${accepted.roundSequence}:${accepted.roundContext.totalDays}`,
          description: '故事正文返回后由独立事件识别调用登记的未来待触发事项',
        },
        candidates: result.candidates.map((candidate) => ({
          ...structuredClone(candidate),
          metadata: {
            ...(candidate.metadata ?? {}),
            recognition: {
              schemaVersion: 1,
              lifeRunId: accepted.lifeRunId,
              executionId: `narrative-round:${accepted.lifeRunId}:${accepted.roundSequence}:real`,
              roundSequence: accepted.roundSequence,
              contextId: accepted.roundContext.contextId,
              totalDays: accepted.roundContext.totalDays,
              narrativeId: accepted.narrativeId,
              historicalEventIds: [...acceptedHistoricalEventIds],
            },
          },
        })),
      }, accepted.roundContext)
      if (
        submission.length !== result.candidates.length
        || submission.some((audit) => audit.status !== 'available')
      ) {
        throw new Error('待触发事件候选未能完整注册')
      }
    }

    if (parsed.semanticSignals) {
      plotStructure.recordNarrativeSignals(parsed.semanticSignals, acceptedHistoricalEventIds)
    }
    foreshadowing.detectForeshadowing(
      accepted.roundSequence,
      orchestrator['state'].narrativeHistory.find((entry) => entry.id === accepted.narrativeId)?.displayAge
        ?? orchestrator['characterState']?.age
        ?? 0,
      parsed.foreshadowing,
      accepted.roundContext.contextId,
      acceptedHistoricalEventIds,
    )
    for (const [index, item] of (parsed.deferredCausality ?? []).entries()) {
      causalDelay.recordCausalEvent(
        item.type,
        item.severity,
        accepted.roundSequence,
        orchestrator['state'].narrativeHistory.find((entry) => entry.id === accepted.narrativeId)?.displayAge
          ?? orchestrator['characterState']?.age
          ?? 0,
        item.description,
        item.relatedPerson,
        item.relatedFaction,
        {
          scope: accepted.roundContext.contextId ? 'context' : 'global',
          contextId: accepted.roundContext.contextId || undefined,
          createdTotalDays: accepted.roundContext.totalDays,
          originEventId: historicalPlan?.deferredEventIds[index],
          originNarrativeId: accepted.narrativeId,
        },
      )
    }
    for (const creation of parsed.creations ?? []) {
      if (!orchestrator['state'].characterCreations.some((existing) => existing.name === creation.name)) {
        orchestrator['state'].characterCreations.push({
          name: creation.name,
          description: creation.description,
          category: creation.category as CharacterCreation['category'],
          confirmedRound: accepted.roundSequence,
        })
      }
    }

    if (parsed.semanticSignals) {
      if (!parsed.importance || !parsed.arcStatus) {
        throw new Error('语义信号缺少重要程度或情节状态')
      }
      const entities = structuredKeyEvents.flatMap((event) => event.entities ?? [])
      memoryLifecycle.setAISemanticAnalysis(
        accepted.roundSequence,
        parsed.importance,
        parsed.arcStatus,
        parsed.semanticSignals,
        entities,
        acceptedHistoricalEventIds,
      )
      coreMemory.recordRelationshipUpdates(
        parsed.semanticSignals.relationshipUpdates,
        accepted.roundSequence,
        accepted.roundContext.contextId,
        acceptedHistoricalEventIds,
      )
      foreshadowing.resolveForeshadowing(
        parsed.semanticSignals.resolvedForeshadowingIds,
        accepted.narrative.narrative,
        accepted.roundSequence,
        accepted.roundContext.contextId,
        acceptedHistoricalEventIds,
      )
    }

    causalDelay.commitCausalDispositions(
      dispositions.map((item) => ({
        ...item,
        resolutionEventId: historicalPlan?.causalResolutionEventIds[item.causalId],
      })),
      accepted.narrativeId,
      accepted.roundSequence,
      accepted.roundContext.totalDays,
    )

    digestLedger.record({
      round: accepted.roundSequence,
      contextId: accepted.roundContext.contextId,
      memoryScope: accepted.roundContext.contextId ? 'context' : 'global',
      importance: parsed.importance,
      digest,
      keyEvents: structuredKeyEvents,
    })
    memoryLifecycle.scoreImportance(
      accepted.narrative.narrative,
      accepted.roundSequence,
      accepted.roundContext.round.year,
      accepted.roundContext.contextId,
    )

    const committedIntentResolution = expectedIntent && parsed.intentResolution
      ? orchestrator['commitFocusedBranchIntentResolution'](parsed.intentResolution, expectedIntent.intentId)
      : undefined
    if (expectedIntent && !committedIntentResolution) {
      throw new Error('命运意图判定未能提交')
    }
    const narrativeChunk = orchestrator['state'].narrativeHistory.find(
      (entry) => entry.id === accepted.narrativeId,
    )
    if (narrativeChunk && committedIntentResolution) {
      narrativeChunk.intentResolution = committedIntentResolution
    }
    orchestrator['lastNotableEvents'] = parsed.notableEvents ?? []
    orchestrator['updateNarrativeTransitionAudit'](accepted.narrativeId, {
      requestedChangeCount: 0,
      committedChangeCount: 0,
    })
    if (narrativeChunk?.transitionAudit) {
      narrativeChunk.transitionAudit.historicalCommitPassed = true
    }
    orchestrator['collectSubsystemStates'](false, false)
    orchestrator['publishSimulationSnapshot']()
  } catch (error) {
    throw error
  }
}
