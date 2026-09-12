/**
 * Purpose: Resolve the historical ledger runtime and expose deterministic candidate and scope helpers.
 * Owner: mod-engine
 * Responsibility: Access the ledger contract and notify dependent systems without building transaction payloads.
 */

import type { OrchestratorSystem } from '../orchestrator-system'
import type {
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateQuery,
  HistoricalEventCandidateDispositionBatch,
  HistoricalEventCandidateDispositionResult,
  HistoricalEventCandidateSubmission,
  HistoricalEventCommitBatch,
  HistoricalEventCommitResult,
  HistoricalEventLedgerPersistenceState,
  HistoricalEventPreparedAppend,
  HistoricalEventPreflightResult,
  HistoricalEventScope,
  HistoricalEventValidationContext,
  HistoricalEventView,
  ISubSystem,
  RoundContext,
} from '@/foundation'

export type HistoricalEventLedgerRuntime = ISubSystem & {
  preflightBatch: (
    batch: HistoricalEventCommitBatch,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventPreflightResult
  commitBatch: (
    batch: HistoricalEventCommitBatch,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventCommitResult
  commitPrepared: (preflight: HistoricalEventPreflightResult) => HistoricalEventCommitResult
  prepareCandidateSubmission: (
    submission: HistoricalEventCandidateSubmission,
    context: RoundContext | HistoricalEventValidationContext,
  ) => {
    prepared: HistoricalEventPreparedAppend
    candidateAudits: HistoricalEventCandidateAudit[]
  }
  submitCandidates: (
    submission: HistoricalEventCandidateSubmission,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventCandidateAudit[]
  queryCandidates: (
    query?: HistoricalEventCandidateQuery,
  ) => HistoricalEventCandidateAudit[]
  getDueCandidates: (
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventCandidateAudit[]
  commitCandidateDispositions: (
    batch: HistoricalEventCandidateDispositionBatch,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventCandidateDispositionResult
  prepareCandidateDispositions: (
    batch: HistoricalEventCandidateDispositionBatch,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventCandidateDispositionResult & { prepared?: HistoricalEventPreparedAppend }
  capturePersistenceState: () => HistoricalEventLedgerPersistenceState
  restorePersistenceState: (snapshot: unknown) => void
  getEvent: (eventId: string) => HistoricalEventView | undefined
}

export function getHistoricalEventLedgerRuntimeRuntime(
  orchestrator: OrchestratorSystem,
): HistoricalEventLedgerRuntime | undefined {
  const subsystem = orchestrator['subsystems'].find((item) => item.id === 'historical-event-ledger')
  if (!subsystem) return undefined
  const candidate = subsystem as Partial<HistoricalEventLedgerRuntime>
  if (
    typeof candidate.preflightBatch !== 'function'
    || typeof candidate.commitBatch !== 'function'
    || typeof candidate.commitPrepared !== 'function'
    || typeof candidate.prepareCandidateSubmission !== 'function'
    || typeof candidate.submitCandidates !== 'function'
    || typeof candidate.queryCandidates !== 'function'
    || typeof candidate.getDueCandidates !== 'function'
    || typeof candidate.commitCandidateDispositions !== 'function'
    || typeof candidate.prepareCandidateDispositions !== 'function'
    || typeof candidate.capturePersistenceState !== 'function'
    || typeof candidate.restorePersistenceState !== 'function'
    || typeof candidate.getEvent !== 'function'
  ) {
    return undefined
  }
  return subsystem as HistoricalEventLedgerRuntime
}

export function getCurrentHistoricalScopeRuntime(
  orchestrator: OrchestratorSystem,
  contextIdInput?: string): HistoricalEventScope {
  const contextId = contextIdInput?.trim() || orchestrator['worldSetting']?.contextId?.trim()
  return contextId
    ? { kind: 'context', contextIds: [contextId] }
    : { kind: 'global', contextIds: [] }
}

export function buildHistoricalCausalScopeRuntime(
  orchestrator: OrchestratorSystem,
  
  from: HistoricalEventScope,
  to: HistoricalEventScope,
): HistoricalEventScope {
  const contextIds = [...new Set([...from.contextIds, ...to.contextIds])]
  if (contextIds.length > 1) return { kind: 'cross-context', contextIds }
  if (contextIds.length === 1) return { kind: 'context', contextIds }
  return { kind: 'global', contextIds: [] }
}
