/**
 * Purpose: Accept validated main narrative text and register its stable round identity.
 * Owner: mod-engine
 * Responsibility: Publish visible narrative state and causal delivery without running post-narrative analysis.
 */

import { eventBus } from '@/core'
import type { AcceptedNarrativeResult, OrchestratorSystem } from '../orchestrator-system'
import {
  buildNarrativeTimeContext,
  calculateNarrativeRepetitionMetric,
  causalDelay,
  summarizeNarrativeRepetitionMetrics,
  type NarrativeTransitionAuditSnapshot,
  type ParsedNarrative,
} from '../../orchestrator-shared'
import { consumeAcceptedPlayerRoundAction } from '../../helpers/player-round-action'

export function acceptNarrativeResponseRuntime(
  orchestrator: OrchestratorSystem,
  parsed: ParsedNarrative,
  playerChoice?: string,
): AcceptedNarrativeResult {
  const narrative = parsed.narrative.trim()
  if (!narrative) throw new Error('提交候选缺少正文')

  const roundContext = structuredClone(orchestrator['buildRoundContext']())
  const roundSequence = roundContext.roundSequence ?? orchestrator['state'].totalRounds
  const narrativeId = `narrative-${orchestrator['state'].lifeRunId}-${roundSequence}`
  if (orchestrator['acceptedNarrativeRecords'].has(narrativeId)) {
    throw new Error(`正文已经接纳：${narrativeId}`)
  }

  const deliveredCausalEventIds = [...orchestrator['pendingNarrativeCausalEventIds']]
  const deliveredHistoricalEventCandidateIds = [
    ...orchestrator['pendingNarrativeEventCandidateIds'],
  ]
  for (const candidateId of deliveredHistoricalEventCandidateIds) {
    if (orchestrator['inFlightNarrativeEventCandidateIds'].has(candidateId)) {
      throw new Error(`到期历史候选已经属于其他已接纳正文：${candidateId}`)
    }
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
  if (repetitionMetric.qualityLevel === 'high') {
    const matchedRound = repetitionMetric.matchedRound
      ? `第 ${repetitionMetric.matchedRound} 轮`
      : '近期故事'
    const rejection = new Error(`正文与${matchedRound}高度重复，最终接纳门禁拒绝发布`)
    rejection.name = 'NarrativeGenerationRejectedError'
    throw rejection
  }
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
    historicalCommitPassed: true,
    structuredDataPresent: false,
    structuredDataAccepted: true,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    trusted: true,
    validationClean: true,
    reasons: [],
  }
  const branchMeta = orchestrator['resolveBranchFromParsed'](parsed)

  orchestrator['state'].currentNarrative = narrative
  orchestrator['state'].narrativeHistory.push({
    id: narrativeId,
    text: narrative,
    isComplete: true,
    timestamp: Date.now(),
    contextId: orchestrator['worldSetting']?.contextId,
    memoryScope: orchestrator['worldSetting']?.contextId ? 'context' : 'global',
    contextName: orchestrator['worldSetting']?.name,
    totalDays: roundContext.totalDays,
    displayAge: ageAtRound,
    displayTimeLabel,
    repetitionMetric,
    transitionAudit,
    ...(branchMeta.isBranchPoint
      ? {
          isBranchPoint: true,
          branchTitle: branchMeta.branchTitle,
          branchOptions: branchMeta.branchOptions,
        }
      : {}),
  })
  orchestrator['state'].storyRepetitionStats = storyRepetitionStats
  orchestrator['lastNarratedTimeStep'] = { ...orchestrator['state'].timeStep }
  orchestrator['acceptedNarrativeRecords'].set(narrativeId, {
    schemaVersion: 1,
    lifeRunId: orchestrator['state'].lifeRunId,
    roundSequence,
    narrativeId,
    acceptedAt: Date.now(),
    roundContext,
    narrative: structuredClone(parsed),
    deliveredCausalEventIds,
    deliveredHistoricalEventCandidateIds,
    ...(playerChoice ? { playerChoice } : {}),
  })
  if (deliveredCausalEventIds.length > 0) {
    causalDelay.markCausalEventsPresented(deliveredCausalEventIds, narrativeId, roundSequence)
  }
  orchestrator['pendingNarrativeCausalEventIds'] = []
  for (const candidateId of deliveredHistoricalEventCandidateIds) {
    orchestrator['inFlightNarrativeEventCandidateIds'].add(candidateId)
  }
  orchestrator['pendingNarrativeEventCandidateIds'] = []
  const playerAction = consumeAcceptedPlayerRoundAction(
    orchestrator['lastPlayerChoice'],
    playerChoice,
  )
  orchestrator['lastPlayerChoice'] = playerAction.nextChoice
  orchestrator.clearPendingNarrativeRoundPreparation(roundSequence)
  orchestrator['collectSubsystemStates'](false, false)

  orchestrator['recordSystemDiagnostic']('round-commit', 'narrative-adopted', 'ok', {
    narrativeId,
    roundSequence,
    deliveredCausalEventIds,
    deliveredHistoricalEventCandidateIds,
  })
  orchestrator['setRoundAdoption']({
    responseReceived: true,
    narrativeAdopted: true,
    structuredDataPresent: false,
    structuredDataAccepted: true,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    rejectedReasons: [],
    narrativeId,
    narrativeChars: narrative.length,
  })

  const result: AcceptedNarrativeResult = {
    narrative,
    narrativeId,
    roundSequence,
    deliveredCausalEventIds,
    deliveredHistoricalEventCandidateIds,
    changes: [],
    notableEvents: [],
  }
  eventBus.emit('mod-engine:round-complete', result)
  orchestrator['publishSimulationSnapshot']()
  return result
}
