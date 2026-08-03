/**
 * Purpose: Own the relationship runtime state machine while delegating validation to its focused component.
 * Owner: mod-social
 * Responsibility: Collect, advance, preflight, apply, persist, and expose relationship state through the existing public API.
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type {
  RelationshipRecord,
  RelationshipSystemPersistenceState,
  RelationshipTransition,
  RelationshipTransitionOperation,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'
import {
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
import {
  RELATIONSHIP_OPERATIONS,
  assertOperationPayloadKeys,
  clone,
  normalizeScope,
  optionalBoundedNumber,
  optionalFiniteNumber,
  relationId,
  relationshipKey,
  relevantRelationship,
  requireFiniteNumber,
  requireString,
  requireStringArray,
  resolvePackageEntityReference,
  validateEndpoints,
  validateEvidence,
  validatePersistenceState,
} from './relationship-system/validation'

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

  preflightChanges(
    changes: SubSystemChanges,
    context: RoundContext,
    packageChanges?: readonly SubSystemChanges[],
  ): void {
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
      const from = resolvePackageEntityReference(changes.targetObjectId, context, packageChanges)
      const toId = typeof payload.toEntityId === 'string' ? payload.toEntityId : ''
      if (!toId || toId === from.entityId) throw new Error('建立关系必须提供不同的目标实体')
      const scope = normalizeScope({ kind: payload.scopeKind, contextIds: payload.scopeContextIds }, context.contextId)
      validateEndpoints(from.entityId, toId, scope, context.contextId, context, packageChanges)
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
      validateEndpoints(
        relationship.fromEntityId,
        relationship.toEntityId,
        scope,
        context.contextId,
        context,
        packageChanges,
      )
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

  reset(): void {
    useRelationshipStore.getState().reset()
  }
}

let runtimeRelationshipSystem: RelationshipSystem | undefined

export function getRelationshipSystem(): RelationshipSystem {
  runtimeRelationshipSystem ??= new RelationshipSystem()
  return runtimeRelationshipSystem
}
