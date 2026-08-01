import { BaseSubsystem } from '@/core/subsystem-base'
import type {
  EntityReference,
  NpcBehaviorRecord,
  NpcContextState,
  NpcGoal,
  NpcIdentity,
  NpcMemory,
  NpcSystemPersistenceState,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'
import { NPC_SYSTEM_OPERATION_FIELDS } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import {
  assertWorldEntityReference,
  assertWorldSpatialNode,
  canRunBackgroundWorldSubsystem,
  contextHasCapability,
  getWorldEntityReference,
  listCoLocatedWorldEntityIds,
  listWorldContexts,
  moveWorldEntityLocation,
  registerWorldEntityReference,
} from '@/mods/mod-world'
import { getRelationshipSystem } from '@/mods/mod-social/relationship-system-api'

import {
  selectNpcSystemPersistenceState,
  useNpcSystemStore,
} from '../store'

const NPC_OPERATIONS = new Set([
  'create-identity',
  'set-context-state',
  'set-goal',
  'record-behavior',
  'record-memory',
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${label}包含未知字段：${unknown.join('、')}`)
}

function assertOperationPayloadKeys(operation: string, payload: unknown): asserts payload is Record<string, unknown> {
  if (!isPlainRecord(payload)) throw new Error('NPC 系统指令变更必须是对象')
  const allowed = NPC_SYSTEM_OPERATION_FIELDS[operation as keyof typeof NPC_SYSTEM_OPERATION_FIELDS]
  if (!allowed) throw new Error('NPC 系统指令操作无效')
  const unexpected = Object.keys(payload).filter((field) => !(allowed as readonly string[]).includes(field))
  if (unexpected.length > 0) throw new Error(`NPC 操作 ${operation} 不接受字段：${unexpected.join('、')}`)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function requireString(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${label}不能为空`)
  return normalized
}

function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`)
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label}不能包含重复项`)
  return normalized
}

function stringList(value: unknown): string[] {
  if (value === undefined) return []
  return requireStringList(value, '字符串列表')
}

function requireFiniteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的有限数`)
  }
  return value
}

function requireTotalDays(value: unknown, label: string): number {
  const totalDays = requireFiniteNumber(value, label, 0, Number.MAX_SAFE_INTEGER)
  if (!Number.isInteger(totalDays)) throw new Error(`${label}必须是非负整数`)
  return totalDays
}

function assertNpcContext(npcId: string, contextId: string, label: string): void {
  const instance = listWorldContexts().find((item) => item.record.id === contextId)
  if (!instance) throw new Error(`${label}引用未知上下文：${contextId}`)
  if (!instance.capabilityProfile.capabilities.includes('npc')) {
    throw new Error(`${label}引用未启用 NPC 能力的上下文：${contextId}`)
  }
  const reference = assertWorldEntityReference(npcId, ['npc'])
  if (!reference.contextIds.includes(contextId)) {
    throw new Error(`${label}中的 NPC 不在上下文可见范围：${contextId}`)
  }
}

function plannedNpcReferenceForEntityId(
  entityId: string,
  context: RoundContext,
  packageChanges?: readonly SubSystemChanges[],
): EntityReference | undefined {
  const candidates = (packageChanges ?? []).filter((item) => (
    item.id === 'npc-system'
      && item.operation === 'create-identity'
      && item.targetObjectId === entityId
      && item.targetContextId === context.contextId
  ))
  if (candidates.length === 0) return undefined
  if (candidates.length > 1) throw new Error(`同一回合重复创建 NPC 身份：${entityId}`)
  const candidate = candidates[0]
  const displayName = typeof candidate.changes.displayName === 'string'
    ? candidate.changes.displayName.trim()
    : ''
  if (!displayName) throw new Error(`新建 NPC 必须提供显示名：${entityId}`)
  return {
    entityId,
    kind: 'npc',
    displayName,
    contextIds: [context.contextId],
    registeredAtTotalDays: context.totalDays,
  }
}

function plannedNpcReference(
  changes: SubSystemChanges,
  context: RoundContext,
  packageChanges?: readonly SubSystemChanges[],
): EntityReference | undefined {
  return plannedNpcReferenceForEntityId(
    changes.targetObjectId as string,
    context,
    packageChanges ?? [changes],
  )
}

function resolveNpcReference(
  changes: SubSystemChanges,
  context: RoundContext,
  packageChanges?: readonly SubSystemChanges[],
): EntityReference {
  const entityId = changes.targetObjectId as string
  const existing = getWorldEntityReference(entityId)
  if (existing) {
    if (existing.kind !== 'npc') throw new Error(`实体引用 ${entityId} 的种类不符合 NPC 要求`)
    return existing
  }
  const planned = plannedNpcReferenceForEntityId(entityId, context, packageChanges ?? [changes])
  if (!planned) throw new Error(`实体引用不存在：${entityId}`)
  return planned
}

function resolveEntityReference(
  entityId: string,
  changes: SubSystemChanges,
  context: RoundContext,
  packageChanges?: readonly SubSystemChanges[],
): EntityReference {
  const existing = getWorldEntityReference(entityId)
  if (existing) return existing
  const planned = plannedNpcReferenceForEntityId(entityId, context, packageChanges ?? [changes])
  if (planned?.entityId === entityId) return planned
  throw new Error(`实体引用不存在：${entityId}`)
}

function assertEntityVisibleInContext(
  entityId: string,
  contextId: string,
  label: string,
  changes?: SubSystemChanges,
  context?: RoundContext,
  packageChanges?: readonly SubSystemChanges[],
): void {
  const reference = changes && context
    ? resolveEntityReference(entityId, changes, context, packageChanges)
    : assertWorldEntityReference(entityId)
  if (!reference.contextIds.includes(contextId)) {
    throw new Error(`${label}不在上下文 ${contextId} 可见范围`)
  }
}

function validateEvidence(value: unknown, contextId: string, label = 'NPC 依据事件'): string[] {
  const eventIds = requireStringList(value, label)
  for (const eventId of eventIds) {
    const event = getHistoricalEvent(eventId)
    if (!event || event.status === 'void') throw new Error(`NPC 引用的历史事件不存在或已作废：${eventId}`)
    if (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId)) {
      throw new Error(`NPC 引用的历史事件不属于上下文 ${contextId}：${eventId}`)
    }
  }
  return eventIds
}

function assertAcyclicMemorySources(memories: readonly NpcMemory[]): void {
  const byId = new Map(memories.map((memory) => [memory.memoryId, memory]))
  const completed = new Set<string>()
  const visiting = new Set<string>()
  const visit = (memoryId: string): void => {
    if (completed.has(memoryId)) return
    if (visiting.has(memoryId)) throw new Error(`NPC 记忆来源成环：${memoryId}`)
    visiting.add(memoryId)
    for (const sourceId of byId.get(memoryId)?.sourceMemoryIds ?? []) visit(sourceId)
    visiting.delete(memoryId)
    completed.add(memoryId)
  }
  for (const memory of memories) visit(memory.memoryId)
}

function validatePersistenceState(snapshot: unknown): NpcSystemPersistenceState {
  if (!isPlainRecord(snapshot) || snapshot.schemaVersion !== 1) throw new Error('NPC 快照必须是 schemaVersion: 1')
  const record = snapshot as Record<string, unknown>
  const keys = ['identities', 'contextStates', 'goals', 'behaviorRecords', 'memories', 'memoryCompressions'] as const
  assertKnownKeys(record, ['schemaVersion', ...keys], 'NPC 快照')
  for (const key of keys) if (!Array.isArray(record[key])) throw new Error(`NPC 快照缺少完整数组：${key}`)
  const identityIds = new Set<string>()
  const goalIds = new Set<string>()
  const behaviorIds = new Set<string>()
  const memoryIds = new Set<string>()
  const compressionIds = new Set<string>()
  const identities = (record.identities as unknown[]).map((value, index) => {
    if (!isPlainRecord(value)) throw new Error(`identities[${index}] 必须是对象`)
    assertKnownKeys(value, ['npcId', 'displayName', 'creationSource', 'bornAtTotalDays', 'stableTraits', 'availability'], `identities[${index}]`)
    const npcId = requireString(value.npcId, `identities[${index}].npcId`)
    if (identityIds.has(npcId)) throw new Error(`NPC 身份 ID 重复：${npcId}`)
    assertWorldEntityReference(npcId, ['npc'])
    if (value.availability !== 'available' && value.availability !== 'unavailable') {
      throw new Error(`identities[${index}].availability 无效`)
    }
    const identity: NpcIdentity = {
      npcId,
      displayName: requireString(value.displayName, `identities[${index}].displayName`),
      creationSource: requireString(value.creationSource, `identities[${index}].creationSource`),
      bornAtTotalDays: requireTotalDays(value.bornAtTotalDays, `identities[${index}].bornAtTotalDays`),
      stableTraits: requireStringList(value.stableTraits, `identities[${index}].stableTraits`),
      availability: value.availability,
    }
    identityIds.add(npcId)
    return identity
  })
  const contextStateKeys = new Set<string>()
  const contextStates = (record.contextStates as unknown[]).map((value, index) => {
    if (!isPlainRecord(value)) throw new Error(`contextStates[${index}] 必须是对象`)
    assertKnownKeys(value, ['npcId', 'contextId', 'localName', 'stance', 'role', 'localRuleModifiers'], `contextStates[${index}]`)
    const npcId = requireString(value.npcId, `contextStates[${index}].npcId`)
    const contextId = requireString(value.contextId, `contextStates[${index}].contextId`)
    if (!identityIds.has(npcId)) throw new Error(`contextStates[${index}] 引用未知 NPC`)
    assertNpcContext(npcId, contextId, `contextStates[${index}]`)
    const key = `${npcId}\u0000${contextId}`
    if (contextStateKeys.has(key)) throw new Error(`NPC 当地状态重复：${npcId} @ ${contextId}`)
    if (!isPlainRecord(value.localRuleModifiers)) throw new Error(`contextStates[${index}].localRuleModifiers 必须是对象`)
    const localRuleModifiers = Object.fromEntries(Object.entries(value.localRuleModifiers).map(([name, modifier]) => [
      requireString(name, `contextStates[${index}].localRuleModifiers 键`),
      requireFiniteNumber(modifier, `contextStates[${index}].localRuleModifiers.${name}`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ]))
    contextStateKeys.add(key)
    return {
      npcId,
      contextId,
      ...(value.localName === undefined
        ? {}
        : { localName: requireString(value.localName, `contextStates[${index}].localName`) }),
      stance: typeof value.stance === 'string' ? value.stance : (() => { throw new Error(`contextStates[${index}].stance 必须是字符串`) })(),
      role: typeof value.role === 'string' ? value.role : (() => { throw new Error(`contextStates[${index}].role 必须是字符串`) })(),
      localRuleModifiers,
    }
  })
  const goals = (record.goals as unknown[]).map((value, index) => {
    if (!isPlainRecord(value)) throw new Error(`goals[${index}] 必须是对象`)
    assertKnownKeys(value, ['goalId', 'npcId', 'contextId', 'status', 'description', 'targetEntityIds', 'createdAtTotalDays', 'historicalEventIds'], `goals[${index}]`)
    const goalId = requireString(value.goalId, `goals[${index}].goalId`)
    if (goalIds.has(goalId)) throw new Error(`目标 ID 重复：${goalId}`)
    const npcId = requireString(value.npcId, `goals[${index}].npcId`)
    const contextId = requireString(value.contextId, `goals[${index}].contextId`)
    if (!identityIds.has(npcId)) throw new Error(`goals[${index}] 引用未知 NPC`)
    assertNpcContext(npcId, contextId, `goals[${index}]`)
    if (value.status !== 'active' && value.status !== 'fulfilled' && value.status !== 'abandoned') {
      throw new Error(`goals[${index}].status 无效`)
    }
    const targetEntityIds = requireStringList(value.targetEntityIds, `goals[${index}].targetEntityIds`)
    targetEntityIds.forEach((entityId) => assertEntityVisibleInContext(entityId, contextId, `goals[${index}] 目标实体 ${entityId}`))
    const goal: NpcGoal = {
      goalId,
      npcId,
      contextId,
      status: value.status,
      description: requireString(value.description, `goals[${index}].description`),
      targetEntityIds,
      createdAtTotalDays: requireTotalDays(value.createdAtTotalDays, `goals[${index}].createdAtTotalDays`),
      historicalEventIds: validateEvidence(value.historicalEventIds, contextId, `goals[${index}].historicalEventIds`),
    }
    goalIds.add(goalId)
    return goal
  })
  const behaviorRecords = (record.behaviorRecords as unknown[]).map((value, index) => {
    if (!isPlainRecord(value)) throw new Error(`behaviorRecords[${index}] 必须是对象`)
    assertKnownKeys(value, ['behaviorId', 'npcId', 'contextId', 'operation', 'description', 'targetEntityIds', 'spatialNodeId', 'occurredAtTotalDays', 'historicalEventIds', 'source'], `behaviorRecords[${index}]`)
    const behaviorId = requireString(value.behaviorId, `behaviorRecords[${index}].behaviorId`)
    if (behaviorIds.has(behaviorId)) throw new Error(`行为 ID 重复：${behaviorId}`)
    const npcId = requireString(value.npcId, `behaviorRecords[${index}].npcId`)
    const contextId = requireString(value.contextId, `behaviorRecords[${index}].contextId`)
    if (!identityIds.has(npcId)) throw new Error(`behaviorRecords[${index}] 引用未知 NPC`)
    assertNpcContext(npcId, contextId, `behaviorRecords[${index}]`)
    const targetEntityIds = requireStringList(value.targetEntityIds, `behaviorRecords[${index}].targetEntityIds`)
    targetEntityIds.forEach((entityId) => assertEntityVisibleInContext(entityId, contextId, `behaviorRecords[${index}] 目标实体 ${entityId}`))
    const spatialNodeId = value.spatialNodeId === undefined
      ? undefined
      : requireString(value.spatialNodeId, `behaviorRecords[${index}].spatialNodeId`)
    if (spatialNodeId) assertWorldSpatialNode(contextId, spatialNodeId)
    if (value.source !== 'instruction' && value.source !== 'background-aggregate' && value.source !== 'dormant-catch-up') {
      throw new Error(`behaviorRecords[${index}].source 无效`)
    }
    const behavior: NpcBehaviorRecord = {
      behaviorId,
      npcId,
      contextId,
      operation: requireString(value.operation, `behaviorRecords[${index}].operation`),
      description: requireString(value.description, `behaviorRecords[${index}].description`),
      targetEntityIds,
      ...(spatialNodeId ? { spatialNodeId } : {}),
      occurredAtTotalDays: requireTotalDays(value.occurredAtTotalDays, `behaviorRecords[${index}].occurredAtTotalDays`),
      historicalEventIds: validateEvidence(value.historicalEventIds, contextId, `behaviorRecords[${index}].historicalEventIds`),
      source: value.source,
    }
    behaviorIds.add(behaviorId)
    return behavior
  })
  for (const [index, value] of (record.memories as unknown[]).entries()) {
    if (!isPlainRecord(value)) throw new Error(`memories[${index}] 必须是对象`)
    assertKnownKeys(value, ['memoryId', 'npcId', 'contextId', 'sourceKind', 'sourceId', 'summary', 'emotion', 'relatedEntityIds', 'createdAtTotalDays', 'sourceMemoryIds'], `memories[${index}]`)
    const memoryId = requireString(value.memoryId, `memories[${index}].memoryId`)
    if (memoryIds.has(memoryId)) throw new Error(`记忆 ID 重复：${memoryId}`)
    memoryIds.add(memoryId)
  }
  const memories = (record.memories as unknown[]).map((value, index) => {
    const raw = value as Record<string, unknown>
    const memoryId = requireString(raw.memoryId, `memories[${index}].memoryId`)
    const npcId = requireString(raw.npcId, `memories[${index}].npcId`)
    const contextId = requireString(raw.contextId, `memories[${index}].contextId`)
    if (!identityIds.has(npcId)) throw new Error(`memories[${index}] 引用未知 NPC`)
    assertNpcContext(npcId, contextId, `memories[${index}]`)
    const sourceKind = raw.sourceKind
    if (sourceKind !== 'historical-event' && sourceKind !== 'relationship-transition' && sourceKind !== 'behavior') {
      throw new Error(`memories[${index}].sourceKind 无效`)
    }
    const sourceId = requireString(raw.sourceId, `memories[${index}].sourceId`)
    if (sourceKind === 'historical-event') {
      validateEvidence([sourceId], contextId, `memories[${index}].sourceId`)
    } else if (sourceKind === 'relationship-transition') {
      const transition = getRelationshipSystem().getTransition(sourceId)
      if (!transition || transition.contextId !== contextId) throw new Error(`memories[${index}] 引用未知关系迁移`)
    } else if (!behaviorIds.has(sourceId)) {
      throw new Error(`memories[${index}] 引用未知行为记录`)
    }
    const relatedEntityIds = requireStringList(raw.relatedEntityIds, `memories[${index}].relatedEntityIds`)
    relatedEntityIds.forEach((entityId) => assertEntityVisibleInContext(entityId, contextId, `memories[${index}] 关联实体 ${entityId}`))
    const sourceMemoryIds = requireStringList(raw.sourceMemoryIds, `memories[${index}].sourceMemoryIds`)
    for (const sourceMemoryId of sourceMemoryIds) {
      if (!memoryIds.has(sourceMemoryId) || sourceMemoryId === memoryId) {
        throw new Error(`memories[${index}] 引用未知或自身来源记忆`)
      }
    }
    const memory: NpcMemory = {
      memoryId,
      npcId,
      contextId,
      sourceKind,
      sourceId,
      summary: requireString(raw.summary, `memories[${index}].summary`),
      emotion: requireFiniteNumber(raw.emotion, `memories[${index}].emotion`, -10, 10),
      relatedEntityIds,
      createdAtTotalDays: requireTotalDays(raw.createdAtTotalDays, `memories[${index}].createdAtTotalDays`),
      sourceMemoryIds,
    }
    return memory
  })
  const memoriesById = new Map(memories.map((memory) => [memory.memoryId, memory]))
  for (const memory of memories) {
    for (const sourceMemoryId of memory.sourceMemoryIds) {
      const source = memoriesById.get(sourceMemoryId)!
      if (source.npcId !== memory.npcId || source.contextId !== memory.contextId) {
        throw new Error(`记忆来源必须属于同一 NPC 和上下文：${memory.memoryId}`)
      }
    }
  }
  assertAcyclicMemorySources(memories)
  const memoryCompressions = (record.memoryCompressions as unknown[]).map((value, index) => {
    if (!isPlainRecord(value)) throw new Error(`memoryCompressions[${index}] 必须是对象`)
    assertKnownKeys(value, ['compressionId', 'npcId', 'contextId', 'summary', 'sourceMemoryIds', 'createdAtTotalDays'], `memoryCompressions[${index}]`)
    const compressionId = requireString(value.compressionId, `memoryCompressions[${index}].compressionId`)
    if (compressionIds.has(compressionId)) throw new Error(`记忆合并 ID 重复：${compressionId}`)
    const npcId = requireString(value.npcId, `memoryCompressions[${index}].npcId`)
    const contextId = requireString(value.contextId, `memoryCompressions[${index}].contextId`)
    if (!identityIds.has(npcId)) throw new Error(`memoryCompressions[${index}] 引用未知 NPC`)
    assertNpcContext(npcId, contextId, `memoryCompressions[${index}]`)
    const sourceMemoryIds = requireStringList(value.sourceMemoryIds, `memoryCompressions[${index}].sourceMemoryIds`)
    for (const memoryId of sourceMemoryIds) {
      const memory = memoriesById.get(memoryId)
      if (!memory || memory.npcId !== npcId || memory.contextId !== contextId) {
        throw new Error(`memoryCompressions[${index}] 引用其他 NPC、上下文或未知来源记忆`)
      }
    }
    compressionIds.add(compressionId)
    return {
      compressionId,
      npcId,
      contextId,
      summary: requireString(value.summary, `memoryCompressions[${index}].summary`),
      sourceMemoryIds,
      createdAtTotalDays: requireTotalDays(value.createdAtTotalDays, `memoryCompressions[${index}].createdAtTotalDays`),
    }
  })
  return {
    schemaVersion: 1,
    identities,
    contextStates,
    goals,
    behaviorRecords,
    memories,
    memoryCompressions,
  }
}

function ageYears(bornAtTotalDays: number, totalDays: number): number {
  return Math.max(0, Math.floor((totalDays - bornAtTotalDays) / 365))
}

function latestOccurredAtTotalDays<T extends { occurredAtTotalDays: number }>(items: readonly T[]): number | undefined {
  return items.reduce<number | undefined>((latest, item) => (
    latest === undefined || item.occurredAtTotalDays > latest ? item.occurredAtTotalDays : latest
  ), undefined)
}

function latestCreatedAtTotalDays<T extends { createdAtTotalDays: number }>(items: readonly T[]): number | undefined {
  return items.reduce<number | undefined>((latest, item) => (
    latest === undefined || item.createdAtTotalDays > latest ? item.createdAtTotalDays : latest
  ), undefined)
}

export class NpcSystem extends BaseSubsystem {
  readonly id = 'npc-system' as const
  readonly mod = 'mod-npc' as const
  readonly label = 'NPC 系统' as const
  readonly description = '拥有 NPC 连续身份、当地状态、目标、行为和主观记忆' as const

  collectState(context: RoundContext): SubSystemState {
    if (!contextHasCapability(context.contextId, 'npc')) {
      return { id: this.id, summary: '', data: { enabled: false, contextId: context.contextId, npcs: [] } }
    }
    const state = selectNpcSystemPersistenceState()
    const contextNpcIds = new Set(state.contextStates.filter((item) => item.contextId === context.contextId).map((item) => item.npcId))
    const sceneEntityIds = new Set(listCoLocatedWorldEntityIds(context.contextId, context.characterId))
    const sceneNodeId = listWorldContexts()
      .find((instance) => instance.record.id === context.contextId)
      ?.spatialGraph.entityLocations[context.characterId]?.nodeId
    const relationships = getRelationshipSystem().getRelationshipsForEntities([...sceneEntityIds], context.contextId)
    const relevantEntityIds = new Set(sceneEntityIds)
    for (const relationship of relationships) {
      relevantEntityIds.add(relationship.fromEntityId)
      relevantEntityIds.add(relationship.toEntityId)
    }
    const npcs = state.identities
      .filter((identity) => contextNpcIds.has(identity.npcId) && relevantEntityIds.has(identity.npcId))
      .map((identity) => {
        const behaviors = state.behaviorRecords.filter((item) => (
          item.npcId === identity.npcId && item.contextId === context.contextId
        ))
        const memories = state.memories.filter((item) => (
          item.npcId === identity.npcId && item.contextId === context.contextId
        ))
        const latestBehaviorDay = latestOccurredAtTotalDays(behaviors)
        const latestMemoryDay = latestCreatedAtTotalDays(memories)
        return {
          npcId: identity.npcId,
          displayName: identity.displayName,
          availability: identity.availability,
          ageYears: ageYears(identity.bornAtTotalDays, context.totalDays),
          contextState: state.contextStates.find((item) => item.npcId === identity.npcId && item.contextId === context.contextId),
          goals: state.goals.filter((item) => (
            item.npcId === identity.npcId
            && item.contextId === context.contextId
            && item.status === 'active'
          )),
          behaviors: behaviors.filter((item) => (
            item.occurredAtTotalDays === latestBehaviorDay
            || item.targetEntityIds.some((entityId) => relevantEntityIds.has(entityId))
            || (sceneNodeId !== undefined && item.spatialNodeId === sceneNodeId)
          )),
          memories: memories.filter((item) => (
            item.createdAtTotalDays === latestMemoryDay
            || item.relatedEntityIds.some((entityId) => relevantEntityIds.has(entityId))
          )),
        }
      })
    return {
      id: this.id,
      summary: `【${this.label}：当前上下文 ${npcs.length} 名】`,
      data: { enabled: true, contextId: context.contextId, npcs: clone(npcs) },
    }
  }

  advance(context: RoundContext): void {
    const state = useNpcSystemStore.getState()
    const appended: NpcBehaviorRecord[] = []
    for (const instance of listWorldContexts()) {
      const contextId = instance.record.id
      if (!contextHasCapability(contextId, 'npc')) continue
      if (instance.scope.scope === 'background' && canRunBackgroundWorldSubsystem(contextId, this.id)) {
        for (const goal of state.goals.filter((item) => item.contextId === contextId && item.status === 'active')) {
          const behaviorId = `npc-background:${encodeURIComponent(goal.npcId)}:${encodeURIComponent(contextId)}:${context.totalDays}:${encodeURIComponent(goal.goalId)}`
          if (state.behaviorRecords.some((item) => item.behaviorId === behaviorId)) continue
          appended.push({
            behaviorId,
            npcId: goal.npcId,
            contextId,
            operation: 'background-progress',
            description: `围绕目标“${goal.description}”进行后台进展观察`,
            targetEntityIds: [...goal.targetEntityIds],
            occurredAtTotalDays: context.totalDays,
            historicalEventIds: [],
            source: 'background-aggregate',
          })
        }
      }
      if (instance.scope.scope === 'active'
        && instance.scope.reason === '角色到达上下文'
        && instance.scope.changedAtGlobalDay < context.totalDays) {
        for (const goal of state.goals.filter((item) => item.contextId === contextId && item.status === 'active')) {
          const behaviorId = `npc-catch-up:${encodeURIComponent(goal.npcId)}:${encodeURIComponent(contextId)}:${instance.scope.changedAtGlobalDay}`
          if (state.behaviorRecords.some((item) => item.behaviorId === behaviorId)) continue
          appended.push({
            behaviorId,
            npcId: goal.npcId,
            contextId,
            operation: 'dormant-catch-up',
            description: `根据离开后的规范时间完成一次可追踪追赶结果：${goal.description}`,
            targetEntityIds: [...goal.targetEntityIds],
            occurredAtTotalDays: context.totalDays,
            historicalEventIds: [],
            source: 'dormant-catch-up',
          })
        }
      }
    }
    if (appended.length > 0) useNpcSystemStore.setState({ behaviorRecords: [...state.behaviorRecords, ...appended] })
  }

  preflightChanges(
    changes: SubSystemChanges,
    context: RoundContext,
    packageChanges?: readonly SubSystemChanges[],
  ): void {
    if (changes.id !== this.id) throw new Error('NPC 系统指令目标不匹配')
    if (!changes.targetObjectId || !changes.targetContextId || changes.targetContextId !== context.contextId) throw new Error('NPC 系统指令缺少当前稳定目标或上下文')
    if (!changes.operation || !NPC_OPERATIONS.has(changes.operation)) throw new Error('NPC 系统指令操作无效')
    if (!contextHasCapability(context.contextId, 'npc')) throw new Error('目标上下文未启用 NPC 能力')
    requireString(changes.description, 'NPC 系统指令说明')
    const npc = resolveNpcReference(changes, context, packageChanges)
    if (!npc.contextIds.includes(context.contextId)) throw new Error('NPC 不在目标上下文可见范围')
    const evidenceIds = changes.evidenceEventIds ?? []
    validateEvidence(evidenceIds, context.contextId)
    const payload = changes.changes
    assertOperationPayloadKeys(changes.operation, payload)
    if (changes.operation === 'create-identity') {
      if (useNpcSystemStore.getState().identities.some((identity) => identity.npcId === npc.entityId)) {
        throw new Error(`NPC 身份已存在：${npc.entityId}`)
      }
      if (payload.displayName !== undefined) requireString(payload.displayName, 'NPC 显示名')
      if (payload.creationSource !== undefined) requireString(payload.creationSource, 'NPC 创建来源')
      if (payload.stableTraits !== undefined) requireStringList(payload.stableTraits, 'NPC 稳定特质')
    }
    if (changes.operation === 'set-context-state') {
      if (payload.localName !== undefined) requireString(payload.localName, 'NPC 当地称呼')
      if (payload.stance !== undefined && typeof payload.stance !== 'string') throw new Error('NPC 立场必须是字符串')
      if (payload.role !== undefined && typeof payload.role !== 'string') throw new Error('NPC 角色必须是字符串')
      if (payload.localRuleModifiers !== undefined) {
        if (!isPlainRecord(payload.localRuleModifiers)) throw new Error('NPC 当地规则修正必须是对象')
        for (const [name, value] of Object.entries(payload.localRuleModifiers)) {
          requireString(name, 'NPC 当地规则修正键')
          requireFiniteNumber(value, `NPC 当地规则修正 ${name}`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
        }
      }
    }
    if (changes.operation === 'set-goal') {
      if (typeof payload.description !== 'string' || !payload.description.trim()) throw new Error('NPC 目标缺少描述')
      const targetEntityIds = stringList(payload.targetEntityIds)
      targetEntityIds.forEach((entityId) => assertEntityVisibleInContext(
        entityId,
        context.contextId,
        `NPC 目标实体 ${entityId}`,
        changes,
        context,
        packageChanges,
      ))
    }
    if (changes.operation === 'record-behavior') {
      if (payload.behaviorOperation !== undefined) requireString(payload.behaviorOperation, 'NPC 行为操作')
      stringList(payload.targetEntityIds).forEach((entityId) => assertEntityVisibleInContext(
        entityId,
        context.contextId,
        `NPC 行为目标 ${entityId}`,
        changes,
        context,
        packageChanges,
      ))
      if (payload.spatialNodeId) assertWorldSpatialNode(context.contextId, String(payload.spatialNodeId))
    }
    if (changes.operation === 'record-memory') {
      if (typeof payload.summary !== 'string' || !payload.summary.trim()) throw new Error('NPC 记忆缺少主观摘要')
      if (payload.emotion !== undefined) requireFiniteNumber(payload.emotion, 'NPC 记忆情绪值', -10, 10)
      stringList(payload.relatedEntityIds).forEach((entityId) => assertEntityVisibleInContext(
        entityId,
        context.contextId,
        `NPC 记忆关联实体 ${entityId}`,
        changes,
        context,
        packageChanges,
      ))
      const sourceMemoryIds = stringList(payload.sourceMemoryIds)
      const state = useNpcSystemStore.getState()
      for (const memoryId of sourceMemoryIds) {
        const source = state.memories.find((memory) => memory.memoryId === memoryId)
        if (!source || source.npcId !== npc.entityId || source.contextId !== context.contextId) {
          throw new Error(`NPC 记忆引用其他 NPC、上下文或未知来源记忆：${memoryId}`)
        }
      }
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error('NPC 系统指令必须是对象')
    if (changes.id !== this.id) throw new Error('NPC 系统指令目标不匹配')
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error('NPC 系统指令变更必须是对象')
    }
    if (!changes.description || changes.description.trim() === '') throw new Error('NPC 系统指令说明不能为空')
    const payload = changes.changes
    this.preflightChanges(changes, context)
    const state = useNpcSystemStore.getState()
    const npcId = changes.targetObjectId as string
    const operation = changes.operation
    const evidenceEventIds = [...(changes.evidenceEventIds ?? [])]
    if (operation === 'create-identity') {
      if (state.identities.some((item) => item.npcId === npcId)) throw new Error(`NPC 身份已存在：${npcId}`)
      if (!getWorldEntityReference(npcId)) {
        const planned = plannedNpcReference(changes, context)
        if (!planned) throw new Error(`新建 NPC 缺少可登记的实体引用：${npcId}`)
        registerWorldEntityReference(planned)
      }
      const identity: NpcIdentity = {
        npcId,
        displayName: typeof payload.displayName === 'string' ? payload.displayName : assertWorldEntityReference(npcId).displayName,
        creationSource: typeof payload.creationSource === 'string' ? payload.creationSource : 'narrative-instruction',
        bornAtTotalDays: context.totalDays,
        stableTraits: stringList(payload.stableTraits),
        availability: 'available',
      }
      useNpcSystemStore.setState({ identities: [...state.identities, identity] })
      return
    }
    if (!state.identities.some((item) => item.npcId === npcId)) throw new Error(`NPC 身份尚未建立：${npcId}`)
    if (operation === 'set-context-state') {
      const nextState: NpcContextState = {
        npcId,
        contextId: context.contextId,
        localName: typeof payload.localName === 'string' ? payload.localName : undefined,
        stance: typeof payload.stance === 'string' ? payload.stance : '',
        role: typeof payload.role === 'string' ? payload.role : '',
        localRuleModifiers: isPlainRecord(payload.localRuleModifiers)
          ? Object.entries(payload.localRuleModifiers).reduce<Record<string, number>>((result, [key, value]) => {
              if (typeof value === 'number') result[key] = value
              return result
            }, {})
          : {},
      }
      const remaining = state.contextStates.filter((item) => !(item.npcId === npcId && item.contextId === context.contextId))
      useNpcSystemStore.setState({ contextStates: [...remaining, nextState] })
      return
    }
    if (operation === 'set-goal') {
      const goal: NpcGoal = {
        goalId: `npc-goal:${encodeURIComponent(npcId)}:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.goals.length}`,
        npcId,
        contextId: context.contextId,
        status: 'active',
        description: String(payload.description),
        targetEntityIds: stringList(payload.targetEntityIds),
        createdAtTotalDays: context.totalDays,
        historicalEventIds: evidenceEventIds,
      }
      useNpcSystemStore.setState({ goals: [...state.goals, goal] })
      return
    }
    if (operation === 'record-behavior') {
      const behavior: NpcBehaviorRecord = {
        behaviorId: `npc-behavior:${encodeURIComponent(npcId)}:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.behaviorRecords.length}`,
        npcId,
        contextId: context.contextId,
        operation: typeof payload.behaviorOperation === 'string' ? payload.behaviorOperation : 'observe',
        description: changes.description,
        targetEntityIds: stringList(payload.targetEntityIds),
        spatialNodeId: typeof payload.spatialNodeId === 'string' ? payload.spatialNodeId : undefined,
        occurredAtTotalDays: context.totalDays,
        historicalEventIds: evidenceEventIds,
        source: 'instruction',
      }
      if (behavior.spatialNodeId) {
        moveWorldEntityLocation({
          entityId: npcId,
          contextId: context.contextId,
          nodeId: behavior.spatialNodeId,
          updatedAtGlobalDay: context.totalDays,
        })
      }
      useNpcSystemStore.setState({ behaviorRecords: [...state.behaviorRecords, behavior] })
      return
    }
    const nextBehaviorRecords = [...state.behaviorRecords]
    const memorySourceKind: NpcMemory['sourceKind'] = evidenceEventIds.length > 0 ? 'historical-event' : 'behavior'
    let memorySourceId: string | undefined = evidenceEventIds[0]
    if (operation === 'record-memory' && memorySourceKind === 'behavior') {
      const behaviorId = `npc-behavior:${encodeURIComponent(npcId)}:${encodeURIComponent(context.contextId)}:${context.totalDays}:${nextBehaviorRecords.length}`
      nextBehaviorRecords.push({
        behaviorId,
        npcId,
        contextId: context.contextId,
        operation: 'memory-source',
        description: changes.description,
        targetEntityIds: stringList(payload.relatedEntityIds),
        occurredAtTotalDays: context.totalDays,
        historicalEventIds: [],
        source: 'instruction',
      })
      memorySourceId = behaviorId
    }
    const memory: NpcMemory = {
      memoryId: `npc-memory:${encodeURIComponent(npcId)}:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.memories.length}`,
      npcId,
      contextId: context.contextId,
      sourceKind: memorySourceKind,
      sourceId: memorySourceId ?? `round:${context.roundSequence ?? 0}`,
      summary: String(payload.summary),
      emotion: typeof payload.emotion === 'number' ? Math.max(-10, Math.min(10, payload.emotion)) : 0,
      relatedEntityIds: stringList(payload.relatedEntityIds),
      createdAtTotalDays: context.totalDays,
      sourceMemoryIds: stringList(payload.sourceMemoryIds),
    }
    useNpcSystemStore.setState({
      behaviorRecords: nextBehaviorRecords,
      memories: [...state.memories, memory],
    })
  }

  capturePersistenceState(): NpcSystemPersistenceState {
    return validatePersistenceState(selectNpcSystemPersistenceState())
  }

  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) {
      useNpcSystemStore.getState().reset()
      return
    }
    useNpcSystemStore.getState().replacePersistenceState(validatePersistenceState(snapshot))
  }

  capturePreviewState(): NpcSystemPersistenceState {
    return this.capturePersistenceState()
  }

  restorePreviewState(snapshot: unknown): void {
    this.restorePersistenceState(snapshot)
  }

  reset(): void {
    useNpcSystemStore.getState().reset()
  }
}

let runtimeNpcSystem: NpcSystem | undefined

export function getNpcSystem(): NpcSystem {
  runtimeNpcSystem ??= new NpcSystem()
  return runtimeNpcSystem
}
