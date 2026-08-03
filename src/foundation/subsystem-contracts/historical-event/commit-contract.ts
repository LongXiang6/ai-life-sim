/**
 * Purpose: Define historical ledger validation, append, and candidate submission inputs and results.
 * Owner: foundation:subsystem-contracts
 * Responsibility: Write-side contracts only; owning systems implement validation and persistence.
 */

import type { ContextCapability, WorldContextId } from '../world-context.contract'
import type {
  HistoricalCausalEdge,
  HistoricalCausalEdgeId,
  HistoricalCausalRelation,
  HistoricalEntityReference,
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateId,
  HistoricalEventEvidence,
  HistoricalEventEvidenceId,
  HistoricalEventEvidenceKind,
  HistoricalEventId,
  HistoricalEventRecord,
  HistoricalEventSchedule,
  HistoricalEventScope,
  HistoricalEventSource,
  HistoricalEventStatus,
  HistoricalEventTransition,
  HistoricalLocationReference,
} from './event-records'
import type { HistoricalEventMigrationMetadata } from './ledger-state'

export interface HistoricalEventCreateInput {
  eventId?: HistoricalEventId
  eventType: string
  title: string
  description: string
  scope: HistoricalEventScope
  status: HistoricalEventStatus
  participants?: HistoricalEntityReference[]
  locations?: HistoricalLocationReference[]
  schedule?: HistoricalEventSchedule
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface HistoricalEventTransitionInput {
  transitionId?: string
  eventId: HistoricalEventId
  toStatus: HistoricalEventStatus
  reason: string
  evidenceIds?: HistoricalEventEvidenceId[]
}

export interface HistoricalEventEvidenceInput {
  evidenceId?: HistoricalEventEvidenceId
  eventId: HistoricalEventId
  kind: HistoricalEventEvidenceKind
  description: string
  sourceId: string
  contextId?: WorldContextId
  payload?: unknown
}

export interface HistoricalCausalEdgeInput {
  edgeId?: HistoricalCausalEdgeId
  fromEventId: HistoricalEventId
  toEventId: HistoricalEventId
  relation: HistoricalCausalRelation
  label?: string
  scope: HistoricalEventScope
  evidenceIds?: HistoricalEventEvidenceId[]
}

export interface HistoricalEventCommitBatch {
  batchId?: string
  source: HistoricalEventSource
  events?: HistoricalEventCreateInput[]
  transitions?: HistoricalEventTransitionInput[]
  evidence?: HistoricalEventEvidenceInput[]
  causalEdges?: HistoricalCausalEdgeInput[]
}

export interface HistoricalEventValidationContext {
  contextId: WorldContextId
  roundSequence: number
  totalDays: number
}

export interface HistoricalEventPreparedAppend {
  batchId: string
  events: HistoricalEventRecord[]
  transitions: HistoricalEventTransition[]
  evidence: HistoricalEventEvidence[]
  causalEdges: HistoricalCausalEdge[]
  candidateAudits: HistoricalEventCandidateAudit[]
  migrationMetadata: HistoricalEventMigrationMetadata[]
}

export interface HistoricalEventPreflightResult {
  ok: boolean
  errors: string[]
  prepared?: HistoricalEventPreparedAppend
}

export interface HistoricalEventCommitResult {
  ok: boolean
  errors: string[]
  batchId?: string
  eventIds: HistoricalEventId[]
  transitionIds: string[]
  evidenceIds: HistoricalEventEvidenceId[]
  causalEdgeIds: HistoricalCausalEdgeId[]
}

export interface HistoricalEventCandidateInput {
  candidateId?: HistoricalEventCandidateId
  eventType: string
  title: string
  description: string
  scope: HistoricalEventScope
  participants?: HistoricalEntityReference[]
  locations?: HistoricalLocationReference[]
  schedule?: HistoricalEventSchedule
  triggerConditionLabel?: string
  requiredCapabilities?: ContextCapability[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface HistoricalEventCandidateSubmission {
  source: HistoricalEventSource
  candidates: HistoricalEventCandidateInput[]
}

export interface HistoricalCausalCommitmentInput {
  commitmentId: string
  resultEvent: HistoricalEventCreateInput
  sourceEventId?: HistoricalEventId
  relation?: HistoricalCausalRelation
  evidence?: Omit<HistoricalEventEvidenceInput, 'eventId' | 'sourceId'>[]
}
