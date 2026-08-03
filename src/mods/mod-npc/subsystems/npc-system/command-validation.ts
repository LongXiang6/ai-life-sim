/**
 * Purpose: Preflight NPC subsystem commands before the owning system mutates state.
 * Owner: mod-npc
 * Responsibility: Validate operation fields, targets, evidence, and operation-specific payload invariants.
 */

import type { RoundContext, SubSystemChanges } from '@/foundation'
import { NPC_SYSTEM_OPERATION_FIELDS } from '@/foundation'
import {
  assertWorldSpatialNode,
  contextHasCapability,
} from '@/mods/mod-world'

import { useNpcSystemStore } from '../../store'
import {
  isPlainRecord,
  requireFiniteNumber,
  requireString,
  requireStringList,
  stringList,
} from './common'
import {
  assertEntityVisibleInContext,
  resolveNpcReference,
  validateEvidence,
} from './entity-validation'

const NPC_OPERATIONS = new Set([
  'create-identity',
  'set-context-state',
  'set-goal',
  'record-behavior',
  'record-memory',
])

export function assertOperationPayloadKeys(operation: string, payload: unknown): asserts payload is Record<string, unknown> {
  if (!isPlainRecord(payload)) throw new Error('NPC 系统指令变更必须是对象')
  const allowed = NPC_SYSTEM_OPERATION_FIELDS[operation as keyof typeof NPC_SYSTEM_OPERATION_FIELDS]
  if (!allowed) throw new Error('NPC 系统指令操作无效')
  const unexpected = Object.keys(payload).filter((field) => !(allowed as readonly string[]).includes(field))
  if (unexpected.length > 0) throw new Error(`NPC 操作 ${operation} 不接受字段：${unexpected.join('、')}`)
}

export function preflightNpcChanges(
  changes: SubSystemChanges,
  context: RoundContext,
  packageChanges?: readonly SubSystemChanges[],
): void {
  if (changes.id !== 'npc-system') throw new Error('NPC 系统指令目标不匹配')
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

