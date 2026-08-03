/**
 * Purpose: Coordinate post-narrative background AI registration, terminal result draining, and failure release.
 * Owner: mod-engine
 * Responsibility: Manage background result lifecycle without interpreting event-recognition business payloads.
 */

import type { OrchestratorSystem } from '../orchestrator-system'
import { logger } from '@/core/logger/client-logger'
import type {
  HistoricalEventCandidateInput,
  RoundContext,
  SubSystemChanges,
} from '@/foundation'
import {
  causalDelay,
  createNarrativeBackgroundInputHash,
  type NarrativeBackgroundAnalysisIdentity,
  type NarrativeBackgroundAnalysisKind,
  type NarrativeBackgroundAnalysisRecord,
  type ParsedNarrative,
} from '../../orchestrator-shared'
import type { NarrativeRoundMetadata } from '../../helpers/narrative-semantic-signals'

interface AcceptedNarrativeRecord {
  schemaVersion: 1
  lifeRunId: string
  roundSequence: number
  narrativeId: string
  acceptedAt: number
  roundContext: RoundContext
  narrative: ParsedNarrative
  deliveredCausalEventIds: string[]
  focusedIntentId?: string
}

interface NarrativeSystemAnalysisResult {
  changes: SubSystemChanges[]
}

interface NarrativeEventRecognitionResult {
  metadata: NarrativeRoundMetadata
  candidates: HistoricalEventCandidateInput[]
}

export function launchNarrativeBackgroundAnalysisRuntime<TResult>(
  orchestrator: OrchestratorSystem,
  input: {
  kind: NarrativeBackgroundAnalysisKind
  narrativeId: string
  userSegments: readonly string[]
  work: () => Promise<TResult>
}): NarrativeBackgroundAnalysisIdentity {
  const record = orchestrator['acceptedNarrativeRecords'].get(input.narrativeId)
  if (!record || record.lifeRunId !== orchestrator['state'].lifeRunId) {
    throw new Error(`后台分析找不到已接纳正文：${input.narrativeId}`)
  }
  const identity: NarrativeBackgroundAnalysisIdentity = {
    schemaVersion: 1,
    kind: input.kind,
    lifeRunId: record.lifeRunId,
    roundSequence: record.roundSequence,
    narrativeId: record.narrativeId,
    inputHash: createNarrativeBackgroundInputHash(input.kind, input.userSegments),
  }
  const registration = orchestrator['narrativeBackgroundInbox'].register(identity)
  if (registration !== 'registered') {
    throw new Error(`后台分析注册失败：${registration}`)
  }
  if (input.kind === 'event-recognition' && record.deliveredCausalEventIds.length > 0) {
    causalDelay.markCausalEventsPendingRecognition(
      record.deliveredCausalEventIds,
      record.narrativeId,
    )
  }

  void input.work()
    .then((result) => {
      const code = orchestrator['narrativeBackgroundInbox'].succeed(identity, result)
      orchestrator['recordSystemDiagnostic'](
        `narrative-${input.kind}`,
        'background-result',
        code === 'accepted' ? 'ok' : 'warning',
        { ...identity, code },
      )
    })
    .catch((error) => {
      const code = orchestrator['narrativeBackgroundInbox'].fail(identity, error)
      logger.warn('narrative-quality', `${input.kind}-background-analysis-failed`, {
        ...identity,
        code,
        error: error instanceof Error ? error.message : String(error),
      })
    })

  return identity
}

export function recordNarrativeBackgroundLaunchFailureRuntime(
  orchestrator: OrchestratorSystem,
  input: {
  kind: NarrativeBackgroundAnalysisKind
  narrativeId: string
  error: unknown
}): void {
  const accepted = orchestrator['acceptedNarrativeRecords'].get(input.narrativeId)
  if (input.kind === 'event-recognition' && accepted) {
    orchestrator['deferAcceptedNarrativeCausalityAfterRecognitionFailure'](accepted)
  }
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error)
  orchestrator['recordSystemDiagnostic'](
    `narrative-${input.kind}`,
    'background-launch-failed',
    'warning',
    { narrativeId: input.narrativeId, error: errorMessage },
  )
  logger.warn('narrative-quality', `${input.kind}-background-launch-failed`, {
    narrativeId: input.narrativeId,
    error: errorMessage,
  })
}

export function consumeNarrativeBackgroundResultsRuntime(
  orchestrator: OrchestratorSystem,
): void {
  const lifeRunId = orchestrator['state'].lifeRunId
  const systemKinds = [
    'basic-attribute',
    'data-analysis',
    'macro-impact',
  ] as const
  for (const kind of systemKinds) {
    const records = orchestrator['narrativeBackgroundInbox'].drainTerminal<NarrativeSystemAnalysisResult>(
      kind,
      lifeRunId,
    )
    for (const record of records) orchestrator['consumeSystemAnalysisRecord'](record)
  }

  const eventRecords = orchestrator['narrativeBackgroundInbox']
    .drainTerminal<NarrativeEventRecognitionResult>('event-recognition', lifeRunId)
  for (const record of eventRecords) orchestrator['consumeEventRecognitionRecord'](record)
}

export function getNarrativeBackgroundAnalysisRecordsRuntime(
  orchestrator: OrchestratorSystem,
): NarrativeBackgroundAnalysisRecord[] {
  return orchestrator['narrativeBackgroundInbox'].getRecords()
}

export function reconcileAcceptedNarrativeRecordsRuntime(
  orchestrator: OrchestratorSystem,
): void {
  const validNarrativeIds = new Set(
    orchestrator['state'].narrativeHistory.flatMap((entry) => entry.id ? [entry.id] : []),
  )
  for (const [narrativeId, record] of orchestrator['acceptedNarrativeRecords']) {
    if (record.lifeRunId === orchestrator['state'].lifeRunId && validNarrativeIds.has(narrativeId)) {
      continue
    }
    orchestrator['acceptedNarrativeRecords'].delete(narrativeId)
    orchestrator['narrativeBackgroundInbox'].discardNarrative(record.lifeRunId, narrativeId)
  }
}

export function consumeSystemAnalysisRecordRuntime(
  orchestrator: OrchestratorSystem,
  
  record: NarrativeBackgroundAnalysisRecord<NarrativeSystemAnalysisResult>,
): void {
  const accepted = orchestrator['acceptedNarrativeRecords'].get(record.identity.narrativeId)
  if (!accepted || accepted.lifeRunId !== record.identity.lifeRunId) return
  if (record.status === 'failed' || !record.result) {
    orchestrator['recordSystemDiagnostic'](
      `narrative-${record.identity.kind}`,
      'background-consumed',
      'warning',
      { ...record.identity, error: record.error },
    )
    return
  }

  const commitSnapshot = orchestrator['capturePreviewSnapshot']()
  const commitResult = orchestrator['roundCommitBus'].commit({
    source: record.identity.kind === 'macro-impact' ? 'macro-impact' : 'post-narrative',
    changes: record.result.changes,
    roundSequence: record.identity.roundSequence,
  }, structuredClone(accepted.roundContext))
  if (commitResult.rejected.length > 0) {
    orchestrator['restorePreviewSnapshot'](commitSnapshot)
    orchestrator['recordSystemDiagnostic'](
      `narrative-${record.identity.kind}`,
      'background-commit-rejected',
      'warning',
      {
        ...record.identity,
        rejected: commitResult.rejected.map((item) => item.reason),
      },
    )
    return
  }
  orchestrator['updateNarrativeTransitionAudit'](record.identity.narrativeId, {
    requestedChangeCount: record.result.changes.length,
    committedChangeCount: commitResult.committed.length,
  })
  orchestrator['collectSubsystemStates'](false, false)
}

export function consumeEventRecognitionRecordRuntime(
  orchestrator: OrchestratorSystem,
  
  record: NarrativeBackgroundAnalysisRecord<NarrativeEventRecognitionResult>,
): void {
  const accepted = orchestrator['acceptedNarrativeRecords'].get(record.identity.narrativeId)
  if (!accepted || accepted.lifeRunId !== record.identity.lifeRunId) return
  if (record.status === 'failed' || !record.result) {
    orchestrator['deferAcceptedNarrativeCausalityAfterRecognitionFailure'](accepted)
    orchestrator['recordSystemDiagnostic']('narrative-event-recognition', 'background-consumed', 'warning', {
      ...record.identity,
      error: record.error,
    })
    return
  }
  try {
    orchestrator['applyNarrativeEventRecognition'](accepted, record.result)
  } catch (error) {
    orchestrator['deferAcceptedNarrativeCausalityAfterRecognitionFailure'](accepted)
    orchestrator['recordSystemDiagnostic'](
      'narrative-event-recognition',
      'background-commit-rejected',
      'warning',
      {
        ...record.identity,
        error: error instanceof Error ? error.message : String(error),
      },
    )
  }
}

export function deferAcceptedNarrativeCausalityAfterRecognitionFailureRuntime(
  orchestrator: OrchestratorSystem,
  
  accepted: AcceptedNarrativeRecord,
): void {
  if (accepted.deliveredCausalEventIds.length === 0) return
  try {
    causalDelay.deferCausalEventsAfterRecognitionFailure(
      accepted.deliveredCausalEventIds,
      accepted.narrativeId,
      accepted.roundContext.totalDays,
    )
  } catch (error) {
    orchestrator['recordSystemDiagnostic'](
      'narrative-event-recognition',
      'causal-release-rejected',
      'warning',
      {
        narrativeId: accepted.narrativeId,
        error: error instanceof Error ? error.message : String(error),
      },
    )
  }
}
