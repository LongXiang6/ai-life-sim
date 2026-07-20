/**
 * @module index.ts
 * @description 历史事件账本轻量公共入口；重 API 位于 historical-event-api.ts
 * @mod mod-history-dynamics
 */

export type {
  HistoricalEventId,
  HistoricalEventEvidenceId,
  HistoricalCausalEdgeId,
  HistoricalEventCandidateId,
  HistoricalEventStatus,
  HistoricalEventScopeKind,
  HistoricalEventScope,
  HistoricalEntityReference,
  HistoricalLocationReference,
  HistoricalEventSchedule,
  HistoricalEventSourceKind,
  HistoricalEventSource,
  HistoricalEventRecord,
  HistoricalEventTransition,
  HistoricalEventEvidenceKind,
  HistoricalEventEvidence,
  HistoricalCausalRelation,
  HistoricalCausalEdge,
  HistoricalEventCandidate,
  HistoricalEventCandidateAuditStatus,
  HistoricalEventCandidateAudit,
  HistoricalEventMigrationMetadata,
  HistoricalEventLedgerPersistenceState,
  HistoricalEventView,
  HistoricalEventLedgerContract,
  HistoricalEventCreateInput,
  HistoricalEventTransitionInput,
  HistoricalEventEvidenceInput,
  HistoricalCausalEdgeInput,
  HistoricalEventCommitBatch,
  HistoricalEventValidationContext,
  HistoricalEventPreparedAppend,
  HistoricalEventPreflightResult,
  HistoricalEventCommitResult,
  HistoricalQueryWindow,
  HistoricalEventQuery,
  HistoricalCausalEdgeQuery,
  HistoricalEventEvidenceQuery,
  HistoricalEventTransitionQuery,
  HistoricalEventMigrationQuery,
  HistoricalEventDetailsQuery,
  HistoricalEventDetails,
  HistoricalEventCandidateInput,
  HistoricalEventCandidateSubmission,
  HistoricalEventCandidateQuery,
  HistoricalCausalCommitmentInput,
} from './types'

export { HISTORICAL_EVENT_STATUSES, HISTORICAL_EVENT_TRANSITIONS } from './constants'
export {
  createEmptyHistoryLedgerState,
  isHistoryLedgerPersistenceState,
  migrateHistoryDynamicsState,
  useHistoryDynamicsStore,
} from './store'
export {
  useHistoricalEvents,
  useHistoricalCausalEdges,
  useHistoricalEventCandidates,
  useHistoryDynamics,
} from './hooks'
