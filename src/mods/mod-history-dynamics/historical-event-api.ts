/**
 * @module historical-event-api.ts
 * @description 历史事件账本跨 MOD 重 API；由 manifest.secondaryPublicEntries 声明
 * @mod mod-history-dynamics
 */

import type {
  HistoricalCausalCommitmentInput,
  HistoricalCausalEdgeInput,
  HistoricalCausalEdgeQuery,
  HistoricalEventCandidateQuery,
  HistoricalEventCandidateSubmission,
  HistoricalEventCommitBatch,
  HistoricalEventCreateInput,
  HistoricalEventDetailsQuery,
  HistoricalEventEvidenceQuery,
  HistoricalEventMigrationQuery,
  HistoricalEventQuery,
  HistoricalEventTransitionQuery,
  HistoricalEventValidationContext,
  RoundContext,
  SubSystemState,
} from '@/foundation'

import { getHistoricalEventLedgerSystem } from './subsystems/historical-event-ledger-system'

export { getHistoricalEventLedgerSystem }

export function preflightHistoricalEventBatch(
  batch: HistoricalEventCommitBatch,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().preflightBatch(batch, context)
}

export function commitHistoricalEventBatch(
  batch: HistoricalEventCommitBatch,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().commitBatch(batch, context)
}

export function queryHistoricalEvents(query: HistoricalEventQuery = {}) {
  return getHistoricalEventLedgerSystem().queryEvents(query)
}

export function getHistoricalEvent(eventId: string) {
  return getHistoricalEventLedgerSystem().getEvent(eventId)
}

export function getHistoricalEventDetails(
  eventId: string,
  query: HistoricalEventDetailsQuery = {},
) {
  return getHistoricalEventLedgerSystem().getEventDetails(eventId, query)
}

export function queryHistoricalEventEvidence(query: HistoricalEventEvidenceQuery = {}) {
  return getHistoricalEventLedgerSystem().queryEvidence(query)
}

export function queryHistoricalEventTransitions(query: HistoricalEventTransitionQuery = {}) {
  return getHistoricalEventLedgerSystem().queryTransitions(query)
}

export function queryHistoricalEventMigrations(query: HistoricalEventMigrationQuery = {}) {
  return getHistoricalEventLedgerSystem().queryMigrationMetadata(query)
}

export function queryHistoricalCausalEdges(query: HistoricalCausalEdgeQuery = {}) {
  return getHistoricalEventLedgerSystem().queryCausalEdges(query)
}

export function submitHistoricalEventCandidates(
  submission: HistoricalEventCandidateSubmission,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().submitCandidates(submission, context)
}

export function queryHistoricalEventCandidates(query: HistoricalEventCandidateQuery = {}) {
  return getHistoricalEventLedgerSystem().queryCandidates(query)
}

export function promoteHistoricalEventCandidate(
  candidateId: string,
  event: HistoricalEventCreateInput,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().promoteCandidate(candidateId, event, context)
}

export function rejectHistoricalEventCandidate(
  candidateId: string,
  reason: string,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().rejectCandidate(candidateId, reason, context)
}

export function expireHistoricalEventCandidate(
  candidateId: string,
  reason: string,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().expireCandidate(candidateId, reason, context)
}

export function preflightCrossContextHistoricalEdge(
  edge: HistoricalCausalEdgeInput,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().preflightCrossContextEdge(edge, context)
}

export function commitCrossContextHistoricalEdge(
  edge: HistoricalCausalEdgeInput,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().commitCrossContextEdge(edge, context)
}

export function commitHistoricalCausalCommitment(
  input: HistoricalCausalCommitmentInput,
  context: RoundContext | HistoricalEventValidationContext,
) {
  return getHistoricalEventLedgerSystem().commitCausalCommitment(input, context)
}

export function captureHistoricalEventPersistenceState() {
  return getHistoricalEventLedgerSystem().capturePersistenceState()
}

export function restoreHistoricalEventPersistenceState(snapshot: unknown): void {
  getHistoricalEventLedgerSystem().restorePersistenceState(snapshot)
}

export function importLegacyHistoricalCollectedStates(
  states: Record<string, SubSystemState>,
): boolean {
  return getHistoricalEventLedgerSystem().importLegacyCollectedStates(states)
}
