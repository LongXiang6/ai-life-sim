/**
 * Purpose: Prepare and publish validated main narrative text before post-story analysis settles.
 * Owner: mod-engine
 * Responsibility: Freeze one narrative candidate, publish its visible story, and close its
 * temporary bookkeeping after post-story analysis settles.
 */
import { eventBus } from '@/core'
import type { AcceptedNarrativeResult, OrchestratorSystem } from '../orchestrator-system'
import type { SubSystemChanges } from '@/foundation'
import {
  buildNarrativeTimeContext, calculateNarrativeRepetitionMetric, summarizeNarrativeRepetitionMetrics,
  type NarrativeChunk, type NarrativeTransitionAuditSnapshot, type ParsedNarrative,
} from '../../orchestrator-shared'
import { consumeAcceptedPlayerRoundAction } from '../../helpers/player-round-action'
import { useEngineStore } from '../../store'
import { publishNarrativeStateToStore } from './narrative-publication-store-runtime'

const NARRATIVE_DELIVERY_DISPOSITION_PREFIX = '[mod-engine:narrative-delivery]'

const ATTRIBUTE_CHANGE_FIELDS = [
  ['体魄', 'physiqueDelta'],
  ['心智', 'mindDelta'],
  ['悟性', 'talentAptitudeDelta'],
  ['魅力', 'charismaDelta'],
] as const

function buildAttributeChangeInstruction(
  parsed: ParsedNarrative,
  roundContext: import('@/foundation').RoundContext,
): SubSystemChanges | undefined {
  if (!parsed.attributeChanges) return undefined
  const changes: Record<string, unknown> = {}
  const labels: string[] = []
  for (const [label, field] of ATTRIBUTE_CHANGE_FIELDS) {
    const value = parsed.attributeChanges[label]
    if (value === undefined) continue
    changes[field] = value
    labels.push(`${label}${value > 0 ? '+' : ''}${value}`)
  }
  if (labels.length === 0) return undefined
  return {
    id: 'character-base',
    targetObjectId: 'player:current',
    targetContextId: roundContext.contextId,
    operation: 'adjust-attributes',
    description: `主故事明确属性变化：${labels.join('、')}`,
    changes,
  }
}

function persistDeliveredHistoricalCandidateDispositions(
  orchestrator: OrchestratorSystem,
  prepared: AcceptedNarrativeResult,
): void {
  const record = orchestrator['acceptedNarrativeRecords'].get(prepared.narrativeId)
  if (!record || record.deliveredHistoricalEventCandidateIds.length === 0) return
  const ledger = orchestrator['getHistoricalEventLedgerRuntime']()
  if (!ledger) return
  const deliveredCandidateIds = [...new Set(record.deliveredHistoricalEventCandidateIds)]
  const result = ledger.commitCandidateDispositions({
    source: {
      kind: 'narrative',
      sourceId: `narrative-delivery:${record.narrativeId}`,
      description: '正文已投递到期候选；候选仍保留为本地可用账本记录。',
    },
    deliveredCandidateIds,
    dispositions: deliveredCandidateIds.map((candidateId) => ({
      candidateId,
      status: 'continuing' as const,
      reason: `${NARRATIVE_DELIVERY_DISPOSITION_PREFIX} 正文已发布；候选仍保留在本地账本，不再重复投影。`,
    })),
  }, record.roundContext)
  if (!result.ok) {
    console.warn('[Orchestrator] 到期候选投递记录未能写入，正文仍保持已发布:', result.errors)
  }
}

function buildPreparedRecord(
  orchestrator: OrchestratorSystem,
  parsed: ParsedNarrative,
  playerChoice: string | undefined,
) {
  const narrative = parsed.narrative.trim()
  if (!narrative) throw new Error('提交候选缺少正文')

  const roundContext = structuredClone(orchestrator['buildRoundContext']())
  const roundSequence = roundContext.roundSequence ?? orchestrator['state'].totalRounds
  const narrativeId = `narrative-${orchestrator['state'].lifeRunId}-${roundSequence}`
  if (orchestrator['acceptedNarrativeRecords'].has(narrativeId)) {
    throw new Error(`正文已经准备：${narrativeId}`)
  }

  const deliveredCausalEventIds = [...orchestrator['pendingNarrativeCausalEventIds']]
  const deliveredHistoricalEventCandidateIds = [...orchestrator['pendingNarrativeEventCandidateIds']]
  for (const candidateId of deliveredHistoricalEventCandidateIds) {
    if (orchestrator['inFlightNarrativeEventCandidateIds'].has(candidateId)) {
      throw new Error(`到期历史候选已经属于其他回合：${candidateId}`)
    }
  }
  for (const candidateId of deliveredHistoricalEventCandidateIds) {
    orchestrator['inFlightNarrativeEventCandidateIds'].add(candidateId)
  }

  const ageAtRound = orchestrator['computeNarrativeAge'](roundContext)
  const displayTimeLabel = buildNarrativeTimeContext(
    roundContext,
    orchestrator['worldSetting'],
  ).timeLabel
  const repetitionMetric = calculateNarrativeRepetitionMetric({
    round: roundSequence,
    text: narrative,
    recentHistory: orchestrator['state'].narrativeHistory.map((entry, index) => ({
      round: Math.max(1, roundSequence - orchestrator['state'].narrativeHistory.length + index),
      text: entry.text,
    })),
    windowSize: 5,
  })
  // 重复度只作为诊断指标；可用正文不能因质量建议被整体丢弃。

  const storyRepetitionStats = summarizeNarrativeRepetitionMetrics([
    ...orchestrator['state'].narrativeHistory
      .map((entry) => entry.repetitionMetric)
      .filter((metric): metric is NonNullable<typeof metric> => Boolean(metric)),
    repetitionMetric,
  ])
  const transitionAudit: NarrativeTransitionAuditSnapshot = {
    schemaVersion: 1,
    round: roundSequence,
    narrativeId,
    validatedWritePath: true,
    interceptorPassed: true,
    intentValidationPassed: true,
    historicalCommitPassed: false,
    structuredDataPresent: true,
    structuredDataAccepted: true,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    trusted: false,
    validationClean: true,
    reasons: ['正文已发布，故事连续性与天赋成长正在并行收束'],
  }
  const branchMeta = orchestrator['resolveBranchFromParsed'](parsed)
  const attributeChange = buildAttributeChangeInstruction(parsed, roundContext)
  const changes = attributeChange ? [attributeChange] : []

  return {
    schemaVersion: 1 as const,
    lifeRunId: orchestrator['state'].lifeRunId,
    roundSequence,
    narrativeId,
    acceptedAt: Date.now(),
    roundContext,
    narrative: structuredClone(parsed),
    narrativeText: narrative,
    deliveredCausalEventIds,
    deliveredHistoricalEventCandidateIds,
    ...(playerChoice ? { playerChoice } : {}),
    ageAtRound,
    displayTimeLabel,
    repetitionMetric,
    storyRepetitionStats,
    transitionAudit,
    branchMeta,
    committed: false,
    result: {
      narrative,
      narrativeId,
      roundSequence,
      deliveredCausalEventIds,
      deliveredHistoricalEventCandidateIds,
      changes,
      notableEvents: [],
    },
  }
}

/** Freeze the candidate and its round inputs; no visible state is published here. */
export function prepareNarrativeResponseRuntime(
  orchestrator: OrchestratorSystem,
  parsed: ParsedNarrative,
  playerChoice?: string,
): AcceptedNarrativeResult {
  const prepared = buildPreparedRecord(orchestrator, parsed, playerChoice)
  orchestrator['acceptedNarrativeRecords'].set(prepared.narrativeId, prepared)
  return structuredClone(prepared.result)
}

/** Publish the frozen candidate as soon as the main-story protocol has passed. */
export function commitNarrativeResponseRuntime(
  orchestrator: OrchestratorSystem,
  narrativeId: string,
): AcceptedNarrativeResult {
  const prepared = orchestrator['acceptedNarrativeRecords'].get(narrativeId)
  if (!prepared) throw new Error(`找不到待提交正文：${narrativeId}`)
  if (prepared.committed) throw new Error(`正文已经提交：${narrativeId}`)

  const { roundContext, roundSequence } = prepared
  const { causalDelay, memoryLifecycle } = orchestrator.getRuntimeDependencies()
  const narrative = prepared.narrativeText
  const branchMeta = prepared.branchMeta
  const collectedStates = orchestrator['collectSubsystemStates'](false, false)
  const narrativeEntry: NarrativeChunk = {
    id: narrativeId,
    text: narrative,
    isComplete: true,
    timestamp: Date.now(),
    contextId: orchestrator['worldSetting']?.contextId,
    memoryScope: orchestrator['worldSetting']?.contextId ? 'context' : 'global',
    contextName: orchestrator['worldSetting']?.name,
    totalBasePoints: roundContext.totalBasePoints,
    totalDays: roundContext.totalDays,
    displayAge: prepared.ageAtRound,
    displayTimeLabel: prepared.displayTimeLabel,
    repetitionMetric: prepared.repetitionMetric,
    transitionAudit: prepared.transitionAudit,
    ...(prepared.destinyPatternGrowth
      ? { destinyPatternGrowth: structuredClone(prepared.destinyPatternGrowth) }
      : {}),
    ...(branchMeta.isBranchPoint
      ? {
          isBranchPoint: true,
          branchTitle: branchMeta.branchTitle,
          branchOptions: branchMeta.branchOptions,
        }
      : {}),
    ...(prepared.narrative.endingTitle ? { endingTitle: prepared.narrative.endingTitle } : {}),
  }
  const playerAction = consumeAcceptedPlayerRoundAction(
    orchestrator['lastPlayerChoice'],
    prepared.playerChoice,
  )
  const result = structuredClone(prepared.result)

  const stateSnapshot = structuredClone(orchestrator['state'])
  const causalSnapshot = causalDelay.capturePersistenceState()
  const memorySnapshot = memoryLifecycle.capturePersistenceState()
  const previousLastNarratedTimeStep = { ...orchestrator['lastNarratedTimeStep'] }
  const previousPendingCausalEventIds = [...orchestrator['pendingNarrativeCausalEventIds']]
  const previousPendingEventCandidateIds = [...orchestrator['pendingNarrativeEventCandidateIds']]
  const previousPlayerChoice = orchestrator['lastPlayerChoice']
  const previousRoundPreparation = orchestrator.getPendingNarrativeRoundPreparation()
  const previousSubsystemStates = structuredClone(orchestrator['lastSubsystemStates'])
  const previousForceBranchNext = useEngineStore.getState().forceBranchNext
  const previousTransitionAudit = structuredClone(prepared.transitionAudit)

  try {
    if (prepared.deliveredCausalEventIds.length > 0) {
      causalDelay.commitCausalTriggers(
        prepared.deliveredCausalEventIds,
        roundSequence,
        '本轮正文已经完成对应因果事项',
        { currentBasePoints: roundContext.totalBasePoints },
      )
    }
    prepared.transitionAudit.historicalCommitPassed = false
    prepared.transitionAudit.trusted = false
    prepared.transitionAudit.reasons = ['正文已发布，故事连续性与天赋成长正在并行收束']
    orchestrator['state'].currentNarrative = narrative
    orchestrator['state'].narrativeHistory.push(narrativeEntry)
    orchestrator['state'].storyRepetitionStats = prepared.storyRepetitionStats
    orchestrator['lastNarratedTimeStep'] = { ...orchestrator['state'].timeStep }
    orchestrator['pendingNarrativeCausalEventIds'] = []
    orchestrator['pendingNarrativeEventCandidateIds'] = []
    orchestrator['lastPlayerChoice'] = playerAction.nextChoice
    if (branchMeta.isBranchPoint) {
      useEngineStore.getState().setForceBranchNext(false)
    }
    orchestrator.clearPendingNarrativeRoundPreparation(roundSequence)
    orchestrator['lastSubsystemStates'] = collectedStates
    prepared.committed = true
    publishNarrativeStateToStore(orchestrator['state'])
    orchestrator['recordSystemDiagnostic']('round-commit', 'narrative-adopted', 'ok', {
      narrativeId,
      roundSequence,
      deliveredCausalEventIds: prepared.deliveredCausalEventIds,
      deliveredHistoricalEventCandidateIds: prepared.deliveredHistoricalEventCandidateIds,
    })
    orchestrator['setRoundAdoption']({
      responseReceived: true,
      narrativeAdopted: true,
      structuredDataPresent: true,
      structuredDataAccepted: true,
      requestedChangeCount: prepared.transitionAudit.requestedChangeCount,
      committedChangeCount: prepared.transitionAudit.committedChangeCount,
      rejectedChangeCount: prepared.transitionAudit.rejectedChangeCount,
      rejectedReasons: [],
      narrativeId,
      narrativeChars: narrative.length,
    })
  } catch (error) {
    orchestrator['state'] = stateSnapshot
    causalDelay.restorePersistenceState(causalSnapshot)
    memoryLifecycle.restorePersistenceState(memorySnapshot)
    orchestrator['lastNarratedTimeStep'] = previousLastNarratedTimeStep
    orchestrator['pendingNarrativeCausalEventIds'] = previousPendingCausalEventIds
    orchestrator['pendingNarrativeEventCandidateIds'] = previousPendingEventCandidateIds
    orchestrator['lastPlayerChoice'] = previousPlayerChoice
    orchestrator['pendingNarrativeRoundPreparation'] = previousRoundPreparation
      ? structuredClone(previousRoundPreparation)
      : undefined
    orchestrator['lastSubsystemStates'] = previousSubsystemStates
    prepared.transitionAudit = previousTransitionAudit
    prepared.committed = false
    useEngineStore.setState({ forceBranchNext: previousForceBranchNext })
    throw error
  }

  return result
}

/** Close a successfully settled narrative record after all post-story results have committed. */
export function finalizeNarrativeResponseRuntime(
  orchestrator: OrchestratorSystem,
  narrativeId: string,
): void {
  const prepared = orchestrator['acceptedNarrativeRecords'].get(narrativeId)
  if (!prepared) return
  // Round-complete subscribers observe the settled flow; visible story publication happened earlier.
  eventBus.emit('mod-engine:round-complete', structuredClone(prepared.result))
  if (prepared.narrative.endingTitle) {
    orchestrator['state'].status = 'complete'
    useEngineStore.setState({ status: 'complete' })
  }
  persistDeliveredHistoricalCandidateDispositions(orchestrator, prepared.result)
  orchestrator['publishSimulationSnapshot']()
  orchestrator['releasePreparedNarrative'](prepared)
  orchestrator['acceptedNarrativeRecords'].delete(narrativeId)
}

/** Release temporary bookkeeping; a published story remains visible on post-story failure. */
export function discardNarrativeResponseRuntime(
  orchestrator: OrchestratorSystem,
  narrativeId: string,
  failureReason?: string,
): void {
  const prepared = orchestrator['acceptedNarrativeRecords'].get(narrativeId)
  if (!prepared) return
  if (prepared.committed) {
    const transitionAudit = {
      ...prepared.transitionAudit,
      historicalCommitPassed: false,
      trusted: false,
      reasons: [failureReason?.trim() || '故事连续性与天赋成长未能完整收束'],
    }
    orchestrator['state'].narrativeHistory = orchestrator['state'].narrativeHistory.map((entry) => (
      entry.id === narrativeId ? { ...entry, transitionAudit } : entry
    ))
    useEngineStore.setState((state) => ({
      narrativeHistory: state.narrativeHistory.map((entry) => (
        entry.id === narrativeId ? { ...entry, transitionAudit: structuredClone(transitionAudit) } : entry
      )),
    }))
  }
  orchestrator['releasePreparedNarrative'](prepared)
  orchestrator['acceptedNarrativeRecords'].delete(narrativeId)
}
