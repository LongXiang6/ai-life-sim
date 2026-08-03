'use client'

/**
 * Purpose: Own the persisted historical-event ledger store and migration projection.
 * Owner: mod-history-dynamics
 * Responsibility: Ledger persistence state and Store hydration only; event business decisions stay in the ledger system.
  */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  HistoricalEventCandidate,
  HistoricalEventCandidateAudit,
  HistoricalEventLedgerPersistenceState,
  HistoricalEventMigrationMetadata,
  HistoricalEventPreparedAppend,
  HistoricalEventRecord,
  HistoricalEventEvidence,
} from '@/foundation'
import { useWorldStore } from '@/mods/mod-world'

import type {
  LegacyCausalEventV1,
  LegacyEventPoolEntryV1,
  LegacyHistoryDynamicsStateV1,
} from './types'
import {
  cloneValue,
  finiteNonNegative,
  isPlainRecord,
  nonEmptyText,
} from './utils'

interface HistoryDynamicsStore extends HistoricalEventLedgerPersistenceState {
  commitAppend: (append: HistoricalEventPreparedAppend) => void
  replacePersistenceState: (snapshot: HistoricalEventLedgerPersistenceState) => void
  getPersistenceState: () => HistoricalEventLedgerPersistenceState
  reset: () => void
}

export function createEmptyHistoryLedgerState(): HistoricalEventLedgerPersistenceState {
  return {
    schemaVersion: 2,
    events: [],
    transitions: [],
    evidence: [],
    causalEdges: [],
    candidateAudits: [],
    migrationMetadata: [],
  }
}

function exactArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function legacyKey(kind: string, rawId: unknown, index: number): string {
  const id = nonEmptyText(rawId) ?? String(index)
  return `legacy:${kind}:${encodeURIComponent(id)}`
}

function legacyScope(contextId: string | undefined) {
  return contextId
    ? { kind: 'context' as const, contextIds: [contextId] }
    : { kind: 'global' as const, contextIds: [] }
}

function legacySource(systemId: string) {
  return {
    kind: 'migration' as const,
    sourceId: systemId,
    description: '从历史动态 Store v1 无损迁移',
  }
}

function migrateLegacyEventPool(
  legacy: LegacyHistoryDynamicsStateV1,
  state: HistoricalEventLedgerPersistenceState,
  legacyContextId: string | undefined,
): void {
  const entries = exactArray(legacy.eventPool?.entries)
  for (let index = 0; index < entries.length; index += 1) {
    const raw = entries[index]
    if (!isPlainRecord(raw)) continue
    const entry = cloneValue(raw) as LegacyEventPoolEntryV1
    const candidateId = legacyKey('candidate', entry.id, index)
    const eventId = legacyKey('event', entry.id, index)
    const title = nonEmptyText(entry.name) ?? '旧事件池条目'
    const description = nonEmptyText(entry.description) ?? title
    const schedule = finiteNonNegative(entry.triggeredYear) !== undefined
      ? { legacyYear: finiteNonNegative(entry.triggeredYear) }
      : undefined

    if (entry.triggered === true) {
      const record: HistoricalEventRecord = {
        eventId,
        eventType: nonEmptyText(entry.source) ?? 'legacy-event-pool',
        title,
        description,
        scope: legacyScope(legacyContextId),
        initialStatus: 'occurred',
        participants: [],
        locations: exactArray(entry.affectedRegions).map((region) => ({
          label: typeof region === 'string' ? region : JSON.stringify(region),
        })),
        schedule,
        tags: ['legacy-event-pool'],
        source: legacySource('event-pool'),
        createdRoundSequence: 0,
        createdTotalDays: 0,
        metadata: { legacyEventPoolEntry: entry },
      }
      const evidenceId = `${eventId}:migration-evidence`
      const evidence: HistoricalEventEvidence = {
        evidenceId,
        eventId,
        kind: 'migration',
        description: 'v1 事件池已触发事实',
        sourceId: 'event-pool',
        roundSequence: 0,
        totalDays: 0,
        payload: entry,
      }
      state.events.push(record)
      state.evidence.push(evidence)
      continue
    }

    const candidate: HistoricalEventCandidate = {
      candidateId,
      eventType: nonEmptyText(entry.source) ?? 'legacy-event-pool',
      title,
      description,
      scope: legacyScope(legacyContextId),
      participants: [],
      locations: exactArray(entry.affectedRegions).map((region) => ({
        label: typeof region === 'string' ? region : JSON.stringify(region),
      })),
      schedule,
      triggerConditionLabel: nonEmptyText(entry.triggerCondition),
      requiredCapabilities: [],
      tags: ['legacy-event-pool'],
      source: legacySource('event-pool'),
      metadata: { legacyEventPoolEntry: entry },
    }
    const audit: HistoricalEventCandidateAudit = {
      auditId: `${candidateId}:migration-audit`,
      candidateId,
      status: entry.expired === true ? 'expired' : 'available',
      candidate,
      reason: entry.expired === true ? 'v1 候选已过期' : 'v1 候选仍未触发',
      roundSequence: 0,
      totalDays: 0,
    }
    state.candidateAudits.push(audit)
  }
}

function legacyParticipant(label: unknown, role: string) {
  const preserved = nonEmptyText(label)
  return preserved ? [{ label: preserved, role }] : []
}

function migrateLegacyCausality(
  legacy: LegacyHistoryDynamicsStateV1,
  state: HistoricalEventLedgerPersistenceState,
  legacyContextId: string | undefined,
): void {
  const queue = isPlainRecord(legacy.causalSimulation?.queue)
    ? legacy.causalSimulation.queue
    : {}
  const pending = exactArray(queue.pending).map((event) => ({ event, resolved: false }))
  const resolved = exactArray(queue.resolved).map((event) => ({ event, resolved: true }))
  const all = [...pending, ...resolved]

  for (let index = 0; index < all.length; index += 1) {
    const wrapped = all[index]
    if (!isPlainRecord(wrapped.event)) continue
    const event = cloneValue(wrapped.event) as LegacyCausalEventV1
    const eventId = legacyKey('causal', event.id, index)
    const description = nonEmptyText(event.captureDescription) ?? '旧因果事项'
    const consequence = nonEmptyText(event.consequence)
    const participants = [
      ...legacyParticipant(event.initiator, 'initiator'),
      ...legacyParticipant(event.target, 'target'),
    ]
    const schedule = finiteNonNegative(event.triggerYear) !== undefined
      ? { legacyYear: finiteNonNegative(event.triggerYear) }
      : undefined
    const record: HistoricalEventRecord = {
      eventId,
      eventType: nonEmptyText(event.actionType) ?? 'legacy-causal',
      title: description,
      description: consequence ? `${description}\n旧后果：${consequence}` : description,
      scope: legacyScope(legacyContextId),
      initialStatus: wrapped.resolved || event.resolved === true ? 'resolved' : 'scheduled',
      participants,
      locations: [],
      schedule,
      tags: ['legacy-causal-simulation'],
      source: legacySource('causal-simulation'),
      createdRoundSequence: 0,
      createdTotalDays: 0,
      metadata: { legacyCausalEvent: event },
    }
    const evidence: HistoricalEventEvidence = {
      evidenceId: `${eventId}:migration-evidence`,
      eventId,
      kind: 'migration',
      description: wrapped.resolved ? 'v1 已解决因果事项' : 'v1 待处理因果事项',
      sourceId: 'causal-simulation',
      roundSequence: 0,
      totalDays: 0,
      payload: event,
    }
    state.events.push(record)
    state.evidence.push(evidence)
  }
}

/**
 * Zustand persist v1 -> v2。原 payload 同时保留在 migrationMetadata，未知字段也不会丢失。
 */
export function migrateHistoryDynamicsState(
  persistedState: unknown,
  version: number,
  legacyContextId = useWorldStore.getState().currentContextId ?? undefined,
): HistoricalEventLedgerPersistenceState {
  if (version > 2) {
    throw new Error(`不支持的历史事件账本持久化版本: ${version}`)
  }
  if (version === 2) {
    if (!isHistoryLedgerPersistenceState(persistedState)) {
      throw new Error('历史事件账本 v2 持久化状态格式无效')
    }
    return normalizeHistoryLedgerPersistenceState(persistedState)
  }

  const legacy = isPlainRecord(persistedState)
    ? cloneValue(persistedState) as LegacyHistoryDynamicsStateV1
    : {}
  const next = createEmptyHistoryLedgerState()
  migrateLegacyEventPool(legacy, next, legacyContextId)
  migrateLegacyCausality(legacy, next, legacyContextId)

  const sourceSystemIds = [
    ...(legacy.eventPool ? ['event-pool'] : []),
    ...(legacy.causalSimulation ? ['causal-simulation'] : []),
  ]
  if (sourceSystemIds.length > 0) {
    const migration: HistoricalEventMigrationMetadata = {
      migrationId: 'history-dynamics:v1-to-v2',
      fromVersion: version,
      sourceSystemIds,
      eventCount: next.events.length,
      candidateCount: next.candidateAudits.length,
      causalCount: exactArray(
        isPlainRecord(legacy.causalSimulation?.queue)
          ? legacy.causalSimulation?.queue.pending
          : [],
      ).length + exactArray(
        isPlainRecord(legacy.causalSimulation?.queue)
          ? legacy.causalSimulation?.queue.resolved
          : [],
      ).length,
      legacyPayload: legacy,
    }
    next.migrationMetadata.push(migration)
  }
  return next
}

export function isHistoryLedgerPersistenceState(
  value: unknown,
): value is HistoricalEventLedgerPersistenceState {
  if (!isPlainRecord(value) || value.schemaVersion !== 2) return false
  return Array.isArray(value.events)
    && Array.isArray(value.transitions)
    && Array.isArray(value.evidence)
    && Array.isArray(value.causalEdges)
    && Array.isArray(value.candidateAudits)
    && Array.isArray(value.migrationMetadata)
}

/**
 * P1 开发期 schemaVersion 仍为 2；仅把新增的通用能力要求缺省值补为空数组。
 * 非数组、非法能力等内容保留给 owning system 的严格恢复校验拒绝。
 */
export function normalizeHistoryLedgerPersistenceState(
  snapshot: HistoricalEventLedgerPersistenceState,
): HistoricalEventLedgerPersistenceState {
  const normalized = cloneValue(snapshot)
  for (const audit of normalized.candidateAudits) {
    if (
      isPlainRecord(audit)
      && isPlainRecord(audit.candidate)
      && audit.candidate.requiredCapabilities === undefined
    ) {
      audit.candidate.requiredCapabilities = []
    }
  }
  return normalized
}

export interface HistoryLedgerReadState {
  readonly schemaVersion: 2
  readonly events: readonly HistoricalEventLedgerPersistenceState['events'][number][]
  readonly transitions: readonly HistoricalEventLedgerPersistenceState['transitions'][number][]
  readonly evidence: readonly HistoricalEventLedgerPersistenceState['evidence'][number][]
  readonly causalEdges: readonly HistoricalEventLedgerPersistenceState['causalEdges'][number][]
  readonly candidateAudits: readonly HistoricalEventLedgerPersistenceState['candidateAudits'][number][]
  readonly migrationMetadata: readonly HistoricalEventLedgerPersistenceState['migrationMetadata'][number][]
}

/** 查询与 collectState 使用的零深克隆只读选择器；完整克隆只留给持久化存档。 */
export function selectHistoryLedgerReadState(): HistoryLedgerReadState {
  const state = useHistoryDynamicsStore.getState()
  return {
    schemaVersion: 2,
    events: state.events,
    transitions: state.transitions,
    evidence: state.evidence,
    causalEdges: state.causalEdges,
    candidateAudits: state.candidateAudits,
    migrationMetadata: state.migrationMetadata,
  }
}

function assertNoDuplicateAppend<T>(
  existing: readonly T[],
  incoming: readonly T[],
  getId: (entry: T) => string,
  keyLabel: string,
): void {
  const ids = new Set(existing.map(getId))
  for (const entry of incoming) {
    const id = getId(entry)
    if (ids.has(id)) throw new Error(`历史事件账本重复 ${keyLabel}: ${id}`)
    ids.add(id)
  }
}

function appendAtomically(
  state: HistoricalEventLedgerPersistenceState,
  append: HistoricalEventPreparedAppend,
): HistoricalEventLedgerPersistenceState {
  assertNoDuplicateAppend(state.events, append.events, (entry) => entry.eventId, 'eventId')
  assertNoDuplicateAppend(state.transitions, append.transitions, (entry) => entry.transitionId, 'transitionId')
  assertNoDuplicateAppend(state.evidence, append.evidence, (entry) => entry.evidenceId, 'evidenceId')
  assertNoDuplicateAppend(state.causalEdges, append.causalEdges, (entry) => entry.edgeId, 'edgeId')
  assertNoDuplicateAppend(state.candidateAudits, append.candidateAudits, (entry) => entry.auditId, 'auditId')
  assertNoDuplicateAppend(state.migrationMetadata, append.migrationMetadata, (entry) => entry.migrationId, 'migrationId')
  return {
    schemaVersion: 2,
    events: [...state.events, ...cloneValue(append.events)],
    transitions: [...state.transitions, ...cloneValue(append.transitions)],
    evidence: [...state.evidence, ...cloneValue(append.evidence)],
    causalEdges: [...state.causalEdges, ...cloneValue(append.causalEdges)],
    candidateAudits: [...state.candidateAudits, ...cloneValue(append.candidateAudits)],
    migrationMetadata: [...state.migrationMetadata, ...cloneValue(append.migrationMetadata)],
  }
}

function persistenceSlice(state: HistoricalEventLedgerPersistenceState): HistoricalEventLedgerPersistenceState {
  return cloneValue({
    schemaVersion: 2,
    events: state.events,
    transitions: state.transitions,
    evidence: state.evidence,
    causalEdges: state.causalEdges,
    candidateAudits: state.candidateAudits,
    migrationMetadata: state.migrationMetadata,
  })
}

export const useHistoryDynamicsStore = create<HistoryDynamicsStore>()(
  persist(
    (set, get) => ({
      ...createEmptyHistoryLedgerState(),
      commitAppend: (append) => set((state) => appendAtomically(state, append)),
      replacePersistenceState: (snapshot) => {
        if (!isHistoryLedgerPersistenceState(snapshot)) {
          throw new Error('历史事件账本持久化快照格式无效')
        }
        set(persistenceSlice(snapshot))
      },
      getPersistenceState: () => persistenceSlice(get()),
      reset: () => set(createEmptyHistoryLedgerState()),
    }),
    {
      name: 'mod-history-dynamics:persist:history-dynamics-state',
      version: 2,
      migrate: (persistedState, version) => migrateHistoryDynamicsState(
        persistedState,
        version,
        useWorldStore.getState().currentContextId ?? undefined,
      ),
      partialize: (state) => persistenceSlice(state),
    },
  ),
)
