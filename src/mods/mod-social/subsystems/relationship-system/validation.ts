/**
 * Purpose: Validate relationship commands, entity scopes, evidence, identifiers, and persistence snapshots.
 * Owner: mod-social
 * Responsibility: Pure validation and normalization only; relationship state writes remain in RelationshipSystem.
 */

import type {
  EntityReference,
  RelationshipRecord,
  RelationshipScope,
  RelationshipSystemPersistenceState,
  RelationshipTransitionOperation,
  RoundContext,
  SubSystemChanges,
} from '@/foundation'
import { RELATIONSHIP_SYSTEM_OPERATION_FIELDS } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import {
  getWorldEntityReference,
  listWorldContexts,
} from '@/mods/mod-world'

export const RELATIONSHIP_OPERATIONS = new Set<RelationshipTransitionOperation>([
  'establish',
  'adjust',
  'end',
  'scope-change',
])

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${label}包含未知字段：${unknown.join('、')}`)
}

export function assertOperationPayloadKeys(
  operation: RelationshipTransitionOperation,
  payload: unknown,
): asserts payload is Record<string, unknown> {
  if (!isPlainRecord(payload)) throw new Error('关系系统指令变更必须是对象')
  const allowed = RELATIONSHIP_SYSTEM_OPERATION_FIELDS[operation]
  const unexpected = Object.keys(payload).filter((field) => !(allowed as readonly string[]).includes(field))
  if (unexpected.length > 0) throw new Error(`关系操作 ${operation} 不接受字段：${unexpected.join('、')}`)
  if (operation === 'adjust' && Object.keys(payload).length === 0) throw new Error('关系调整必须至少提供一项变更')
}

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function requireString(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${label}不能为空`)
  return normalized
}

export function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`)
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label}不能包含重复项`)
  return normalized
}

export function requireFiniteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的有限数`)
  }
  return value
}

export function optionalFiniteNumber(value: unknown, label: string, fallback = 0): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}必须是有限数`)
  return value
}

export function optionalBoundedNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
  fallback = 0,
): number {
  if (value === undefined) return fallback
  return requireFiniteNumber(value, label, min, max)
}

export function requireTotalDays(value: unknown, label: string): number {
  const totalDays = requireFiniteNumber(value, label, 0, Number.MAX_SAFE_INTEGER)
  if (!Number.isInteger(totalDays)) throw new Error(`${label}必须是非负整数`)
  return totalDays
}

export function normalizeScope(value: unknown, operationContextId?: string): RelationshipScope {
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

export function relationId(fromEntityId: string, toEntityId: string, scope: RelationshipScope): string {
  const contexts = [...scope.contextIds].sort().map(encodeURIComponent).join(',')
  return `relationship:${encodeURIComponent(fromEntityId)}:${encodeURIComponent(toEntityId)}:${scope.kind}:${contexts}`
}

export function relevantRelationship(relationship: RelationshipRecord, contextId: string): boolean {
  return relationship.scope.kind === 'global' || relationship.scope.contextIds.includes(contextId)
}

export function relationshipKey(relationship: Pick<RelationshipRecord, 'fromEntityId' | 'toEntityId' | 'scope'>): string {
  return `${relationship.fromEntityId}\u0000${relationship.toEntityId}\u0000${relationship.scope.kind}\u0000${[...relationship.scope.contextIds].sort().join(',')}`
}

export function resolvePackageEntityReference(
  entityId: string,
  context: RoundContext | undefined,
  packageChanges?: readonly SubSystemChanges[],
): EntityReference {
  const existing = getWorldEntityReference(entityId)
  if (existing) return existing
  if (!context || !packageChanges) throw new Error(`实体引用不存在：${entityId}`)
  const candidates = packageChanges.filter((item) => (
    item.id === 'npc-system'
      && item.operation === 'create-identity'
      && item.targetObjectId === entityId
      && item.targetContextId === context.contextId
  ))
  if (candidates.length > 1) throw new Error(`同一回合重复创建 NPC 身份：${entityId}`)
  const candidate = candidates[0]
  const displayName = typeof candidate?.changes.displayName === 'string'
    ? candidate.changes.displayName.trim()
    : ''
  if (!candidate || !displayName) throw new Error(`实体引用不存在：${entityId}`)
  return {
    entityId,
    kind: 'npc',
    displayName,
    contextIds: [context.contextId],
    registeredAtTotalDays: context.totalDays,
  }
}

export function validateEndpoints(
  fromEntityId: string,
  toEntityId: string,
  scope: RelationshipScope,
  operationContextId?: string,
  context?: RoundContext,
  packageChanges?: readonly SubSystemChanges[],
): void {
  const from = resolvePackageEntityReference(fromEntityId, context, packageChanges)
  const to = resolvePackageEntityReference(toEntityId, context, packageChanges)
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

export function validateEvidence(value: unknown, contextId: string, label = '关系依据事件'): string[] {
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

export function validatePersistenceState(snapshot: unknown): RelationshipSystemPersistenceState {
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
