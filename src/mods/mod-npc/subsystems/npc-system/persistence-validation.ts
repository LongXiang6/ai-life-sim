/**
 * Purpose: Validate complete NPC persistence snapshots before capture or restore.
 * Owner: mod-npc
 * Responsibility: Enforce schema, identity, context, evidence, and memory graph invariants without writing stores.
 */

import type {
  NpcBehaviorRecord,
  NpcGoal,
  NpcIdentity,
  NpcMemory,
  NpcSystemPersistenceState,
} from '@/foundation'
import { assertWorldEntityReference, assertWorldSpatialNode } from '@/mods/mod-world'
import { getRelationshipSystem } from '@/mods/mod-social/relationship-system-api'

import {
  assertKnownKeys,
  isPlainRecord,
  requireFiniteNumber,
  requireString,
  requireStringList,
  requireTotalDays,
} from './common'
import {
  assertEntityVisibleInContext,
  assertNpcContext,
  validateEvidence,
} from './entity-validation'

export function assertAcyclicMemorySources(memories: readonly NpcMemory[]): void {
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

export function validateNpcPersistenceState(snapshot: unknown): NpcSystemPersistenceState {
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

