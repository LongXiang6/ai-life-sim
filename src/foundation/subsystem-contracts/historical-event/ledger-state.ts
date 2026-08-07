/**
 * Purpose: Define the historical ledger persistence state and read projection.
 * Owner: foundation:subsystem-contracts
 * Responsibility: Stored ledger shape and aggregate view only.
 */

import type { WorldContextId } from '../world-context.contract'
import type {
  HistoricalCausalEdge,
  HistoricalEventCandidateAudit,
  HistoricalEventEvidence,
  HistoricalEventRecord,
  HistoricalEventStatus,
  HistoricalEventTransition,
} from './event-records'

export interface HistoricalEventMigrationMetadata {
  migrationId: string
  fromVersion: number
  sourceSystemIds: string[]
  migratedAtTotalDays?: number
  eventCount: number
  candidateCount: number
  causalCount: number
  legacyPayload?: unknown
}

export interface HistoricalEventLedgerPersistenceState {
  schemaVersion: 2
  events: HistoricalEventRecord[]
  transitions: HistoricalEventTransition[]
  evidence: HistoricalEventEvidence[]
  causalEdges: HistoricalCausalEdge[]
  candidateAudits: HistoricalEventCandidateAudit[]
  migrationMetadata: HistoricalEventMigrationMetadata[]
}

export interface HistoricalEventView extends HistoricalEventRecord {
  status: HistoricalEventStatus
  latestTransition?: HistoricalEventTransition
  evidenceCount: number
  incomingCausalCount: number
  outgoingCausalCount: number
}

export interface HistoricalEventLedgerContract {
  contextId: WorldContextId
  relevantEvents: HistoricalEventView[]
  relevantCausalEdges: HistoricalCausalEdge[]
  dueCandidates: HistoricalEventCandidateAudit[]
  counts: {
    events: number
    transitions: number
    evidence: number
    causalEdges: number
    candidates: number
    dueCandidates: number
    scheduledRelevant: number
    byStatus: Record<HistoricalEventStatus, number>
  }
}
