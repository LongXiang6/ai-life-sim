/**
 * @module historical-event.contract.ts
 * @description P1 历史事件账本的 provider-owned 跨域纯类型契约
 * @mod foundation
 */

import type {
  ContextCapability,
  GlobalEntityId,
  SpatialNodeId,
  WorldContextId,
} from './world-context.contract'

export type HistoricalEventId = string
export type HistoricalEventEvidenceId = string
export type HistoricalCausalEdgeId = string
export type HistoricalEventCandidateId = string

/** 候选不是事实；正式事件只使用下列事实状态。 */
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
  /** context=1 个；travel/cross-context=至少 2 个；global 可为空。 */
  contextIds: WorldContextId[]
}

/**
 * 已知实体使用稳定 ID；只知道名称时仅保存 label，绝不伪造 entityId。
 */
export interface HistoricalEntityReference {
  entityId?: GlobalEntityId
  label?: string
  contextId?: WorldContextId
  role?: string
}

/**
 * 已知地点使用空间节点 ID；只有自然语言地点时仅保存 label。
 */
export interface HistoricalLocationReference {
  nodeId?: SpatialNodeId
  label?: string
  contextId?: WorldContextId
  role?: string
}

export interface HistoricalEventSchedule {
  dueTotalDays?: number
  dueRoundSequence?: number
  conditionLabel?: string
  /** 仅用于无损承接 v1 年份语义，不作为新事件的规范时间。 */
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

/** 创建后不原地改写；后续状态变化进入 transitions。 */
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
  /** 为空表示不依赖题材能力；非空时由 owning system 对每个目标上下文逐项验证。 */
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

export interface HistoricalEventCandidateAudit {
  auditId: string
  candidateId: HistoricalEventCandidateId
  status: HistoricalEventCandidateAuditStatus
  candidate: HistoricalEventCandidate
  reason: string
  promotedEventId?: HistoricalEventId
  roundSequence: number
  totalDays: number
}

export interface HistoricalEventMigrationMetadata {
  migrationId: string
  fromVersion: number
  sourceSystemIds: string[]
  migratedAtTotalDays?: number
  eventCount: number
  candidateCount: number
  causalCount: number
  /** 原始 v1 payload 原样保留，确保未知旧字段也不会在迁移中丢失。 */
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
  counts: {
    events: number
    transitions: number
    evidence: number
    causalEdges: number
    candidates: number
    scheduledRelevant: number
    byStatus: Record<HistoricalEventStatus, number>
  }
}

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

export interface HistoricalQueryWindow {
  /** 从匹配结果中的第几项开始读取；完整事实仍保留在 Store。 */
  offset?: number
  /** 单次读取数量；owning system 会要求其处于公开上限内。 */
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

export interface HistoricalEventCandidateQuery extends HistoricalQueryWindow {
  candidateIds?: HistoricalEventCandidateId[]
  contextId?: WorldContextId
  statuses?: HistoricalEventCandidateAuditStatus[]
  /** 缺省只返回每个候选的最新状态；false 返回完整追加式审计链。 */
  latestOnly?: boolean
}

export interface HistoricalCausalCommitmentInput {
  commitmentId: string
  resultEvent: HistoricalEventCreateInput
  sourceEventId?: HistoricalEventId
  relation?: HistoricalCausalRelation
  evidence?: Omit<HistoricalEventEvidenceInput, 'eventId' | 'sourceId'>[]
}
