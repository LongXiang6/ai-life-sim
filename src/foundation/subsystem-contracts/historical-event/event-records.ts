/**
 * Purpose: Define immutable historical facts, evidence, causal edges, and candidate audit records.
 * Owner: foundation:subsystem-contracts
 * Responsibility: Historical-event record vocabulary only; persistence and operations are separate contracts.
 */

import type {
  ContextCapability,
  GlobalEntityId,
  SpatialNodeId,
  WorldContextId,
} from '../world-context.contract'

export type HistoricalEventId = string
export type HistoricalEventEvidenceId = string
export type HistoricalCausalEdgeId = string
export type HistoricalEventCandidateId = string

export type HistoricalEventStatus =
  | 'scheduled'
  | 'active'
  | 'occurred'
  | 'prevented'
  | 'resolved'
  | 'void'

export type HistoricalEventScopeKind = 'context' | 'global' | 'travel' | 'cross-context'

export interface HistoricalEventScope {
  kind: HistoricalEventScopeKind
  contextIds: WorldContextId[]
}

export interface HistoricalEntityReference {
  entityId?: GlobalEntityId
  label?: string
  contextId?: WorldContextId
  role?: string
}

export interface HistoricalLocationReference {
  nodeId?: SpatialNodeId
  label?: string
  contextId?: WorldContextId
  role?: string
}

export interface HistoricalEventSchedule {
  /** 年度基础点真源；dueTotalDays 仅为旧存档/显示快照。 */
  dueBasePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  dueTotalDays?: number
  dueRoundSequence?: number
  conditionLabel?: string
  legacyYear?: number
}

export type HistoricalEventSourceKind =
  | 'narrative'
  | 'system'
  | 'simulation'
  | 'player'
  | 'migration'

export interface HistoricalEventSource {
  kind: HistoricalEventSourceKind
  sourceId: string
  description?: string
}

export interface HistoricalEventRecord {
  eventId: HistoricalEventId
  eventType: string
  title: string
  description: string
  scope: HistoricalEventScope
  initialStatus: HistoricalEventStatus
  participants: HistoricalEntityReference[]
  locations: HistoricalLocationReference[]
  schedule?: HistoricalEventSchedule
  tags: string[]
  source: HistoricalEventSource
  createdRoundSequence: number
  /** 年度基础点真源。旧存档恢复时由 createdTotalDays 一次迁移。 */
  createdBasePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  createdTotalDays: number
  metadata: Record<string, unknown>
}

export interface HistoricalEventTransition {
  transitionId: string
  eventId: HistoricalEventId
  fromStatus: HistoricalEventStatus
  toStatus: HistoricalEventStatus
  reason: string
  evidenceIds: HistoricalEventEvidenceId[]
  source: HistoricalEventSource
  roundSequence: number
  basePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  totalDays: number
}

export type HistoricalEventEvidenceKind =
  | 'narrative'
  | 'system-commit'
  | 'observation'
  | 'migration'
  | 'external'

export interface HistoricalEventEvidence {
  evidenceId: HistoricalEventEvidenceId
  eventId: HistoricalEventId
  kind: HistoricalEventEvidenceKind
  description: string
  sourceId: string
  contextId?: WorldContextId
  roundSequence: number
  basePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  totalDays: number
  payload?: unknown
}

export type HistoricalCausalRelation =
  | 'causes'
  | 'enables'
  | 'blocks'
  | 'resolves'
  | 'amplifies'
  | 'propagates'

export interface HistoricalCausalEdge {
  edgeId: HistoricalCausalEdgeId
  fromEventId: HistoricalEventId
  toEventId: HistoricalEventId
  relation: HistoricalCausalRelation
  label?: string
  scope: HistoricalEventScope
  evidenceIds: HistoricalEventEvidenceId[]
  source: HistoricalEventSource
  createdRoundSequence: number
  createdBasePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  createdTotalDays: number
}

export interface HistoricalEventCandidate {
  candidateId: HistoricalEventCandidateId
  eventType: string
  title: string
  description: string
  scope: HistoricalEventScope
  participants: HistoricalEntityReference[]
  locations: HistoricalLocationReference[]
  schedule?: HistoricalEventSchedule
  triggerConditionLabel?: string
  requiredCapabilities: ContextCapability[]
  tags: string[]
  source: HistoricalEventSource
  metadata: Record<string, unknown>
}

export type HistoricalEventCandidateAuditStatus =
  | 'available'
  | 'accepted'
  | 'rejected'
  | 'expired'

export type HistoricalEventCandidateDispositionStatus =
  | 'accepted'
  | 'continuing'
  | 'rejected'
  | 'expired'

export interface HistoricalEventCandidateDisposition {
  candidateId: HistoricalEventCandidateId
  status: HistoricalEventCandidateDispositionStatus
  reason: string
}

export interface HistoricalEventCandidateAudit {
  auditId: string
  candidateId: HistoricalEventCandidateId
  status: HistoricalEventCandidateAuditStatus
  candidate: HistoricalEventCandidate
  reason: string
  promotedEventId?: HistoricalEventId
  roundSequence: number
  basePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  totalDays: number
}
