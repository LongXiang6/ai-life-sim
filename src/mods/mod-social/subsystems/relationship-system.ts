import { BaseSubsystem } from '@/core/subsystem-base'
import type {
  RelationshipRecord,
  RelationshipScope,
  RelationshipSystemPersistenceState,
  RelationshipTransition,
  RelationshipTransitionOperation,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'
import { RELATIONSHIP_SYSTEM_OPERATION_FIELDS } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import {
  assertWorldEntityReference,
  contextHasCapability,
  getCurrentWorldContext,
  listCoLocatedWorldEntityIds,
  listWorldContexts,
  canRunBackgroundWorldSubsystem,
} from '@/mods/mod-world'

import {
  selectRelationshipPersistenceState,
  useRelationshipStore,
} from '../store'

const RELATIONSHIP_OPERATIONS = new Set<RelationshipTransitionOperation>([
  'establish',
  'adjust',
  'end',
  'scope-change',
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${label}包含未知字段：${unknown.join('、')}`)
}

function assertOperationPayloadKeys(
  operation: RelationshipTransitionOperation,
  payload: unknown,
): asserts payload is Record<string, unknown> {
  if (!isPlainRecord(payload)) throw new Error('关系系统指令变更必须是对象')
  const allowed = RELATIONSHIP_SYSTEM_OPERATION_FIELDS[operation]
  const unexpected = Object.keys(payload).filter((field) => !(allowed as readonly string[]).includes(field))
  if (unexpected.length > 0) throw new Error(`关系操作 ${operation} 不接受字段：${unexpected.join('、')}`)
  if (operation === 'adjust' && Object.keys(payload).length === 0) throw new Error('关系调整必须至少提供一项变更')
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function requireString(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${label}不能为空`)
  return normalized
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`)
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label}不能包含重复项`)
  return normalized
}

function requireFiniteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的有限数`)
  }
  return value
}

function optionalFiniteNumber(value: unknown, label: string, fallback = 0): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}必须是有限数`)
  return value
}

function optionalBoundedNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
  fallback = 0,
): number {
  if (value === undefined) return fallback
  return requireFiniteNumber(value, label, min, max)
}

function requireTotalDays(value: unknown, label: string): number {
  const totalDays = requireFiniteNumber(value, label, 0, Number.MAX_SAFE_INTEGER)
  if (!Number.isInteger(totalDays)) throw new Error(`${label}必须是非负整数`)
  return totalDays
}

function normalizeScope(value: unknown, operationContextId?: string): RelationshipScope {
  if (!isPlainRecord(value)) {
    if (!operationContextId) throw new Error('关系作用域必须是对象')
    return { kind: 'context', contextIds: [operationContextId] }
  }
  assertKnownKeys(value, ['kind', 'contextIds'], '关系作用域')
  const kind = value.kind ?? 'context'
  if (kind !== 'global' && kind !== 'context' && kind !== 'cross-context') {
    throw new Error('关系作用域无效')
  }
  const defaultContextIds = kind === 'global'
    ? []
    : operationContextId && kind === 'context'
      ? [operationContextId]
      : undefined
  const contextIds = value.contextIds === undefined
    ? defaultContextIds
    : requireStringArray(value.contextIds, '关系作用域上下文')
  if (!contextIds) throw new Error(`${kind} 关系必须声明上下文`)
  if (kind === 'global' && contextIds.length !== 0) throw new Error('global 关系不能绑定单一上下文')
  if (kind === 'context' && contextIds.length !== 1) throw new Error('context 关系必须只有一个上下文')
  if (kind === 'cross-context' && contextIds.length < 2) throw new Error('cross-context 关系至少需要两个上下文')
  const knownContextIds = new Set(listWorldContexts().map((instance) => instance.record.id))
  for (const contextId of contextIds) {
    if (!knownContextIds.has(contextId)) throw new Error(`关系作用域引用未知上下文：${contextId}`)
  }
  if (operationContextId && kind !== 'global' && !contextIds.includes(operationContextId)) {
    throw new Error('关系作用域必须包含指令目标上下文')
  }
  return { kind, contextIds }
}

function relationId(fromEntityId: string, toEntityId: string, scope: RelationshipScope): string {
  const contexts = [...scope.contextIds].sort().map(encodeURIComponent).join(',')
  return `relationship:${encodeURIComponent(fromEntityId)}:${encodeURIComponent(toEntityId)}:${scope.kind}:${contexts}`
}

function relevantRelationship(relationship: RelationshipRecord, contextId: string): boolean {
  return relationship.scope.kind === 'global' || relationship.scope.contextIds.includes(contextId)
}

function relationshipKey(relationship: Pick<RelationshipRecord, 'fromEntityId' | 'toEntityId' | 'scope'>): string {
  return `${relationship.fromEntityId}\u0000${relationship.toEntityId}\u0000${relationship.scope.kind}\u0000${[...relationship.scope.contextIds].sort().join(',')}`
}

function validateEndpoints(
  fromEntityId: string,
  toEntityId: string,
  scope: RelationshipScope,
  operationContextId?: string,
): void {
  const from = assertWorldEntityReference(fromEntityId)
  const to = assertWorldEntityReference(toEntityId)
  if (from.entityId === to.entityId) throw new Error('关系端点不能指向同一实体')
  const visibleContextIds = scope.kind === 'global'
    ? operationContextId ? [operationContextId] : []
    : scope.contextIds
  for (const contextId of visibleContextIds) {
    if (!from.contextIds.includes(contextId) || !to.contextIds.includes(contextId)) {
      throw new Error(`关系端点不在声明上下文可见范围：${contextId}`)
    }
  }
}

function validateEvidence(value: unknown, contextId: string, label = '关系依据事件'): string[] {
  const eventIds = requireStringArray(value, label)
  for (const eventId of eventIds) {
    const event = getHistoricalEvent(eventId)
    if (!event || event.status === 'void') throw new Error(`关系引用的历史事件不存在或已作废：${eventId}`)
    if (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId)) {
      throw new Error(`关系引用的历史事件不属于上下文 ${contextId}：${eventId}`)
    }
  }
  return eventIds
}

function validatePersistenceState(snapshot: unknown): RelationshipSystemPersistenceState {
  if (!isPlainRecord(snapshot) || snapshot.schemaVersion !== 1) {
    throw new Error('关系系统快照必须是 schemaVersion: 1')
  }
  if (!Array.isArray(snapshot.relationships)
    || !Array.isArray(snapshot.transitions)) {
    throw new Error('关系系统快照缺少完整数组')
  }
  assertKnownKeys(snapshot, ['schemaVersion', 'relationships', 'transitions'], '关系系统快照')
  const relationshipIds = new Set<string>()
  const relationshipKeys = new Set<string>()
  const transitionIds = new Set<string>()
  const relationships = snapshot.relationships.map((value, index) => {
    if (!isPlainRecord(value)) throw new Error(`relationships[${index}] 必须是对象`)
    assertKnownKeys(value, ['relationshipId', 'fromEntityId', 'toEntityId', 'scope', 'categoryTags', 'affinity', 'trust', 'bond', 'conflict', 'status', 'createdAtTotalDays'], `relationships[${index}]`)
    const relationshipId = requireString(value.relationshipId, `relationships[${index}].relationshipId`)
    if (relationshipIds.has(relationshipId)) throw new Error(`关系 ID 重复：${relationshipId}`)
    const fromEntityId = requireString(value.fromEntityId, `relationships[${index}].fromEntityId`)
    const toEntityId = requireString(value.toEntityId, `relationships[${index}].toEntityId`)
    const scope = normalizeScope(value.scope)
    validateEndpoints(fromEntityId, toEntityId, scope)
    if (value.status !== 'active' && value.status !== 'ended') {
      throw new Error(`relationships[${index}] 状态无效`)
    }
    const record: RelationshipRecord = {
      relationshipId,
      fromEntityId,
      toEntityId,
      scope,
      categoryTags: requireStringArray(value.categoryTags, `relationships[${index}].categoryTags`),
      affinity: requireFiniteNumber(value.affinity, `relationships[${index}].affinity`, -100, 100),
      trust: requireFiniteNumber(value.trust, `relationships[${index}].trust`, 0, 100),
      bond: requireFiniteNumber(value.bond, `relationships[${index}].bond`, 0, 100),
      conflict: requireFiniteNumber(value.conflict, `relationships[${index}].conflict`, 0, 100),
      status: value.status,
      createdAtTotalDays: requireTotalDays(
        value.createdAtTotalDays,
        `relationships[${index}].createdAtTotalDays`,
      ),
    }
    const key = relationshipKey(record)
    if (relationshipKeys.has(key)) throw new Error(`存在重复方向和作用域的关系：${relationshipId}`)
    relationshipIds.add(relationshipId)
    relationshipKeys.add(key)
    return record
  })
  const transitions = snapshot.transitions.map((value, index) => {
    if (!isPlainRecord(value)) throw new Error(`transitions[${index}] 必须是对象`)
    assertKnownKeys(value, ['transitionId', 'relationshipId', 'operation', 'description', 'contextId', 'occurredAtTotalDays', 'historicalEventIds'], `transitions[${index}]`)
    const transitionId = requireString(value.transitionId, `transitions[${index}].transitionId`)
    if (transitionIds.has(transitionId)) throw new Error(`关系迁移 ID 重复：${transitionId}`)
    const relationshipId = requireString(value.relationshipId, `transitions[${index}].relationshipId`)
    const relationship = relationships.find((item) => item.relationshipId === relationshipId)
    if (!relationship) throw new Error(`transitions[${index}] 引用未知关系`)
    if (!RELATIONSHIP_OPERATIONS.has(value.operation as RelationshipTransitionOperation)) {
      throw new Error(`transitions[${index}] 操作无效`)
    }
    const contextId = requireString(value.contextId, `transitions[${index}].contextId`)
    if (!listWorldContexts().some((instance) => instance.record.id === contextId)) {
      throw new Error(`transitions[${index}] 引用未知上下文`)
    }
    const occurredAtTotalDays = requireTotalDays(
      value.occurredAtTotalDays,
      `transitions[${index}].occurredAtTotalDays`,
    )
    if (occurredAtTotalDays < relationship.createdAtTotalDays) {
      throw new Error(`transitions[${index}].occurredAtTotalDays 早于关系建立时间`)
    }
    transitionIds.add(transitionId)
    return {
      transitionId,
      relationshipId,
      operation: value.operation as RelationshipTransitionOperation,
      description: requireString(value.description, `transitions[${index}].description`),
      contextId,
      occurredAtTotalDays,
      historicalEventIds: validateEvidence(
        value.historicalEventIds,
        contextId,
        `transitions[${index}].historicalEventIds`,
      ),
    }
  })
  for (const relationship of relationships) {
    if (!transitions.some((transition) => (
      transition.relationshipId === relationship.relationshipId
      && transition.operation === 'establish'
    ))) {
      throw new Error(`关系缺少建立迁移记录：${relationship.relationshipId}`)
    }
  }
  return {
    schemaVersion: 1,
    relationships,
    transitions,
  }
}

export class RelationshipSystem extends BaseSubsystem {
  readonly id = 'relationship-system' as const
  readonly mod = 'mod-social' as const
  readonly label = '通用关系系统' as const
  readonly description = '拥有跨实体有向关系图、作用域和追加式关系迁移' as const

  collectState(context: RoundContext): SubSystemState {
    const world = getCurrentWorldContext()
    const instance = world && world.record.id === context.contextId ? world : listWorldContexts().find((item) => item.record.id === context.contextId)
    if (!instance?.capabilityProfile.capabilities.includes('npc')) {
      return { id: this.id, summary: '', data: { enabled: false, contextId: context.contextId, relationships: [] } }
    }
    const sceneEntityIds = listCoLocatedWorldEntityIds(context.contextId, context.characterId)
    const relationships = this.getRelationshipsForEntities(sceneEntityIds, context.contextId)
    return {
      id: this.id,
      summary: `【${this.label}：当前相关 ${relationships.length} 条】`,
      data: { enabled: true, contextId: context.contextId, relationships: clone(relationships) },
    }
  }

  getRelationshipsForEntities(entityIds: readonly string[], contextId: string): RelationshipRecord[] {
    const entitySet = new Set(entityIds)
    return selectRelationshipPersistenceState().relationships
      .filter((relationship) => relevantRelationship(relationship, contextId))
      .filter((relationship) => entitySet.has(relationship.fromEntityId) || entitySet.has(relationship.toEntityId))
      .map(clone)
  }

  getTransition(transitionId: string): RelationshipTransition | undefined {
    const transition = selectRelationshipPersistenceState().transitions.find((item) => item.transitionId === transitionId)
    return transition ? clone(transition) : undefined
  }

  advance(context: RoundContext): void {
    const state = useRelationshipStore.getState()
    const existingTransitionIds = new Set(state.transitions.map((transition) => transition.transitionId))
    const transitions: RelationshipTransition[] = []
    for (const instance of listWorldContexts()) {
      const contextId = instance.record.id
      if (!canRunBackgroundWorldSubsystem(contextId, this.id)) continue
      const background = state.relationships.filter((item) => (
        relevantRelationship(item, contextId) && item.status === 'active'
      ))
      if (background.length === 0) continue
      for (const item of background) {
        const transitionId = `relationship-background:${encodeURIComponent(item.relationshipId)}:${encodeURIComponent(contextId)}:${context.totalDays}`
        if (existingTransitionIds.has(transitionId)) continue
        existingTransitionIds.add(transitionId)
        transitions.push({
          transitionId,
          relationshipId: item.relationshipId,
          operation: 'adjust',
          description: '后台关系聚合观察',
          contextId,
          occurredAtTotalDays: context.totalDays,
          historicalEventIds: [],
        })
      }
    }
    if (transitions.length > 0) {
      useRelationshipStore.setState({ transitions: [...state.transitions, ...transitions] })
    }
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('关系系统指令目标不匹配')
    if (!changes.targetContextId || changes.targetContextId !== context.contextId) throw new Error('关系系统指令上下文必须是当前上下文')
    if (!contextHasCapability(context.contextId, 'npc')) throw new Error('目标上下文未启用 NPC 社会能力')
    if (!changes.operation || !RELATIONSHIP_OPERATIONS.has(changes.operation as RelationshipTransitionOperation)) throw new Error('关系系统指令操作无效')
    if (!changes.targetObjectId) throw new Error('关系系统指令缺少稳定目标对象')
    requireString(changes.description, '关系系统指令说明')
    validateEvidence(changes.evidenceEventIds ?? [], context.contextId)
    const operation = changes.operation as RelationshipTransitionOperation
    const payload = changes.changes
    assertOperationPayloadKeys(operation, payload)
    if (operation === 'establish') {
      const from = assertWorldEntityReference(changes.targetObjectId)
      const toId = typeof payload.toEntityId === 'string' ? payload.toEntityId : ''
      if (!toId || toId === from.entityId) throw new Error('建立关系必须提供不同的目标实体')
      const scope = normalizeScope({ kind: payload.scopeKind, contextIds: payload.scopeContextIds }, context.contextId)
      validateEndpoints(from.entityId, toId, scope, context.contextId)
      if (payload.categoryTags !== undefined) requireStringArray(payload.categoryTags, '关系类别')
      optionalBoundedNumber(payload.affinity, '初始好感', -100, 100)
      optionalBoundedNumber(payload.trust, '初始信任', 0, 100)
      optionalBoundedNumber(payload.bond, '初始羁绊', 0, 100)
      optionalBoundedNumber(payload.conflict, '初始冲突', 0, 100)
      const id = relationId(from.entityId, toId, scope)
      if (useRelationshipStore.getState().relationships.some((item) => (
        item.relationshipId === id
        || relationshipKey(item) === relationshipKey({ fromEntityId: from.entityId, toEntityId: toId, scope })
      ))) {
        throw new Error(`关系已存在：${id}`)
      }
      return
    }
    const relationship = useRelationshipStore.getState().relationships.find((item) => item.relationshipId === changes.targetObjectId)
    if (!relationship) throw new Error(`关系不存在：${changes.targetObjectId}`)
    if (relationship.status === 'ended') throw new Error(`关系已经结束：${changes.targetObjectId}`)
    if (!relevantRelationship(relationship, context.contextId)) throw new Error('关系不属于当前作用域')
    if (payload.categoryTags !== undefined) requireStringArray(payload.categoryTags, '关系类别')
    for (const [field, valueField, label, min, max] of [
      ['affinityDelta', 'affinity', '好感变化', -100, 100],
      ['trustDelta', 'trust', '信任变化', 0, 100],
      ['bondDelta', 'bond', '羁绊变化', 0, 100],
      ['conflictDelta', 'conflict', '冲突变化', 0, 100],
    ] as const) {
      const delta = optionalFiniteNumber(payload[field], label)
      requireFiniteNumber(relationship[valueField] + delta, `调整后${label}`, min, max)
    }
    if (operation === 'scope-change') {
      const scope = normalizeScope({ kind: payload.scopeKind, contextIds: payload.scopeContextIds }, context.contextId)
      validateEndpoints(relationship.fromEntityId, relationship.toEntityId, scope, context.contextId)
      const key = relationshipKey({ ...relationship, scope })
      if (useRelationshipStore.getState().relationships.some((item) => (
        item.relationshipId !== relationship.relationshipId && relationshipKey(item) === key
      ))) {
        throw new Error('目标作用域已存在同方向关系')
      }
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error('关系系统指令必须是对象')
    if (changes.id !== this.id) throw new Error('关系系统指令目标不匹配')
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error('关系系统指令变更必须是对象')
    }
    if (!changes.description || changes.description.trim() === '') throw new Error('关系系统指令说明不能为空')
    const payload = changes.changes
    this.preflightChanges(changes, context)
    const state = useRelationshipStore.getState()
    const operation = changes.operation as RelationshipTransitionOperation
    const evidenceEventIds = [...(changes.evidenceEventIds ?? [])]
    const occurredAtTotalDays = context.totalDays
    if (operation === 'establish') {
      const fromEntityId = changes.targetObjectId as string
      const toEntityId = payload.toEntityId as string
      const scope = normalizeScope({ kind: payload.scopeKind, contextIds: payload.scopeContextIds }, context.contextId)
      const record: RelationshipRecord = {
        relationshipId: relationId(fromEntityId, toEntityId, scope),
        fromEntityId,
        toEntityId,
        scope,
        categoryTags: payload.categoryTags === undefined ? [] : requireStringArray(payload.categoryTags, '关系类别'),
        affinity: optionalBoundedNumber(payload.affinity, '初始好感', -100, 100),
        trust: optionalBoundedNumber(payload.trust, '初始信任', 0, 100),
        bond: optionalBoundedNumber(payload.bond, '初始羁绊', 0, 100),
        conflict: optionalBoundedNumber(payload.conflict, '初始冲突', 0, 100),
        status: 'active',
        createdAtTotalDays: occurredAtTotalDays,
      }
      const transition: RelationshipTransition = {
        transitionId: `relationship-transition:${encodeURIComponent(record.relationshipId)}:${occurredAtTotalDays}:${state.transitions.length}`,
        relationshipId: record.relationshipId,
        operation: 'establish',
        description: changes.description,
        contextId: context.contextId,
        occurredAtTotalDays,
        historicalEventIds: evidenceEventIds,
      }
      useRelationshipStore.setState({
        relationships: [...state.relationships, record],
        transitions: [...state.transitions, transition],
      })
      return
    }
    const relationshipIndex = state.relationships.findIndex((item) => item.relationshipId === changes.targetObjectId)
    const current = state.relationships[relationshipIndex]
    const scope = operation === 'scope-change'
      ? normalizeScope({ kind: payload.scopeKind, contextIds: payload.scopeContextIds }, context.contextId)
      : current.scope
    const next: RelationshipRecord = {
      ...current,
      scope,
      status: operation === 'end' ? 'ended' : current.status,
      affinity: current.affinity + optionalFiniteNumber(payload.affinityDelta, '好感变化'),
      trust: current.trust + optionalFiniteNumber(payload.trustDelta, '信任变化'),
      bond: current.bond + optionalFiniteNumber(payload.bondDelta, '羁绊变化'),
      conflict: current.conflict + optionalFiniteNumber(payload.conflictDelta, '冲突变化'),
      categoryTags: payload.categoryTags !== undefined
        ? requireStringArray(payload.categoryTags, '关系类别')
        : current.categoryTags,
    }
    const transition: RelationshipTransition = {
      transitionId: `relationship-transition:${encodeURIComponent(current.relationshipId)}:${occurredAtTotalDays}:${state.transitions.length}`,
      relationshipId: current.relationshipId,
      operation,
      description: changes.description,
      contextId: context.contextId,
      occurredAtTotalDays,
      historicalEventIds: evidenceEventIds,
    }
    const relationships = [...state.relationships]
    relationships[relationshipIndex] = next
    useRelationshipStore.setState({ relationships, transitions: [...state.transitions, transition] })
  }

  capturePersistenceState(): RelationshipSystemPersistenceState {
    return validatePersistenceState(selectRelationshipPersistenceState())
  }

  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) {
      useRelationshipStore.getState().reset()
      return
    }
    useRelationshipStore.getState().replacePersistenceState(validatePersistenceState(snapshot))
  }

  capturePreviewState(): RelationshipSystemPersistenceState {
    return this.capturePersistenceState()
  }

  restorePreviewState(snapshot: unknown): void {
    this.restorePersistenceState(snapshot)
  }

  reset(): void {
    useRelationshipStore.getState().reset()
  }
}

let runtimeRelationshipSystem: RelationshipSystem | undefined

export function getRelationshipSystem(): RelationshipSystem {
  runtimeRelationshipSystem ??= new RelationshipSystem()
  return runtimeRelationshipSystem
}
