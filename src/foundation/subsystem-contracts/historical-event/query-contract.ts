/**
 * Purpose: Define bounded historical ledger query inputs and detailed read results.
 * Owner: foundation:subsystem-contracts
 * Responsibility: Read-side query contracts only; filtering and storage remain with the ledger owner.
 */

import type { GlobalEntityId, SpatialNodeId, WorldContextId } from '../world-context.contract'
import type {
  HistoricalCausalEdge,
  HistoricalCausalEdgeId,
  HistoricalCausalRelation,
  HistoricalEventCandidateAuditStatus,
  HistoricalEventCandidateId,
  HistoricalEventEvidence,
  HistoricalEventEvidenceId,
  HistoricalEventEvidenceKind,
  HistoricalEventId,
  HistoricalEventScopeKind,
  HistoricalEventStatus,
  HistoricalEventTransition,
} from './event-records'
import type { HistoricalEventView } from './ledger-state'

export interface HistoricalQueryWindow {
  offset?: number
  limit?: number
}

export interface HistoricalEventQuery extends HistoricalQueryWindow {
  eventIds?: HistoricalEventId[]
  contextId?: WorldContextId
  scopeKinds?: HistoricalEventScopeKind[]
  statuses?: HistoricalEventStatus[]
  eventTypes?: string[]
  entityIds?: GlobalEntityId[]
  labels?: string[]
  locationNodeIds?: SpatialNodeId[]
  tags?: string[]
  scheduledOnly?: boolean
}

export interface HistoricalCausalEdgeQuery extends HistoricalQueryWindow {
  edgeIds?: HistoricalCausalEdgeId[]
  eventId?: HistoricalEventId
  fromEventIds?: HistoricalEventId[]
  toEventIds?: HistoricalEventId[]
  contextId?: WorldContextId
  relations?: HistoricalCausalRelation[]
}

export interface HistoricalEventEvidenceQuery extends HistoricalQueryWindow {
  evidenceIds?: HistoricalEventEvidenceId[]
  eventIds?: HistoricalEventId[]
  kinds?: HistoricalEventEvidenceKind[]
  contextId?: WorldContextId
}

export interface HistoricalEventTransitionQuery extends HistoricalQueryWindow {
  transitionIds?: string[]
  eventIds?: HistoricalEventId[]
  fromStatuses?: HistoricalEventStatus[]
  toStatuses?: HistoricalEventStatus[]
}

export interface HistoricalEventMigrationQuery extends HistoricalQueryWindow {
  migrationIds?: string[]
  fromVersions?: number[]
  sourceSystemIds?: string[]
}

export interface HistoricalEventDetailsQuery {
  transitions?: HistoricalQueryWindow
  evidence?: HistoricalQueryWindow
  incomingCausalEdges?: HistoricalQueryWindow
  outgoingCausalEdges?: HistoricalQueryWindow
}

export interface HistoricalEventDetails {
  event: HistoricalEventView
  transitions: HistoricalEventTransition[]
  evidence: HistoricalEventEvidence[]
  incomingCausalEdges: HistoricalCausalEdge[]
  outgoingCausalEdges: HistoricalCausalEdge[]
  relatedCounts: {
    transitions: number
    evidence: number
    incomingCausalEdges: number
    outgoingCausalEdges: number
  }
}

export interface HistoricalEventCandidateQuery extends HistoricalQueryWindow {
  candidateIds?: HistoricalEventCandidateId[]
  contextId?: WorldContextId
  statuses?: HistoricalEventCandidateAuditStatus[]
  latestOnly?: boolean
}
