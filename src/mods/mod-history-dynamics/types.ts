/**
 * @module types.ts
 * @description 历史事件账本 MOD 类型；公开业务类型由 Foundation provider-owned contract 维护
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
} from '@/foundation'

/** v1 只用于无损迁移，不再作为运行态业务契约。 */
export interface LegacyEventPoolEntryV1 {
  id?: string
  name?: string
  description?: string
  source?: string
  triggerCondition?: string
  triggerWindow?: unknown
  affectedRegions?: unknown
  severity?: unknown
  triggered?: unknown
  triggeredYear?: unknown
  expired?: unknown
  [key: string]: unknown
}

export interface LegacyEventPoolStateV1 {
  entries?: unknown
  presetUsedIndices?: unknown
  lastCleanupYear?: unknown
  [key: string]: unknown
}

export interface LegacyCausalEventV1 {
  id?: string
  actionType?: string
  captureDescription?: string
  initiator?: string
  target?: string
  captureYear?: unknown
  triggerYear?: unknown
  consequence?: string
  resolved?: unknown
  [key: string]: unknown
}

export interface LegacyCausalSimulationStateV1 {
  queue?: unknown
  lastProcessYear?: unknown
  [key: string]: unknown
}

export interface LegacyHistoryDynamicsStateV1 {
  eventPool?: LegacyEventPoolStateV1
  causalSimulation?: LegacyCausalSimulationStateV1
  [key: string]: unknown
}
