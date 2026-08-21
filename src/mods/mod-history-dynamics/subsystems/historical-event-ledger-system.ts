/**
 * Purpose: Own append-only historical facts, evidence, transitions, candidates, and causal edges.
 * Owner: mod-history-dynamics
 * Responsibility: Coordinate ledger writes and persistence; read projection is delegated downstream.
 *
 * 职责：拥有跨世界历史事件事实、状态迁移、证据、因果边和候选审计。
 * 非职责：不创作正文、不随机触发题材事件、不替代 causal-delay 的叙事承诺兑现。
 * 输入：显式事件批次、候选、因果边、RoundContext 与 P0 世界/空间真源。
 * 输出与写入：当前/global/travel 相关事件视图；Store v2 六类 append-only 状态。
 * AI 参与：02 连续性结果中的未来事件；状态仍由账本本地拥有。
 * 状态权威：Foundation provider-owned contract + useHistoryDynamicsStore。
 * 持久化权威：capturePersistenceState/restorePersistenceState 与 Store v2。
 * 运行存活：manifest 仅声明 HistoricalEventLedgerSystem；P1 runtime policy 由引擎登记。
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type {
  ContextCapability,
  HistoricalCausalCommitmentInput,
  HistoricalCausalEdge,
  HistoricalCausalEdgeInput,
  HistoricalCausalEdgeQuery,
  HistoricalEventCandidate,
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateDispositionBatch,
  HistoricalEventCandidateDispositionResult,
  HistoricalEventCandidateQuery,
  HistoricalEventCandidateSubmission,
  HistoricalEventCommitBatch,
  HistoricalEventCommitResult,
  HistoricalEventCreateInput,
  HistoricalEventEvidence,
  HistoricalEventEvidenceInput,
  HistoricalEventEvidenceQuery,
  HistoricalEventDetails,
  HistoricalEventDetailsQuery,
  HistoricalEventLedgerContract,
  HistoricalEventLedgerPersistenceState,
  HistoricalEventMigrationMetadata,
  HistoricalEventMigrationQuery,
  HistoricalEventPreflightResult,
  HistoricalEventPreparedAppend,
  HistoricalEventQuery,
  HistoricalEventRecord,
  HistoricalEventScope,
  HistoricalEventStatus,
  HistoricalEventTransition,
  HistoricalEventTransitionInput,
  HistoricalEventTransitionQuery,
  HistoricalEventValidationContext,
  HistoricalEventView,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'
import { getRoundSequence } from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'

import { HISTORICAL_EVENT_STATUSES, HISTORICAL_EVENT_TRANSITIONS } from '../constants'
import {
  isHistoryLedgerPersistenceState,
  migrateHistoryDynamicsState,
  normalizeHistoryLedgerPersistenceState,
  selectHistoryLedgerReadState,
  useHistoryDynamicsStore,
} from '../store'
import type { HistoryLedgerReadState } from '../store'
import {
  cloneValue,
  createLedgerId,
  isPlainRecord,
  nonEmptyText,
} from '../utils'
import { CausalGraphComponent } from '../components/causal-graph-component'
import { EventCandidateProvider } from '../components/event-candidate-provider'
import {
  commitCandidateDispositionsRuntime,
  prepareCandidateDispositionsRuntime,
  type PreparedCandidateDispositionResult,
} from './historical-event-ledger-system/candidate-disposition-runtime'
import {
  getDueCandidatesRuntime,
  isHistoricalScheduleDue,
  toHistoricalValidationContext,
  type TrustedHistoricalEventValidationContext,
} from './historical-event-ledger-system/candidate-due-runtime'
import {
  getHistoricalEventDetailsRuntime,
  getHistoricalEventRuntime,
  isRelevantHistoricalScope,
  queryHistoricalCandidatesRuntime,
  queryHistoricalCausalEdgesRuntime,
  queryHistoricalEventsRuntime,
  queryHistoricalEvidenceRuntime,
  queryHistoricalMigrationRuntime,
  queryHistoricalTransitionsRuntime,
} from './historical-event-ledger-system/query-runtime'

const EVENT_STATUS_SET = new Set<string>(HISTORICAL_EVENT_STATUSES)
const CANDIDATE_STATUS_SET = new Set(['available', 'accepted', 'rejected', 'expired'])
const SOURCE_KIND_SET = new Set(['narrative', 'system', 'simulation', 'player', 'migration'])
const SCOPE_KIND_SET = new Set(['context', 'global', 'travel', 'cross-context'])
const EVIDENCE_KIND_SET = new Set([
  'narrative',
  'system-commit',
  'observation',
  'migration',
  'external',
])
const CAUSAL_RELATION_SET = new Set([
  'causes',
  'enables',
  'blocks',
  'resolves',
  'amplifies',
  'propagates',
])
const CAPABILITY_SET = new Set<ContextCapability>([
  'life',
  'space',
  'technology',
  'supernatural',
])

function emptyCommitResult(errors: string[]): HistoricalEventCommitResult {
  return {
    ok: false,
    errors,
    eventIds: [],
    transitionIds: [],
    evidenceIds: [],
    causalEdgeIds: [],
  }
}

function toValidationContext(
  context: RoundContext | HistoricalEventValidationContext,
): TrustedHistoricalEventValidationContext {
  return toHistoricalValidationContext(context)
}

interface HistoricalLedgerIndex {
  state: HistoryLedgerReadState
  eventById: Map<string, HistoricalEventRecord>
  statusByEventId: Map<string, HistoricalEventStatus>
  latestTransitionByEventId: Map<string, HistoricalEventTransition>
  transitionsByEventId: Map<string, HistoricalEventTransition[]>
  evidenceByEventId: Map<string, HistoricalEventEvidence[]>
  incomingEdgesByEventId: Map<string, HistoricalCausalEdge[]>
  outgoingEdgesByEventId: Map<string, HistoricalCausalEdge[]>
  latestCandidateById: Map<string, HistoricalEventCandidateAudit>
  countsByStatus: Record<HistoricalEventStatus, number>
}

export class HistoricalEventLedgerSystem extends BaseSubsystem {
  readonly id = 'historical-event-ledger' as const
  readonly mod = 'mod-history-dynamics' as const
  readonly label = '历史事件账本' as const
  readonly description = '保存跨世界历史事实、状态、证据与显式因果关系' as const

  private readonly candidateProvider = new EventCandidateProvider()
  private readonly causalGraph = new CausalGraphComponent()
  private cachedIndex?: HistoricalLedgerIndex
  /** 最近一次通过严格校验的 Store 数组引用；外部水合或直接替换后会自动失效。 */
  private validatedStoreState?: HistoryLedgerReadState
  private hydrationError?: Error

  private isValidatedStoreState(state: HistoryLedgerReadState): boolean {
    const validated = this.validatedStoreState
    return Boolean(
      validated
      && validated.events === state.events
      && validated.transitions === state.transitions
      && validated.evidence === state.evidence
      && validated.causalEdges === state.causalEdges
      && validated.candidateAudits === state.candidateAudits
      && validated.migrationMetadata === state.migrationMetadata
    )
  }

  private markCurrentStoreValidated(): void {
    this.validatedStoreState = selectHistoryLedgerReadState()
    this.hydrationError = undefined
    this.cachedIndex = undefined
  }

  /** 任何查询、提交或存档前都必须确认当前 Store 经过严格 v2 校验。 */
  private ensureCurrentStoreValidated(): void {
    if (this.isValidatedStoreState(selectHistoryLedgerReadState())) return
    this.hydrateFromStore()
    if (this.isValidatedStoreState(selectHistoryLedgerReadState())) return
    throw this.hydrationError ?? new Error('历史事件账本尚未完成严格持久化校验')
  }

  collectState(context: RoundContext): SubSystemState {
    const index = this.getLedgerIndex()
    const relevantEvents: HistoricalEventView[] = []
    for (const event of index.state.events) {
      const status = index.statusByEventId.get(event.eventId) ?? event.initialStatus
      if (
        (status === 'scheduled' || status === 'active')
        && isRelevantHistoricalScope(event.scope, context.contextId)
      ) {
        if (status === 'scheduled' && !isHistoricalScheduleDue(event.schedule, {
          totalDays: context.totalDays,
          roundSequence: getRoundSequence(context),
          legacyYear: context.round.year,
        })) continue
        relevantEvents.push(this.toView(event, index))
      }
    }
    const dueCandidates = this.getDueCandidates(context)
    const relevantEventIds = new Set(relevantEvents.map((event) => event.eventId))
    const relevantCausalEdges: HistoricalCausalEdge[] = []
    for (const edge of index.state.causalEdges) {
      if (
        isRelevantHistoricalScope(edge.scope, context.contextId)
        && (relevantEventIds.has(edge.fromEventId) || relevantEventIds.has(edge.toEventId))
      ) {
        relevantCausalEdges.push(cloneValue(edge))
      }
    }
    const relevantPendingCount = relevantEvents.length
    const data: HistoricalEventLedgerContract = {
      contextId: context.contextId,
      relevantEvents,
      relevantCausalEdges: cloneValue(relevantCausalEdges),
      dueCandidates,
      counts: {
        events: index.state.events.length,
        transitions: index.state.transitions.length,
        evidence: index.state.evidence.length,
        causalEdges: index.state.causalEdges.length,
        candidates: index.latestCandidateById.size,
        dueCandidates: dueCandidates.length,
        scheduledRelevant: relevantEvents.filter((event) => Boolean(event.schedule)).length,
        byStatus: { ...index.countsByStatus },
      },
    }
    return {
      id: this.id,
      summary: `【${this.label}：当前相关待续 ${relevantPendingCount} | 到期候选 ${dueCandidates.length} | 相关因果边 ${relevantCausalEdges.length}】`,
      data: structuredClone(data),
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] 变更必须是对象`)
    if (changes.id !== this.id) throw new Error(`[${this.id}] 变更目标不匹配`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] changes.changes 必须是普通对象`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] 缺少变更说明`)
    }
    const payload = changes.changes
    const batch = payload.batch
    if (!isPlainRecord(batch)) throw new Error(`[${this.id}] event-input 必须提供 batch`)
    const result = this.commitNarrativeBatch(batch as unknown as HistoricalEventCommitBatch, context)
    if (!result.ok) throw new Error(`[${this.id}] ${result.errors.join('；')}`)
  }

  reset(): void {
    useHistoryDynamicsStore.getState().reset()
    this.markCurrentStoreValidated()
  }

  preflightNarrativeBatch(
    batch: HistoricalEventCommitBatch,
    context: RoundContext,
  ): HistoricalEventPreflightResult {
    if (batch.source?.kind !== 'narrative') {
      return { ok: false, errors: ['叙事批次 source.kind 必须为 narrative'] }
    }
    return this.preflightBatch(batch, toValidationContext(context))
  }

  commitNarrativeBatch(
    batch: HistoricalEventCommitBatch,
    context: RoundContext,
  ): HistoricalEventCommitResult {
    const preflight = this.preflightNarrativeBatch(batch, context)
    return this.commitPrepared(preflight)
  }

  preflightBatch(
    batch: HistoricalEventCommitBatch,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventPreflightResult {
    const context = toValidationContext(rawContext)
    const errors: string[] = []
    const index = this.getLedgerIndex()
    if (!batch || typeof batch !== 'object') return { ok: false, errors: ['事件批次必须是对象'] }
    if (!isPlainRecord(batch.source)) return { ok: false, errors: ['事件批次缺少 source'] }
    this.validateSource(batch.source, errors, '事件来源')
    this.validateValidationContext(context, errors)

    const batchId = nonEmptyText(batch.batchId) ?? createLedgerId('history-batch')
    const prepared: HistoricalEventPreparedAppend = {
      batchId,
      events: [],
      transitions: [],
      evidence: [],
      causalEdges: [],
      candidateAudits: [],
      migrationMetadata: [],
    }
    const eventMap = new Map(index.eventById)
    const statusMap = new Map(index.statusByEventId)
    const eventIds = new Set(index.eventById.keys())
    const transitionIds = new Set(index.state.transitions.map((item) => item.transitionId))
    const evidenceIds = new Set(index.state.evidence.map((item) => item.evidenceId))
    const edgeIds = new Set(index.state.causalEdges.map((item) => item.edgeId))

    for (const [index, input] of (batch.events ?? []).entries()) {
      if (!isPlainRecord(input)) {
        errors.push(`events[${index}] 必须是对象`)
        continue
      }
      const record = this.prepareEvent(input, batch.source, context, errors, `events[${index}]`)
      if (!record) continue
      if (eventIds.has(record.eventId)) errors.push(`事件 ID 重复: ${record.eventId}`)
      eventIds.add(record.eventId)
      eventMap.set(record.eventId, record)
      statusMap.set(record.eventId, record.initialStatus)
      prepared.events.push(record)
    }

    for (const [index, input] of (batch.evidence ?? []).entries()) {
      const evidence = this.prepareEvidence(input, context, errors, `evidence[${index}]`)
      if (!evidence) continue
      if (evidenceIds.has(evidence.evidenceId)) errors.push(`证据 ID 重复: ${evidence.evidenceId}`)
      const evidenceEvent = eventMap.get(evidence.eventId)
      if (!evidenceEvent) {
        errors.push(`证据引用的事件不存在: ${evidence.eventId}`)
      } else {
        this.validateEventWriteTarget(
          evidenceEvent,
          batch.source.kind,
          context,
          errors,
          `evidence[${index}]`,
        )
        this.validateEvidenceScope(evidence, evidenceEvent, errors, `evidence[${index}]`)
        this.validateEvidenceWriteContext(
          evidence,
          evidenceEvent,
          batch.source.kind,
          errors,
          `evidence[${index}]`,
        )
      }
      evidenceIds.add(evidence.evidenceId)
      prepared.evidence.push(evidence)
    }

    for (const [index, input] of (batch.transitions ?? []).entries()) {
      const transition = this.prepareTransition(
        input,
        batch.source,
        context,
        statusMap,
        evidenceIds,
        errors,
        `transitions[${index}]`,
      )
      if (!transition) continue
      if (transitionIds.has(transition.transitionId)) {
        errors.push(`迁移记录 ID 重复: ${transition.transitionId}`)
      }
      transitionIds.add(transition.transitionId)
      const transitionEvent = eventMap.get(transition.eventId)
      if (transitionEvent) {
        this.validateEventWriteTarget(
          transitionEvent,
          batch.source.kind,
          context,
          errors,
          `transitions[${index}]`,
        )
      }
      statusMap.set(transition.eventId, transition.toStatus)
      prepared.transitions.push(transition)
    }

    for (const [index, input] of (batch.causalEdges ?? []).entries()) {
      if (!isPlainRecord(input)) {
        errors.push(`causalEdges[${index}] 必须是对象`)
        continue
      }
      this.validateScope(input.scope, errors, `causalEdges[${index}].scope`)
      this.validateWriteScope(
        input.scope,
        batch.source.kind,
        context,
        errors,
        `causalEdges[${index}].scope`,
      )
      if (!CAUSAL_RELATION_SET.has(String(input.relation))) {
        errors.push(`causalEdges[${index}].relation 无效`)
      }
      const rawEvidenceIds = input.evidenceIds ?? []
      this.validateStringArray(rawEvidenceIds, errors, `causalEdges[${index}].evidenceIds`)
      const edge = this.causalGraph.createEdge({
        ...input,
        evidenceIds: Array.isArray(rawEvidenceIds) ? rawEvidenceIds : [],
      }, batch.source, context)
      if (edgeIds.has(edge.edgeId)) errors.push(`因果边 ID 重复: ${edge.edgeId}`)
      for (const evidenceId of edge.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) errors.push(`因果边引用的证据不存在: ${evidenceId}`)
      }
      const graphResult = this.causalGraph.validateEdge(input, eventMap)
      errors.push(...graphResult.errors.map((error) => `causalEdges[${index}]: ${error}`))
      edgeIds.add(edge.edgeId)
      prepared.causalEdges.push(edge)
    }

    if (
      prepared.events.length === 0
      && prepared.transitions.length === 0
      && prepared.evidence.length === 0
      && prepared.causalEdges.length === 0
    ) {
      errors.push('事件批次不能为空')
    }
    return errors.length > 0
      ? { ok: false, errors }
      : { ok: true, errors: [], prepared }
  }

  commitBatch(
    batch: HistoricalEventCommitBatch,
    context: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCommitResult {
    return this.commitPrepared(this.preflightBatch(batch, context))
  }

  getEvent(eventId: string): HistoricalEventView | undefined {
    return getHistoricalEventRuntime(this, eventId)
  }

  queryEvents(query: HistoricalEventQuery = {}): HistoricalEventView[] {
    return queryHistoricalEventsRuntime(this, query)
  }

  queryEvidence(query: HistoricalEventEvidenceQuery = {}): HistoricalEventEvidence[] {
    return queryHistoricalEvidenceRuntime(this, query)
  }

  queryTransitions(query: HistoricalEventTransitionQuery = {}): HistoricalEventTransition[] {
    return queryHistoricalTransitionsRuntime(this, query)
  }

  queryMigrationMetadata(
    query: HistoricalEventMigrationQuery = {},
  ): HistoricalEventMigrationMetadata[] {
    return queryHistoricalMigrationRuntime(this, query)
  }

  getEventDetails(
    eventId: string,
    query: HistoricalEventDetailsQuery = {},
  ): HistoricalEventDetails | undefined {
    return getHistoricalEventDetailsRuntime(this, eventId, query)
  }

  queryCausalEdges(query: HistoricalCausalEdgeQuery = {}): HistoricalCausalEdge[] {
    return queryHistoricalCausalEdgesRuntime(this, query)
  }

  submitCandidates(
    submission: HistoricalEventCandidateSubmission,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCandidateAudit[] {
    const preparation = this.prepareCandidateSubmission(submission, rawContext)
    const commit = this.commitPrepared({
      ok: true,
      errors: [],
      prepared: preparation.prepared,
    })
    if (!commit.ok) throw new Error(commit.errors.join('；'))
    return cloneValue(preparation.candidateAudits)
  }

  prepareCandidateSubmission(
    submission: HistoricalEventCandidateSubmission,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): {
    prepared: HistoricalEventPreparedAppend
    candidateAudits: HistoricalEventCandidateAudit[]
  } {
    const context = toValidationContext(rawContext)
    const errors: string[] = []
    this.validateValidationContext(context, errors)
    if (!isPlainRecord(submission?.source)) {
      errors.push('候选来源无效')
    } else {
      this.validateSource(submission.source, errors, '候选来源')
    }
    if (!Array.isArray(submission?.candidates) || submission.candidates.length === 0) {
      errors.push('候选提交不能为空')
    } else {
      for (const [index, candidate] of submission.candidates.entries()) {
        if (!isPlainRecord(candidate)) {
          errors.push(`candidates[${index}] 必须是对象`)
          continue
        }
        for (const field of ['eventType', 'title', 'description'] as const) {
          if (!nonEmptyText(candidate[field])) errors.push(`candidates[${index}].${field} 不能为空`)
        }
        if (
          candidate.requiredCapabilities !== undefined
          && !Array.isArray(candidate.requiredCapabilities)
        ) {
          errors.push(`candidates[${index}].requiredCapabilities 必须是数组`)
        }
      }
    }
    if (errors.length > 0) throw new Error(errors.join('；'))

    const audits = this.candidateProvider.prepareSubmission(submission, context)
    const existing = this.getLedgerIndex().latestCandidateById
    const incoming = new Set<string>()
    for (const [index, audit] of audits.entries()) {
      const candidate = audit.candidate
      this.validateCandidate(candidate, errors, `candidates[${index}]`, {
        mode: 'new-write',
        validationContext: context,
      })
      if (existing.has(candidate.candidateId) || incoming.has(candidate.candidateId)) {
        errors.push(`候选 ID 重复: ${candidate.candidateId}`)
      }
      incoming.add(candidate.candidateId)
    }
    if (errors.length > 0) throw new Error(errors.join('；'))
    const prepared: HistoricalEventPreparedAppend = {
      batchId: createLedgerId('candidate-batch'),
      events: [],
      transitions: [],
      evidence: [],
      causalEdges: [],
      candidateAudits: audits,
      migrationMetadata: [],
    }
    return {
      prepared: cloneValue(prepared),
      candidateAudits: cloneValue(audits),
    }
  }

  queryCandidates(query: HistoricalEventCandidateQuery = {}): HistoricalEventCandidateAudit[] {
    return queryHistoricalCandidatesRuntime(this, query)
  }

  getDueCandidates(
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCandidateAudit[] {
    return getDueCandidatesRuntime(this, rawContext)
  }

  commitCandidateDispositions(
    batch: HistoricalEventCandidateDispositionBatch,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCandidateDispositionResult {
    return commitCandidateDispositionsRuntime(this, batch, rawContext)
  }

  prepareCandidateDispositions(
    batch: HistoricalEventCandidateDispositionBatch,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): PreparedCandidateDispositionResult {
    return prepareCandidateDispositionsRuntime(this, batch, rawContext)
  }

  promoteCandidate(
    candidateId: string,
    eventInput: HistoricalEventCreateInput,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCommitResult {
    const context = toValidationContext(rawContext)
    const latest = this.getLedgerIndex().latestCandidateById.get(candidateId)
    if (!latest) return emptyCommitResult([`候选不存在: ${candidateId}`])
    if (latest.status !== 'available') {
      return emptyCommitResult([`候选已终结，不能再次提升: ${candidateId}`])
    }
    const candidateErrors: string[] = []
    this.validateCandidate(latest.candidate, candidateErrors, 'candidate', {
      mode: 'new-write',
      validationContext: context,
    })
    if (candidateErrors.length > 0) return emptyCommitResult(candidateErrors)
    const source = cloneValue(latest.candidate.source)
    const preflight = this.preflightBatch({ source, events: [eventInput] }, context)
    if (!preflight.ok || !preflight.prepared) return emptyCommitResult(preflight.errors)
    const eventId = preflight.prepared.events[0]?.eventId
    if (!eventId) return emptyCommitResult(['候选提升未生成事件'])
    preflight.prepared.candidateAudits.push(this.candidateProvider.prepareDecision(
      latest.candidate,
      'accepted',
      '候选通过拥有系统预检并成为历史事实',
      context,
      eventId,
    ))
    return this.commitPrepared(preflight)
  }

  rejectCandidate(
    candidateId: string,
    reason: string,
    context: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCandidateAudit {
    return this.closeCandidate(candidateId, 'rejected', reason, context)
  }

  expireCandidate(
    candidateId: string,
    reason: string,
    context: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCandidateAudit {
    return this.closeCandidate(candidateId, 'expired', reason, context)
  }

  private closeCandidate(
    candidateId: string,
    status: 'rejected' | 'expired',
    rawReason: string,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCandidateAudit {
    const context = toValidationContext(rawContext)
    const errors: string[] = []
    this.validateValidationContext(context, errors)
    const reason = nonEmptyText(rawReason)
    if (!reason) errors.push('候选终结原因不能为空')
    const latest = this.getLedgerIndex().latestCandidateById.get(candidateId)
    if (!latest) errors.push(`候选不存在: ${candidateId}`)
    else if (latest.status !== 'available') errors.push(`候选已终结，不能重复处理: ${candidateId}`)
    if (latest) {
      this.validateWriteScope(latest.candidate.scope, 'system', context, errors, 'candidate.scope')
      this.validateNewWriteReferenceLifecycle(
        latest.candidate.participants,
        latest.candidate.locations,
        latest.candidate.scope,
        errors,
        'candidate',
      )
    }
    if (errors.length > 0 || !latest || !reason) throw new Error(errors.join('；'))
    const audit = this.candidateProvider.prepareDecision(
      latest.candidate,
      status,
      reason,
      context,
    )
    useHistoryDynamicsStore.getState().commitAppend({
      batchId: createLedgerId('candidate-decision-batch'),
      events: [],
      transitions: [],
      evidence: [],
      causalEdges: [],
      candidateAudits: [audit],
      migrationMetadata: [],
    })
    return cloneValue(audit)
  }

  preflightCrossContextEdge(
    edge: HistoricalCausalEdgeInput,
    context: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventPreflightResult {
    const from = this.getEvent(edge.fromEventId)
    const to = this.getEvent(edge.toEventId)
    if (!from || !to) return { ok: false, errors: ['跨界因果端点必须先存在'] }
    const contexts = new Set([...from.scope.contextIds, ...to.scope.contextIds])
    if (contexts.size < 2) return { ok: false, errors: ['端点不构成跨上下文关系'] }
    if (edge.scope.kind !== 'cross-context') {
      return { ok: false, errors: ['跨上下文因果边必须声明 cross-context 作用域'] }
    }
    return this.preflightBatch({
      source: { kind: 'system', sourceId: 'cross-context-causal-api' },
      causalEdges: [edge],
    }, context)
  }

  commitCrossContextEdge(
    edge: HistoricalCausalEdgeInput,
    context: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCommitResult {
    return this.commitPrepared(this.preflightCrossContextEdge(edge, context))
  }

  commitCausalCommitment(
    input: HistoricalCausalCommitmentInput,
    rawContext: RoundContext | HistoricalEventValidationContext,
  ): HistoricalEventCommitResult {
    const context = toValidationContext(rawContext)
    const commitmentId = nonEmptyText(input.commitmentId)
    if (!commitmentId) return emptyCommitResult(['commitmentId 不能为空'])
    const eventId = nonEmptyText(input.resultEvent.eventId) ?? createLedgerId('event')
    const source = {
      kind: 'system' as const,
      sourceId: `causal-delay:${commitmentId}`,
      description: '完整叙事提交成功后的延迟因果兑现',
    }
    const sourceEvent = input.sourceEventId ? this.getEvent(input.sourceEventId) : undefined
    if (input.sourceEventId && !sourceEvent) {
      return emptyCommitResult([`延期因果来源事件不存在: ${input.sourceEventId}`])
    }
    const evidence: HistoricalEventEvidenceInput[] = (input.evidence ?? []).map((item) => ({
      ...cloneValue(item),
      evidenceId: nonEmptyText(item.evidenceId) ?? createLedgerId('evidence'),
      eventId,
      sourceId: commitmentId,
    }))
    if (evidence.length === 0) {
      evidence.push({
        evidenceId: createLedgerId('evidence'),
        eventId,
        kind: 'system-commit',
        description: '延迟因果已随完整叙事回合成功提交',
        sourceId: commitmentId,
      })
    }
    const evidenceIds = evidence.map((item) => item.evidenceId as string)
    const transitions: HistoricalEventTransitionInput[] = []
    if (sourceEvent?.status === 'scheduled') {
      transitions.push({
        transitionId: createLedgerId('event-transition'),
        eventId: sourceEvent.eventId,
        toStatus: 'active',
        reason: '延期因果进入兑现提交',
        evidenceIds,
      })
    }
    if (sourceEvent?.status === 'scheduled' || sourceEvent?.status === 'active') {
      transitions.push({
        transitionId: createLedgerId('event-transition'),
        eventId: sourceEvent.eventId,
        toStatus: 'resolved',
        reason: '延期因果已随完整叙事提交兑现',
        evidenceIds,
      })
    }
    const causalEdges: HistoricalCausalEdgeInput[] = input.sourceEventId
      ? [{
          fromEventId: input.sourceEventId,
          toEventId: eventId,
          relation: input.relation ?? 'resolves',
          scope: this.deriveCausalEdgeScope(sourceEvent?.scope, input.resultEvent.scope),
          evidenceIds,
        }]
      : []
    return this.commitBatch({
      source,
      events: [{ ...cloneValue(input.resultEvent), eventId }],
      evidence,
      transitions,
      causalEdges,
    }, context)
  }

  capturePersistenceState(): HistoricalEventLedgerPersistenceState {
    this.ensureCurrentStoreValidated()
    return useHistoryDynamicsStore.getState().getPersistenceState()
  }

  /**
   * Zustand 持久化 Store 的水合顺序不保证 world 先于 history。
   * 若 v1 数据曾在 currentContextId 尚未恢复时临时落成 global，这里在运行注册后
   * 依据该存档已经恢复的当前上下文完成一次迁移期重绑，防止随后创建第二世界时串线。
   */
  hydrateFromStore(): void {
    const contextId = useWorldStore.getState().currentContextId
    const snapshot = normalizeHistoryLedgerPersistenceState(
      useHistoryDynamicsStore.getState().getPersistenceState(),
    )
    let reboundEvents = 0
    let reboundCandidates = 0
    if (contextId) {
      const bindingId = `history-dynamics:v1-context-bound:${contextId}`
      const alreadyBound = snapshot.migrationMetadata.some((item) => item.migrationId === bindingId)
      const hasV1Migration = snapshot.migrationMetadata.some((item) => (
        item.migrationId === 'history-dynamics:v1-to-v2'
        || item.migrationId === 'history-dynamics:legacy-collected-to-v2'
      ))
      if (hasV1Migration && !alreadyBound) {
        for (const event of snapshot.events) {
          if (
            event.scope.kind === 'global'
            && event.scope.contextIds.length === 0
            && event.source.kind === 'migration'
            && (event.source.sourceId === 'event-pool' || event.source.sourceId === 'causal-simulation')
          ) {
            event.scope = { kind: 'context', contextIds: [contextId] }
            reboundEvents += 1
          }
        }
        for (const audit of snapshot.candidateAudits) {
          const candidate = audit.candidate
          if (
            candidate.scope.kind === 'global'
            && candidate.scope.contextIds.length === 0
            && candidate.source.kind === 'migration'
            && candidate.source.sourceId === 'event-pool'
          ) {
            candidate.scope = { kind: 'context', contextIds: [contextId] }
            reboundCandidates += 1
          }
        }
        const reboundEventById = new Map(snapshot.events.map((event) => [event.eventId, event]))
        for (const evidence of snapshot.evidence) {
          if (evidence.kind === 'migration' && evidence.contextId === undefined) {
            const event = reboundEventById.get(evidence.eventId)
            if (event?.source.kind === 'migration' && event.scope.contextIds.includes(contextId)) {
              evidence.contextId = contextId
            }
          }
        }
        if (reboundEvents > 0 || reboundCandidates > 0) {
          snapshot.migrationMetadata.push({
            migrationId: bindingId,
            fromVersion: 1,
            sourceSystemIds: ['event-pool', 'causal-simulation'],
            eventCount: reboundEvents,
            candidateCount: reboundCandidates,
            causalCount: snapshot.events.filter((event) => (
              event.source.kind === 'migration' && event.source.sourceId === 'causal-simulation'
            )).length,
          })
        }
      }
    }
    try {
      // v1 是否需要重绑不影响本门禁：当前 Store 的每一份 v2 数据都必须严格校验。
      this.restorePersistenceState(snapshot)
    } catch (error) {
      const hydrationError = error instanceof Error ? error : new Error(String(error))
      this.validatedStoreState = undefined
      this.hydrationError = hydrationError
      throw hydrationError
    }
  }

  restorePersistenceState(snapshot: unknown): void {
    let restored: HistoricalEventLedgerPersistenceState
    if (snapshot === undefined || snapshot === null) {
      restored = migrateHistoryDynamicsState(
        undefined,
        1,
        useWorldStore.getState().currentContextId ?? undefined,
      )
    } else if (isHistoryLedgerPersistenceState(snapshot)) {
      restored = normalizeHistoryLedgerPersistenceState(snapshot)
    } else if (
      isPlainRecord(snapshot)
      && ('eventPool' in snapshot || 'causalSimulation' in snapshot)
    ) {
      restored = migrateHistoryDynamicsState(
        snapshot,
        1,
        useWorldStore.getState().currentContextId ?? undefined,
      )
    } else {
      throw new Error('历史事件账本持久化快照格式无效')
    }

    const errors = this.validatePersistenceSnapshot(restored)
    if (errors.length > 0) {
      throw new Error(`历史事件账本持久化快照不一致：${errors.join('；')}`)
    }
    useHistoryDynamicsStore.getState().replacePersistenceState(restored)
    this.markCurrentStoreValidated()
  }

  restoreCollectedState(snapshot: unknown): void {
    if (snapshot === undefined || snapshot === null) {
      this.reset()
      return
    }
    if (isHistoryLedgerPersistenceState(snapshot)) this.restorePersistenceState(snapshot)
  }

  importLegacyCollectedStates(states: Record<string, SubSystemState>): boolean {
    const eventPool = states['event-pool']?.data
    const causalSimulation = states['causal-simulation']?.data
    if (eventPool === undefined && causalSimulation === undefined) return false

    const existing = this.getLedgerIndex().state
    if (existing.migrationMetadata.some((item) => item.migrationId === 'history-dynamics:legacy-collected-to-v2')) {
      return true
    }
    const migrated = migrateHistoryDynamicsState(
      { eventPool, causalSimulation },
      1,
      useWorldStore.getState().currentContextId ?? undefined,
    )
    const metadata = migrated.migrationMetadata.map((item) => ({
      ...item,
      migrationId: 'history-dynamics:legacy-collected-to-v2',
      migratedAtTotalDays: undefined,
    }))
    useHistoryDynamicsStore.getState().commitAppend({
      batchId: 'history-dynamics:legacy-collected-to-v2',
      events: migrated.events,
      transitions: migrated.transitions,
      evidence: migrated.evidence,
      causalEdges: migrated.causalEdges,
      candidateAudits: migrated.candidateAudits,
      migrationMetadata: metadata,
    })
    this.markCurrentStoreValidated()
    return true
  }

  commitPrepared(preflight: HistoricalEventPreflightResult): HistoricalEventCommitResult {
    if (!preflight.ok || !preflight.prepared) return emptyCommitResult(preflight.errors)
    useHistoryDynamicsStore.getState().commitAppend(preflight.prepared)
    this.markCurrentStoreValidated()
    return {
      ok: true,
      errors: [],
      batchId: preflight.prepared.batchId,
      eventIds: preflight.prepared.events.map((event) => event.eventId),
      transitionIds: preflight.prepared.transitions.map((item) => item.transitionId),
      evidenceIds: preflight.prepared.evidence.map((item) => item.evidenceId),
      causalEdgeIds: preflight.prepared.causalEdges.map((item) => item.edgeId),
    }
  }

  private validatePersistenceSnapshot(
    snapshot: HistoricalEventLedgerPersistenceState,
  ): string[] {
    const errors: string[] = []
    const worldState = useWorldStore.getState()
    if (snapshot.schemaVersion !== 2) errors.push('schemaVersion 必须为 2')
    const hasPersistedFacts = snapshot.events.length > 0
      || snapshot.transitions.length > 0
      || snapshot.evidence.length > 0
      || snapshot.causalEdges.length > 0
      || snapshot.candidateAudits.length > 0
      || snapshot.migrationMetadata.length > 0
    if (worldState.currentContextId) {
      this.validateContextId(worldState.currentContextId, errors, 'world.currentContextId')
      const current = worldState.contexts[worldState.currentContextId]
      if (current && (current.scope.scope !== 'active' || current.record.lifecycle !== 'open')) {
        errors.push('世界当前上下文必须处于 active/open 状态')
      }
    } else if (hasPersistedFacts) {
      errors.push('世界当前上下文缺失，不能恢复非空历史事件账本')
    }

    const eventIds = new Set<string>()
    const eventMap = new Map<string, HistoricalEventRecord>()
    const statusMap = new Map<string, HistoricalEventStatus>()
    for (const [index, event] of snapshot.events.entries()) {
      const path = `events[${index}]`
      if (!isPlainRecord(event)) {
        errors.push(`${path} 必须是对象`)
        continue
      }
      if (!nonEmptyText(event.eventId)) errors.push(`${path}.eventId 不能为空`)
      if (eventIds.has(event.eventId)) errors.push(`${path}.eventId 重复: ${event.eventId}`)
      if (!nonEmptyText(event.eventType)) errors.push(`${path}.eventType 不能为空`)
      if (!nonEmptyText(event.title)) errors.push(`${path}.title 不能为空`)
      if (!nonEmptyText(event.description)) errors.push(`${path}.description 不能为空`)
      if (!EVENT_STATUS_SET.has(String(event.initialStatus))) errors.push(`${path}.initialStatus 无效`)
      this.validateScope(event.scope, errors, `${path}.scope`)
      this.validateReferences(
        event.participants,
        event.locations,
        errors,
        path,
        event.scope,
        { mode: 'restore' },
      )
      this.validateSchedule(event.schedule, errors, `${path}.schedule`)
      this.validateSource(event.source, errors, `${path}.source`)
      this.validateStringArray(event.tags, errors, `${path}.tags`)
      if (!isPlainRecord(event.metadata)) errors.push(`${path}.metadata 必须是对象`)
      if (!Number.isInteger(event.createdRoundSequence) || event.createdRoundSequence < 0) {
        errors.push(`${path}.createdRoundSequence 必须是非负整数`)
      }
      if (!Number.isFinite(event.createdTotalDays) || event.createdTotalDays < 0) {
        errors.push(`${path}.createdTotalDays 必须是非负规范时间`)
      }
      if (nonEmptyText(event.eventId)) {
        eventIds.add(event.eventId)
        eventMap.set(event.eventId, event as unknown as HistoricalEventRecord)
        if (EVENT_STATUS_SET.has(String(event.initialStatus))) {
          statusMap.set(event.eventId, event.initialStatus as HistoricalEventStatus)
        }
      }
    }

    const evidenceIds = new Set<string>()
    for (const [index, item] of snapshot.evidence.entries()) {
      const path = `evidence[${index}]`
      if (!isPlainRecord(item)) {
        errors.push(`${path} 必须是对象`)
        continue
      }
      if (!nonEmptyText(item.evidenceId)) errors.push(`${path}.evidenceId 不能为空`)
      if (evidenceIds.has(item.evidenceId)) errors.push(`${path}.evidenceId 重复: ${item.evidenceId}`)
      if (!eventIds.has(item.eventId)) errors.push(`${path}.eventId 不存在: ${String(item.eventId)}`)
      if (!EVIDENCE_KIND_SET.has(String(item.kind))) errors.push(`${path}.kind 无效`)
      if (!nonEmptyText(item.description)) errors.push(`${path}.description 不能为空`)
      if (!nonEmptyText(item.sourceId)) errors.push(`${path}.sourceId 不能为空`)
      if (item.contextId !== undefined) this.validateContextId(item.contextId, errors, `${path}.contextId`)
      const evidenceEvent = eventMap.get(item.eventId)
      if (evidenceEvent) {
        this.validateEvidenceScope(
          item as unknown as HistoricalEventEvidence,
          evidenceEvent,
          errors,
          path,
        )
      }
      if (!Number.isInteger(item.roundSequence) || item.roundSequence < 0) {
        errors.push(`${path}.roundSequence 必须是非负整数`)
      }
      if (!Number.isFinite(item.totalDays) || item.totalDays < 0) {
        errors.push(`${path}.totalDays 必须是非负规范时间`)
      }
      if (nonEmptyText(item.evidenceId)) evidenceIds.add(item.evidenceId)
    }

    const transitionIds = new Set<string>()
    for (const [index, transition] of snapshot.transitions.entries()) {
      const path = `transitions[${index}]`
      if (!isPlainRecord(transition)) {
        errors.push(`${path} 必须是对象`)
        continue
      }
      if (!nonEmptyText(transition.transitionId)) errors.push(`${path}.transitionId 不能为空`)
      if (transitionIds.has(transition.transitionId)) {
        errors.push(`${path}.transitionId 重复: ${transition.transitionId}`)
      }
      const current = statusMap.get(transition.eventId)
      if (!current) errors.push(`${path}.eventId 不存在: ${String(transition.eventId)}`)
      if (!EVENT_STATUS_SET.has(String(transition.fromStatus))) errors.push(`${path}.fromStatus 无效`)
      if (current && transition.fromStatus !== current) {
        errors.push(`${path}.fromStatus 与前一状态不一致: ${String(transition.fromStatus)} != ${current}`)
      }
      if (!EVENT_STATUS_SET.has(String(transition.toStatus))) errors.push(`${path}.toStatus 无效`)
      if (
        current
        && EVENT_STATUS_SET.has(String(transition.toStatus))
        && !HISTORICAL_EVENT_TRANSITIONS[current].includes(transition.toStatus as HistoricalEventStatus)
      ) {
        errors.push(`${path} 非法状态迁移: ${current} -> ${String(transition.toStatus)}`)
      }
      if (!nonEmptyText(transition.reason)) errors.push(`${path}.reason 不能为空`)
      if (!Array.isArray(transition.evidenceIds)) {
        errors.push(`${path}.evidenceIds 必须是数组`)
      } else {
        if (new Set(transition.evidenceIds).size !== transition.evidenceIds.length) {
          errors.push(`${path}.evidenceIds 不能重复`)
        }
        for (const evidenceId of transition.evidenceIds) {
          if (!nonEmptyText(evidenceId)) errors.push(`${path}.evidenceIds 必须是非空字符串数组`)
          if (!evidenceIds.has(evidenceId)) errors.push(`${path}.evidenceId 不存在: ${String(evidenceId)}`)
        }
      }
      this.validateSource(transition.source, errors, `${path}.source`)
      if (!Number.isInteger(transition.roundSequence) || transition.roundSequence < 0) {
        errors.push(`${path}.roundSequence 必须是非负整数`)
      }
      if (!Number.isFinite(transition.totalDays) || transition.totalDays < 0) {
        errors.push(`${path}.totalDays 必须是非负规范时间`)
      }
      if (nonEmptyText(transition.transitionId)) transitionIds.add(transition.transitionId)
      if (current && EVENT_STATUS_SET.has(String(transition.toStatus))) {
        statusMap.set(transition.eventId, transition.toStatus as HistoricalEventStatus)
      }
    }

    const edgeIds = new Set<string>()
    for (const [index, edge] of snapshot.causalEdges.entries()) {
      const path = `causalEdges[${index}]`
      if (!isPlainRecord(edge)) {
        errors.push(`${path} 必须是对象`)
        continue
      }
      if (!nonEmptyText(edge.edgeId)) errors.push(`${path}.edgeId 不能为空`)
      if (edgeIds.has(edge.edgeId)) errors.push(`${path}.edgeId 重复: ${edge.edgeId}`)
      if (!nonEmptyText(edge.fromEventId)) errors.push(`${path}.fromEventId 不能为空`)
      if (!nonEmptyText(edge.toEventId)) errors.push(`${path}.toEventId 不能为空`)
      if (!CAUSAL_RELATION_SET.has(String(edge.relation))) errors.push(`${path}.relation 无效`)
      this.validateScope(edge.scope, errors, `${path}.scope`)
      if (!Array.isArray(edge.evidenceIds)) {
        errors.push(`${path}.evidenceIds 必须是数组`)
      } else {
        if (new Set(edge.evidenceIds).size !== edge.evidenceIds.length) {
          errors.push(`${path}.evidenceIds 不能重复`)
        }
        for (const evidenceId of edge.evidenceIds) {
          if (!nonEmptyText(evidenceId)) errors.push(`${path}.evidenceIds 必须是非空字符串数组`)
          if (!evidenceIds.has(evidenceId)) errors.push(`${path}.evidenceId 不存在: ${String(evidenceId)}`)
        }
      }
      this.validateSource(edge.source, errors, `${path}.source`)
      if (!Number.isInteger(edge.createdRoundSequence) || edge.createdRoundSequence < 0) {
        errors.push(`${path}.createdRoundSequence 必须是非负整数`)
      }
      if (!Number.isFinite(edge.createdTotalDays) || edge.createdTotalDays < 0) {
        errors.push(`${path}.createdTotalDays 必须是非负规范时间`)
      }
      const graphResult = this.causalGraph.validateEdge(
        edge as unknown as HistoricalCausalEdgeInput,
        eventMap,
      )
      errors.push(...graphResult.errors.map((error) => `${path}: ${error}`))
      if (nonEmptyText(edge.edgeId)) edgeIds.add(edge.edgeId)
    }

    const auditIds = new Set<string>()
    const candidateStatus = new Map<string, string>()
    const candidateFingerprint = new Map<string, string>()
    for (const [index, audit] of snapshot.candidateAudits.entries()) {
      const path = `candidateAudits[${index}]`
      if (!isPlainRecord(audit)) {
        errors.push(`${path} 必须是对象`)
        continue
      }
      if (!nonEmptyText(audit.auditId)) errors.push(`${path}.auditId 不能为空`)
      if (!nonEmptyText(audit.candidateId)) errors.push(`${path}.candidateId 不能为空`)
      if (auditIds.has(audit.auditId)) errors.push(`${path}.auditId 重复: ${audit.auditId}`)
      if (!CANDIDATE_STATUS_SET.has(String(audit.status))) errors.push(`${path}.status 无效`)
      if (!isPlainRecord(audit.candidate)) {
        errors.push(`${path}.candidate 必须是对象`)
      } else {
        this.validateCandidate(
          audit.candidate as unknown as HistoricalEventCandidate,
          errors,
          `${path}.candidate`,
          { mode: 'restore' },
        )
        if (audit.candidateId !== audit.candidate.candidateId) {
          errors.push(`${path}.candidateId 与 candidate.candidateId 不一致`)
        }
        this.validateSource(audit.candidate.source, errors, `${path}.candidate.source`)
      }
      if (!nonEmptyText(audit.reason)) errors.push(`${path}.reason 不能为空`)
      if (!Number.isInteger(audit.roundSequence) || audit.roundSequence < 0) {
        errors.push(`${path}.roundSequence 必须是非负整数`)
      }
      if (!Number.isFinite(audit.totalDays) || audit.totalDays < 0) {
        errors.push(`${path}.totalDays 必须是非负规范时间`)
      }
      const promotedEventId = nonEmptyText(audit.promotedEventId)
      if (audit.status === 'accepted' && (!promotedEventId || !eventIds.has(promotedEventId))) {
        errors.push(`${path}.promotedEventId 必须指向已接受事件`)
      }
      if (audit.status !== 'accepted' && audit.promotedEventId !== undefined) {
        errors.push(`${path}.promotedEventId 只能用于 accepted 审计`)
      }
      const previousStatus = candidateStatus.get(String(audit.candidateId))
      if (isPlainRecord(audit.candidate) && nonEmptyText(audit.candidateId)) {
        const fingerprint = this.candidateCoreFingerprint(
          audit.candidate as unknown as HistoricalEventCandidate,
        )
        const previousFingerprint = candidateFingerprint.get(audit.candidateId)
        if (previousFingerprint !== undefined && previousFingerprint !== fingerprint) {
          errors.push(`${path} 与同一候选的既有核心快照或来源不一致`)
        }
        candidateFingerprint.set(audit.candidateId, fingerprint)
      }
      if (!previousStatus) {
        if (
          audit.status !== 'available'
          && !(
            audit.status === 'expired'
            && isPlainRecord(audit.candidate)
            && isPlainRecord(audit.candidate.source)
            && audit.candidate.source.kind === 'migration'
          )
        ) {
          errors.push(`${path} 首条候选审计必须为 available；仅迁移候选可直接 expired`)
        }
      } else if (previousStatus !== 'available') {
        errors.push(`${path} 候选已处于终结状态，不能继续追加 ${String(audit.status)}`)
      }
      if (nonEmptyText(audit.candidateId)) {
        candidateStatus.set(audit.candidateId, String(audit.status))
      }
      if (nonEmptyText(audit.auditId)) auditIds.add(audit.auditId)
    }

    const migrationIds = new Set<string>()
    for (const [index, metadata] of snapshot.migrationMetadata.entries()) {
      const path = `migrationMetadata[${index}]`
      if (!isPlainRecord(metadata)) {
        errors.push(`${path} 必须是对象`)
        continue
      }
      if (!nonEmptyText(metadata.migrationId)) errors.push(`${path}.migrationId 不能为空`)
      if (migrationIds.has(metadata.migrationId)) {
        errors.push(`${path}.migrationId 重复: ${metadata.migrationId}`)
      }
      if (!Number.isInteger(metadata.fromVersion) || metadata.fromVersion < 0) {
        errors.push(`${path}.fromVersion 必须是非负整数`)
      }
      if (
        !Array.isArray(metadata.sourceSystemIds)
        || metadata.sourceSystemIds.length === 0
        || metadata.sourceSystemIds.some((item) => !nonEmptyText(item))
      ) {
        errors.push(`${path}.sourceSystemIds 必须是非空字符串数组`)
      } else if (new Set(metadata.sourceSystemIds).size !== metadata.sourceSystemIds.length) {
        errors.push(`${path}.sourceSystemIds 不能重复`)
      }
      for (const field of ['eventCount', 'candidateCount', 'causalCount'] as const) {
        if (!Number.isInteger(metadata[field]) || metadata[field] < 0) {
          errors.push(`${path}.${field} 必须是非负整数`)
        }
      }
      if (
        metadata.migratedAtTotalDays !== undefined
        && (!Number.isFinite(metadata.migratedAtTotalDays) || metadata.migratedAtTotalDays < 0)
      ) {
        errors.push(`${path}.migratedAtTotalDays 必须是非负规范时间`)
      }
      if (nonEmptyText(metadata.migrationId)) migrationIds.add(metadata.migrationId)
    }

    return errors
  }

  private validateSource(source: unknown, errors: string[], path: string): void {
    if (!isPlainRecord(source)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (!SOURCE_KIND_SET.has(String(source.kind))) errors.push(`${path}.kind 无效`)
    if (!nonEmptyText(source.sourceId)) errors.push(`${path}.sourceId 不能为空`)
    if (source.description !== undefined && !nonEmptyText(source.description)) {
      errors.push(`${path}.description 必须是非空字符串`)
    }
  }

  private prepareEvent(
    input: HistoricalEventCreateInput,
    source: HistoricalEventCommitBatch['source'],
    context: TrustedHistoricalEventValidationContext,
    errors: string[],
    path: string,
  ): HistoricalEventRecord | undefined {
    const eventId = nonEmptyText(input.eventId) ?? createLedgerId('event')
    const eventType = nonEmptyText(input.eventType)
    const title = nonEmptyText(input.title)
    const description = nonEmptyText(input.description)
    if (!eventType) errors.push(`${path}.eventType 不能为空`)
    if (!title) errors.push(`${path}.title 不能为空`)
    if (!description) errors.push(`${path}.description 不能为空`)
    if (!EVENT_STATUS_SET.has(String(input.status))) errors.push(`${path}.status 无效`)
    this.validateScope(input.scope, errors, `${path}.scope`)
    this.validateReferences(
      input.participants ?? [],
      input.locations ?? [],
      errors,
      path,
      input.scope,
      { mode: 'new-write', validationContext: context },
    )
    this.validateWriteScope(input.scope, source.kind, context, errors, `${path}.scope`)
    this.validateSchedule(input.schedule, errors, `${path}.schedule`)
    this.validateStringArray(input.tags ?? [], errors, `${path}.tags`)
    if (!isPlainRecord(input.metadata ?? {})) errors.push(`${path}.metadata 必须是对象`)
    if (!eventType || !title || !description || !EVENT_STATUS_SET.has(String(input.status))) {
      return undefined
    }
    return {
      eventId,
      eventType,
      title,
      description,
      scope: cloneValue(input.scope),
      initialStatus: input.status,
      participants: cloneValue(input.participants ?? []),
      locations: cloneValue(input.locations ?? []),
      schedule: input.schedule ? cloneValue(input.schedule) : undefined,
      tags: cloneValue(input.tags ?? []),
      source: cloneValue(source),
      createdRoundSequence: context.roundSequence,
      createdTotalDays: context.totalDays,
      metadata: cloneValue(input.metadata ?? {}),
    }
  }

  private prepareEvidence(
    input: HistoricalEventEvidenceInput,
    context: TrustedHistoricalEventValidationContext,
    errors: string[],
    path: string,
  ): HistoricalEventEvidence | undefined {
    if (!isPlainRecord(input)) {
      errors.push(`${path} 必须是对象`)
      return undefined
    }
    const eventId = nonEmptyText(input.eventId)
    const description = nonEmptyText(input.description)
    const sourceId = nonEmptyText(input.sourceId)
    const contextId = input.contextId === undefined ? undefined : nonEmptyText(input.contextId)
    if (!eventId) errors.push(`${path}.eventId 不能为空`)
    if (!description) errors.push(`${path}.description 不能为空`)
    if (!sourceId) errors.push(`${path}.sourceId 不能为空`)
    if (!EVIDENCE_KIND_SET.has(String(input.kind))) errors.push(`${path}.kind 无效`)
    if (input.contextId !== undefined) {
      if (!contextId) errors.push(`${path}.contextId 必须是非空字符串`)
      else this.validateContextId(contextId, errors, `${path}.contextId`)
    }
    if (!eventId || !description || !sourceId || !EVIDENCE_KIND_SET.has(String(input.kind))) {
      return undefined
    }
    return {
      evidenceId: nonEmptyText(input.evidenceId) ?? createLedgerId('evidence'),
      eventId,
      kind: input.kind,
      description,
      sourceId,
      contextId,
      roundSequence: context.roundSequence,
      totalDays: context.totalDays,
      payload: input.payload === undefined ? undefined : cloneValue(input.payload),
    }
  }

  private prepareTransition(
    input: HistoricalEventTransitionInput,
    source: HistoricalEventCommitBatch['source'],
    context: TrustedHistoricalEventValidationContext,
    statuses: ReadonlyMap<string, HistoricalEventStatus>,
    evidenceIds: ReadonlySet<string>,
    errors: string[],
    path: string,
  ): HistoricalEventTransition | undefined {
    if (!isPlainRecord(input)) {
      errors.push(`${path} 必须是对象`)
      return undefined
    }
    const eventId = nonEmptyText(input.eventId)
    const reason = nonEmptyText(input.reason)
    const current = eventId ? statuses.get(eventId) : undefined
    if (!eventId) errors.push(`${path}.eventId 不能为空`)
    if (!reason) errors.push(`${path}.reason 不能为空`)
    if (!current) errors.push(`${path} 引用的事件不存在: ${String(input.eventId)}`)
    if (!EVENT_STATUS_SET.has(String(input.toStatus))) errors.push(`${path}.toStatus 无效`)
    if (current && EVENT_STATUS_SET.has(String(input.toStatus))) {
      if (!HISTORICAL_EVENT_TRANSITIONS[current].includes(input.toStatus)) {
        errors.push(`${path} 非法状态迁移: ${current} -> ${input.toStatus}`)
      }
    }
    const rawEvidenceIds = input.evidenceIds ?? []
    this.validateStringArray(rawEvidenceIds, errors, `${path}.evidenceIds`)
    const normalizedEvidenceIds = Array.isArray(rawEvidenceIds) ? rawEvidenceIds : []
    for (const evidenceId of normalizedEvidenceIds) {
      if (!evidenceIds.has(evidenceId)) errors.push(`${path} 引用的证据不存在: ${evidenceId}`)
    }
    if (!eventId || !reason || !current || !EVENT_STATUS_SET.has(String(input.toStatus))) {
      return undefined
    }
    return {
      transitionId: nonEmptyText(input.transitionId) ?? createLedgerId('event-transition'),
      eventId,
      fromStatus: current,
      toStatus: input.toStatus,
      reason,
      evidenceIds: cloneValue(normalizedEvidenceIds),
      source: cloneValue(source),
      roundSequence: context.roundSequence,
      totalDays: context.totalDays,
    }
  }

  private validateValidationContext(
    context: TrustedHistoricalEventValidationContext,
    errors: string[],
  ): void {
    this.validateContextId(context.contextId, errors, 'validationContext.contextId')
    const worldState = useWorldStore.getState()
    const instance = worldState.contexts[context.contextId]
    if (instance) {
      if (worldState.currentContextId !== context.contextId) {
        errors.push('validationContext.contextId 必须是当前活动上下文')
      }
      if (instance.scope.scope !== 'active' || instance.record.lifecycle !== 'open') {
        errors.push('validationContext.contextId 必须处于 active/open 状态')
      }
    }
    if (context.reportedCharacterId !== undefined) {
      errors.push('显式 validation context 不得自报 characterId；角色身份只能来自 RoundContext')
    }
    if (context.origin === 'round-context') {
      const characterId = nonEmptyText(context.trustedCharacterId)
      if (!characterId) {
        errors.push('RoundContext.characterId 不能为空')
      } else if (useCharacterStore.getState().characterId !== characterId) {
        errors.push(`RoundContext.characterId 与当前角色稳定 ID 不一致: ${characterId}`)
      }
    }
    if (!Number.isInteger(context.roundSequence) || context.roundSequence < 0) {
      errors.push('validationContext.roundSequence 必须是非负整数')
    }
    if (!Number.isFinite(context.totalDays) || context.totalDays < 0) {
      errors.push('validationContext.totalDays 必须是非负规范时间')
    }
    if (
      context.legacyYear !== undefined
      && (!Number.isFinite(context.legacyYear) || context.legacyYear < 0)
    ) {
      errors.push('validationContext.legacyYear 必须是非负纪年')
    }
  }

  private validateContextId(contextId: unknown, errors: string[], path: string): void {
    const id = nonEmptyText(contextId)
    if (!id) {
      errors.push(`${path} 不能为空`)
      return
    }
    if (!useWorldStore.getState().contexts[id]) errors.push(`${path} 不存在: ${id}`)
  }

  private validateScope(scope: unknown, errors: string[], path: string): void {
    if (!isPlainRecord(scope)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (!SCOPE_KIND_SET.has(String(scope.kind))) errors.push(`${path}.kind 无效`)
    if (!Array.isArray(scope.contextIds)) {
      errors.push(`${path}.contextIds 必须是数组`)
      return
    }
    const ids = scope.contextIds.filter((item): item is string => typeof item === 'string')
    if (ids.length !== scope.contextIds.length) errors.push(`${path}.contextIds 必须全部是字符串`)
    if (ids.some((id) => !nonEmptyText(id))) errors.push(`${path}.contextIds 不能包含空字符串`)
    if (new Set(ids).size !== ids.length) errors.push(`${path}.contextIds 不能重复`)
    if (scope.kind === 'global' && ids.length !== 0) errors.push(`${path} 的 global 作用域不能列出上下文`)
    if (scope.kind === 'context' && ids.length !== 1) errors.push(`${path} 的 context 作用域必须正好一个上下文`)
    if (scope.kind === 'travel' && ids.length < 2) errors.push(`${path} 的 travel 作用域必须至少两个上下文`)
    if (scope.kind === 'cross-context' && ids.length < 2) errors.push(`${path} 的 cross-context 作用域必须至少两个上下文`)
    for (const id of ids) this.validateContextId(id, errors, `${path}.contextIds`)
  }

  private validateWriteScope(
    scope: unknown,
    sourceKind: unknown,
    context: TrustedHistoricalEventValidationContext,
    errors: string[],
    path: string,
  ): void {
    if (!isPlainRecord(scope) || sourceKind === 'migration' || scope.kind === 'global') return
    const ids = Array.isArray(scope.contextIds)
      ? scope.contextIds.filter((item): item is string => typeof item === 'string')
      : []
    if (!ids.includes(context.contextId)) {
      errors.push(`${path} 必须包含当前活动上下文 ${context.contextId}`)
    }
    for (const contextId of ids) {
      const instance = useWorldStore.getState().contexts[contextId]
      if (instance?.scope.scope === 'closed' || instance?.record.lifecycle === 'closed') {
        errors.push(`${path} 不得向关闭上下文写入新事实: ${contextId}`)
      }
    }
  }

  private validateEventWriteTarget(
    event: HistoricalEventRecord,
    sourceKind: unknown,
    context: TrustedHistoricalEventValidationContext,
    errors: string[],
    path: string,
  ): void {
    this.validateWriteScope(event.scope, sourceKind, context, errors, `${path}.eventScope`)
  }

  private validateEvidenceScope(
    evidence: HistoricalEventEvidence,
    event: HistoricalEventRecord,
    errors: string[],
    path: string,
  ): void {
    if (
      evidence.contextId
      && event.scope.kind !== 'global'
      && !event.scope.contextIds.includes(evidence.contextId)
    ) {
      errors.push(`${path}.contextId 不在引用事件作用域内: ${evidence.contextId}`)
    }
  }

  private validateEvidenceWriteContext(
    evidence: HistoricalEventEvidence,
    event: HistoricalEventRecord,
    sourceKind: unknown,
    errors: string[],
    path: string,
  ): void {
    if (sourceKind === 'migration' || !evidence.contextId || event.scope.kind !== 'global') return
    this.validateGlobalReferencedContext(evidence.contextId, errors, `${path}.contextId`)
  }

  private validateReferences(
    participants: unknown,
    locations: unknown,
    errors: string[],
    path: string,
    scope: unknown,
    options: {
      mode: 'restore' | 'new-write'
      validationContext?: TrustedHistoricalEventValidationContext
    },
  ): void {
    const referencedContextIds = new Set<string>()
    if (!Array.isArray(participants)) {
      errors.push(`${path}.participants 必须是数组`)
    } else {
      for (const [index, participant] of participants.entries()) {
        if (!isPlainRecord(participant)) {
          errors.push(`${path}.participants[${index}] 必须是对象`)
          continue
        }
        const entityId = nonEmptyText(participant.entityId)
        const label = nonEmptyText(participant.label)
        if (participant.entityId !== undefined && !entityId) {
          errors.push(`${path}.participants[${index}].entityId 必须是非空字符串`)
        }
        if (participant.label !== undefined && !label) {
          errors.push(`${path}.participants[${index}].label 必须是非空字符串`)
        }
        if (!entityId && !label) errors.push(`${path}.participants[${index}] 必须提供 entityId 或 label`)
        if (entityId && options.mode === 'new-write' && !participant.contextId) {
          for (const entityContextId of this.entityContextIds(entityId)) {
            referencedContextIds.add(entityContextId)
          }
        }
        if (participant.contextId !== undefined) {
          const participantContextId = nonEmptyText(participant.contextId)
          if (!participantContextId) {
            errors.push(`${path}.participants[${index}].contextId 必须是非空字符串`)
          } else {
            this.validateContextId(participantContextId, errors, `${path}.participants[${index}].contextId`)
            referencedContextIds.add(participantContextId)
          }
        }
        if (participant.role !== undefined && !nonEmptyText(participant.role)) {
          errors.push(`${path}.participants[${index}].role 必须是非空字符串`)
        }
      }
    }
    if (!Array.isArray(locations)) {
      errors.push(`${path}.locations 必须是数组`)
    } else {
      const worlds = useWorldStore.getState().contexts
      for (const [index, location] of locations.entries()) {
        if (!isPlainRecord(location)) {
          errors.push(`${path}.locations[${index}] 必须是对象`)
          continue
        }
        const nodeId = nonEmptyText(location.nodeId)
        const label = nonEmptyText(location.label)
        const contextId = nonEmptyText(location.contextId)
        if (location.nodeId !== undefined && !nodeId) {
          errors.push(`${path}.locations[${index}].nodeId 必须是非空字符串`)
        }
        if (location.label !== undefined && !label) {
          errors.push(`${path}.locations[${index}].label 必须是非空字符串`)
        }
        if (location.contextId !== undefined && !contextId) {
          errors.push(`${path}.locations[${index}].contextId 必须是非空字符串`)
        }
        if (!nodeId && !label) errors.push(`${path}.locations[${index}] 必须提供 nodeId 或 label`)
        if (contextId) this.validateContextId(contextId, errors, `${path}.locations[${index}].contextId`)
        if (contextId) referencedContextIds.add(contextId)
        if (nodeId && !contextId) {
          errors.push(`${path}.locations[${index}] 使用 nodeId 时必须同时提供 contextId`)
        } else if (nodeId && contextId && !worlds[contextId]?.spatialGraph.nodes[nodeId]) {
          errors.push(`${path}.locations[${index}] 的空间节点不存在: ${nodeId}`)
        }
        if (location.role !== undefined && !nonEmptyText(location.role)) {
          errors.push(`${path}.locations[${index}].role 必须是非空字符串`)
        }
      }
    }

    if (isPlainRecord(scope) && scope.kind !== 'global' && Array.isArray(scope.contextIds)) {
      const scopeContextIds = new Set(
        scope.contextIds.filter((item): item is string => typeof item === 'string'),
      )
      for (const referencedContextId of referencedContextIds) {
        if (!scopeContextIds.has(referencedContextId)) {
          errors.push(`${path}.scope 未覆盖引用上下文: ${referencedContextId}`)
        }
      }
    }
    if (options.mode === 'new-write') {
      this.validateNewWriteReferenceLifecycle(participants, locations, scope, errors, path)
    }
  }

  private validateNewWriteReferenceLifecycle(
    participants: unknown,
    locations: unknown,
    scope: unknown,
    errors: string[],
    path: string,
  ): void {
    if (!isPlainRecord(scope) || scope.kind !== 'global') return
    const referencedContextIds = new Set<string>()
    if (Array.isArray(participants)) {
      for (const participant of participants) {
        if (!isPlainRecord(participant)) continue
        const contextId = nonEmptyText(participant.contextId)
        if (contextId) referencedContextIds.add(contextId)
        const entityId = nonEmptyText(participant.entityId)
        if (entityId) {
          for (const entityContextId of this.entityContextIds(entityId)) {
            referencedContextIds.add(entityContextId)
          }
        }
      }
    }
    if (Array.isArray(locations)) {
      for (const location of locations) {
        if (!isPlainRecord(location)) continue
        const contextId = nonEmptyText(location.contextId)
        if (contextId) referencedContextIds.add(contextId)
      }
    }
    for (const contextId of referencedContextIds) {
      this.validateGlobalReferencedContext(contextId, errors, `${path}.scope`)
    }
  }

  private validateGlobalReferencedContext(
    contextId: string,
    errors: string[],
    path: string,
  ): void {
    const instance = useWorldStore.getState().contexts[contextId]
    if (
      instance
      && (
        instance.scope.scope === 'dormant'
        || instance.scope.scope === 'closed'
        || instance.record.lifecycle === 'dormant'
        || instance.record.lifecycle === 'closed'
      )
    ) {
      errors.push(`${path} 的 global 新写入不得引用休眠或关闭上下文: ${contextId}`)
    }
  }

  private validateStringArray(value: unknown, errors: string[], path: string): void {
    if (!Array.isArray(value) || value.some((item) => !nonEmptyText(item))) {
      errors.push(`${path} 必须是非空字符串组成的数组`)
      return
    }
    if (new Set(value).size !== value.length) errors.push(`${path} 不能重复`)
  }

  private validateSchedule(schedule: unknown, errors: string[], path: string): void {
    if (schedule === undefined) return
    if (!isPlainRecord(schedule)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    const numeric = ['dueTotalDays', 'legacyYear']
    for (const field of numeric) {
      const value = schedule[field]
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        errors.push(`${path}.${field} 必须是非负数`)
      }
    }
    const dueRoundSequence = schedule.dueRoundSequence
    if (
      dueRoundSequence !== undefined
      && (typeof dueRoundSequence !== 'number' || !Number.isInteger(dueRoundSequence) || dueRoundSequence < 0)
    ) {
      errors.push(`${path}.dueRoundSequence 必须是非负整数`)
    }
    if (schedule.conditionLabel !== undefined && !nonEmptyText(schedule.conditionLabel)) {
      errors.push(`${path}.conditionLabel 必须是非空字符串`)
    }
    if (
      schedule.dueTotalDays === undefined
      && schedule.dueRoundSequence === undefined
      && !nonEmptyText(schedule.conditionLabel)
      && schedule.legacyYear === undefined
    ) {
      errors.push(`${path} 至少要有一个调度条件`)
    }
  }

  private validateCandidate(
    candidate: HistoricalEventCandidate,
    errors: string[],
    path: string,
    options: {
      mode: 'restore' | 'new-write'
      validationContext?: TrustedHistoricalEventValidationContext
    },
  ): void {
    if (!nonEmptyText(candidate.candidateId)) errors.push(`${path}.candidateId 不能为空`)
    if (!nonEmptyText(candidate.eventType)) errors.push(`${path}.eventType 不能为空`)
    if (!nonEmptyText(candidate.title)) errors.push(`${path}.title 不能为空`)
    if (!nonEmptyText(candidate.description)) errors.push(`${path}.description 不能为空`)
    this.validateScope(candidate.scope, errors, `${path}.scope`)
    this.validateReferences(
      candidate.participants,
      candidate.locations,
      errors,
      path,
      candidate.scope,
      options,
    )
    this.validateCandidateCapabilities(candidate, errors, path, options.mode)
    this.validateStringArray(candidate.tags, errors, `${path}.tags`)
    this.validateSource(candidate.source, errors, `${path}.source`)
    if (!isPlainRecord(candidate.metadata)) errors.push(`${path}.metadata 必须是对象`)
    if (candidate.triggerConditionLabel !== undefined && !nonEmptyText(candidate.triggerConditionLabel)) {
      errors.push(`${path}.triggerConditionLabel 必须是非空字符串`)
    }
    if (options.mode === 'new-write' && options.validationContext) {
      this.validateWriteScope(
        candidate.scope,
        candidate.source.kind,
        options.validationContext,
        errors,
        `${path}.scope`,
      )
    }
    this.validateSchedule(candidate.schedule, errors, `${path}.schedule`)
  }

  private validateCandidateCapabilities(
    candidate: HistoricalEventCandidate,
    errors: string[],
    path: string,
    mode: 'restore' | 'new-write',
  ): void {
    if (!Array.isArray(candidate.requiredCapabilities)) {
      errors.push(`${path}.requiredCapabilities 必须是能力数组`)
      return
    }
    const capabilities = candidate.requiredCapabilities
    for (const capability of capabilities) {
      if (!CAPABILITY_SET.has(capability)) {
        errors.push(`${path}.requiredCapabilities 包含未知能力: ${String(capability)}`)
      }
    }
    if (new Set(capabilities).size !== capabilities.length) {
      errors.push(`${path}.requiredCapabilities 不能重复`)
    }
    if (capabilities.join('\u0000') !== [...capabilities].sort().join('\u0000')) {
      errors.push(`${path}.requiredCapabilities 必须按稳定顺序保存`)
    }
    if (isPlainRecord(candidate.scope) && candidate.scope.kind === 'global' && capabilities.length > 0) {
      errors.push(`${path}.requiredCapabilities 对 global 候选必须为空`)
    }
    if (mode !== 'new-write' || capabilities.length === 0) return
    if (!isPlainRecord(candidate.scope) || !Array.isArray(candidate.scope.contextIds)) return
    const worldState = useWorldStore.getState()
    for (const contextId of candidate.scope.contextIds) {
      if (typeof contextId !== 'string') continue
      const available = new Set(worldState.contexts[contextId]?.capabilityProfile?.capabilities ?? [])
      for (const capability of capabilities) {
        if (!available.has(capability)) {
          errors.push(`${path} 的上下文 ${contextId} 缺少候选所需能力: ${capability}`)
        }
      }
    }
  }

  private candidateCoreFingerprint(candidate: HistoricalEventCandidate): string {
    return JSON.stringify({
      candidateId: candidate.candidateId,
      eventType: candidate.eventType,
      title: candidate.title,
      description: candidate.description,
      scope: isPlainRecord(candidate.scope) ? {
        kind: candidate.scope.kind,
        contextIds: candidate.scope.contextIds,
      } : candidate.scope,
      participants: Array.isArray(candidate.participants)
        ? candidate.participants.map((participant) => isPlainRecord(participant) ? ({
            entityId: participant.entityId,
            label: participant.label,
            contextId: participant.contextId,
            role: participant.role,
          }) : participant)
        : candidate.participants,
      locations: Array.isArray(candidate.locations)
        ? candidate.locations.map((location) => isPlainRecord(location) ? ({
            nodeId: location.nodeId,
            label: location.label,
            contextId: location.contextId,
            role: location.role,
          }) : location)
        : candidate.locations,
      schedule: isPlainRecord(candidate.schedule) ? {
        dueTotalDays: candidate.schedule.dueTotalDays,
        dueRoundSequence: candidate.schedule.dueRoundSequence,
        conditionLabel: candidate.schedule.conditionLabel,
        legacyYear: candidate.schedule.legacyYear,
      } : candidate.schedule,
      triggerConditionLabel: candidate.triggerConditionLabel,
      requiredCapabilities: candidate.requiredCapabilities,
      tags: candidate.tags,
      source: isPlainRecord(candidate.source) ? {
        kind: candidate.source.kind,
        sourceId: candidate.source.sourceId,
        description: candidate.source.description,
      } : candidate.source,
    })
  }

  private entityContextIds(entityId: string): Set<string> {
    const contextIds = new Set<string>()
    const world = useWorldStore.getState()
    if (useCharacterStore.getState().characterId === entityId && world.currentContextId) {
      contextIds.add(world.currentContextId)
    }
    for (const event of selectHistoryLedgerReadState().events) {
      const participant = event.participants.find((item) => item.entityId === entityId)
      if (!participant) continue
      if (participant.contextId) contextIds.add(participant.contextId)
      if (event.scope.kind !== 'global') {
        for (const contextId of event.scope.contextIds) contextIds.add(contextId)
      }
    }
    return contextIds
  }

  private deriveCausalEdgeScope(
    sourceScope: HistoricalEventScope | undefined,
    resultScope: HistoricalEventScope,
  ): HistoricalEventScope {
    if (!sourceScope) return cloneValue(resultScope)
    const contextIds = [...new Set([
      ...sourceScope.contextIds,
      ...resultScope.contextIds,
    ])].sort()
    if (contextIds.length > 1) return { kind: 'cross-context', contextIds }
    if (contextIds.length === 1) return { kind: 'context', contextIds }
    return { kind: 'global', contextIds: [] }
  }

  private getLedgerIndex(): HistoricalLedgerIndex {
    this.ensureCurrentStoreValidated()
    const state = selectHistoryLedgerReadState()
    const cached = this.cachedIndex
    if (
      cached
      && cached.state.events === state.events
      && cached.state.transitions === state.transitions
      && cached.state.evidence === state.evidence
      && cached.state.causalEdges === state.causalEdges
      && cached.state.candidateAudits === state.candidateAudits
      && cached.state.migrationMetadata === state.migrationMetadata
    ) {
      return cached
    }

    const eventById = new Map<string, HistoricalEventRecord>()
    const statusByEventId = new Map<string, HistoricalEventStatus>()
    const latestTransitionByEventId = new Map<string, HistoricalEventTransition>()
    const transitionsByEventId = new Map<string, HistoricalEventTransition[]>()
    const evidenceByEventId = new Map<string, HistoricalEventEvidence[]>()
    const incomingEdgesByEventId = new Map<string, HistoricalCausalEdge[]>()
    const outgoingEdgesByEventId = new Map<string, HistoricalCausalEdge[]>()
    const countsByStatus = Object.fromEntries(
      HISTORICAL_EVENT_STATUSES.map((status) => [status, 0]),
    ) as Record<HistoricalEventStatus, number>

    for (const event of state.events) {
      eventById.set(event.eventId, event)
      statusByEventId.set(event.eventId, event.initialStatus)
    }
    for (const transition of state.transitions) {
      const transitions = transitionsByEventId.get(transition.eventId) ?? []
      transitions.push(transition)
      transitionsByEventId.set(transition.eventId, transitions)
      latestTransitionByEventId.set(transition.eventId, transition)
      statusByEventId.set(transition.eventId, transition.toStatus)
    }
    for (const evidence of state.evidence) {
      const items = evidenceByEventId.get(evidence.eventId) ?? []
      items.push(evidence)
      evidenceByEventId.set(evidence.eventId, items)
    }
    for (const edge of state.causalEdges) {
      const incoming = incomingEdgesByEventId.get(edge.toEventId) ?? []
      incoming.push(edge)
      incomingEdgesByEventId.set(edge.toEventId, incoming)
      const outgoing = outgoingEdgesByEventId.get(edge.fromEventId) ?? []
      outgoing.push(edge)
      outgoingEdgesByEventId.set(edge.fromEventId, outgoing)
    }
    for (const event of state.events) {
      const status = statusByEventId.get(event.eventId) ?? event.initialStatus
      countsByStatus[status] += 1
    }

    const next: HistoricalLedgerIndex = {
      state,
      eventById,
      statusByEventId,
      latestTransitionByEventId,
      transitionsByEventId,
      evidenceByEventId,
      incomingEdgesByEventId,
      outgoingEdgesByEventId,
      latestCandidateById: this.candidateProvider.latestCandidates(state.candidateAudits),
      countsByStatus,
    }
    this.cachedIndex = next
    return next
  }

  private toView(
    event: HistoricalEventRecord,
    index: HistoricalLedgerIndex,
  ): HistoricalEventView {
    return cloneValue({
      ...event,
      status: index.statusByEventId.get(event.eventId) ?? event.initialStatus,
      latestTransition: index.latestTransitionByEventId.get(event.eventId),
      evidenceCount: index.evidenceByEventId.get(event.eventId)?.length ?? 0,
      incomingCausalCount: index.incomingEdgesByEventId.get(event.eventId)?.length ?? 0,
      outgoingCausalCount: index.outgoingEdgesByEventId.get(event.eventId)?.length ?? 0,
    })
  }
}

let runtimeHistoricalEventLedgerSystem: HistoricalEventLedgerSystem | undefined

/** Loader、编排器和跨 MOD API 共用的懒单例。 */
export function getHistoricalEventLedgerSystem(): HistoricalEventLedgerSystem {
  runtimeHistoricalEventLedgerSystem ??= new HistoricalEventLedgerSystem()
  return runtimeHistoricalEventLedgerSystem
}
