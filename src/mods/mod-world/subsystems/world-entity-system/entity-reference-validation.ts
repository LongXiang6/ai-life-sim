/**
 * Purpose: Validate entity-reference entries and persisted directory snapshots.
 * Owner: mod-world / world-entity.
 * Responsibility: Contract validation only; no Store mutation or lifecycle orchestration.
 */

import type { EntityReference } from '@/foundation'
import type { WorldContextInstance } from '../../types'

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function cloneEntityReference(reference: EntityReference): EntityReference {
  return structuredClone(reference)
}

export function validateEntityReference(
  reference: EntityReference,
  contexts: Record<string, WorldContextInstance>,
): EntityReference {
  if (!isPlainRecord(reference)) throw new Error('实体引用必须是对象')
  const unknownKeys = Object.keys(reference).filter((key) => ![
    'entityId',
    'kind',
    'displayName',
    'contextIds',
    'registeredAtTotalDays',
  ].includes(key))
  if (unknownKeys.length > 0) throw new Error(`实体引用包含未知字段：${unknownKeys.join('、')}`)

  const entityId = typeof reference.entityId === 'string' ? reference.entityId.trim() : ''
  const displayName = typeof reference.displayName === 'string' ? reference.displayName.trim() : ''
  if (!entityId) throw new Error('实体引用缺少稳定实体 ID')
  if (!displayName) throw new Error(`实体引用 ${entityId} 缺少显示标签`)
  if (reference.kind !== 'player' && reference.kind !== 'npc' && reference.kind !== 'organization') {
    throw new Error(`实体引用 ${entityId} 的种类无效`)
  }
  if (!Array.isArray(reference.contextIds) || reference.contextIds.length === 0) {
    throw new Error(`实体引用 ${entityId} 必须声明至少一个可见上下文`)
  }
  const contextIds = reference.contextIds.map((contextId) => contextId.trim())
  if (contextIds.some((contextId) => !contextId)) {
    throw new Error(`实体引用 ${entityId} 含空上下文 ID`)
  }
  if (new Set(contextIds).size !== contextIds.length) {
    throw new Error(`实体引用 ${entityId} 含重复可见上下文`)
  }
  for (const contextId of contextIds) {
    if (!contexts[contextId]) throw new Error(`实体引用 ${entityId} 引用了不存在的上下文：${contextId}`)
  }
  if (!Number.isInteger(reference.registeredAtTotalDays) || reference.registeredAtTotalDays < 0) {
    throw new Error(`实体引用 ${entityId} 的登记时间无效`)
  }
  return {
    entityId,
    kind: reference.kind,
    displayName,
    contextIds,
    registeredAtTotalDays: reference.registeredAtTotalDays,
  }
}

export function validateEntityDirectorySnapshot(
  snapshot: unknown,
  contexts: Record<string, WorldContextInstance>,
): EntityReference[] {
  if (!isPlainRecord(snapshot) || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.entries)) {
    throw new Error('实体引用目录快照必须是 schemaVersion: 1 的完整条目数组')
  }
  const unknownSnapshotKeys = Object.keys(snapshot).filter((key) => key !== 'schemaVersion' && key !== 'entries')
  if (unknownSnapshotKeys.length > 0) {
    throw new Error(`实体引用目录快照包含未知字段：${unknownSnapshotKeys.join('、')}`)
  }

  const entries: EntityReference[] = []
  const ids = new Set<string>()
  for (const [index, raw] of snapshot.entries.entries()) {
    if (!isPlainRecord(raw)) throw new Error(`实体引用 entries[${index}] 必须是对象`)
    const unknownEntryKeys = Object.keys(raw).filter((key) => ![
      'entityId',
      'kind',
      'displayName',
      'contextIds',
      'registeredAtTotalDays',
    ].includes(key))
    if (unknownEntryKeys.length > 0) {
      throw new Error(`实体引用 entries[${index}] 包含未知字段：${unknownEntryKeys.join('、')}`)
    }

    const entityId = typeof raw.entityId === 'string' ? raw.entityId.trim() : ''
    if (!entityId || ids.has(entityId)) throw new Error(`实体引用 ID 非法或重复：${entityId || index}`)
    const entry = validateEntityReference(raw as unknown as EntityReference, contexts)
    ids.add(entityId)
    entries.push(entry)
  }

  const byId = new Map(entries.map((entry) => [entry.entityId, entry]))
  for (const instance of Object.values(contexts)) {
    for (const entity of instance.entities) {
      const entry = byId.get(entity.id)
      if (!entry || entry.kind !== 'organization' || !entry.contextIds.includes(instance.record.id)) {
        throw new Error(`世界实体 ${entity.id} 未在实体引用目录中完整登记`)
      }
    }
    for (const [entityId, location] of Object.entries(instance.spatialGraph.entityLocations)) {
      const entry = byId.get(entityId)
      if (!entry || !entry.contextIds.includes(instance.record.id)) {
        throw new Error(`已定位实体 ${entityId} 未在实体引用目录中登记当前上下文`)
      }
      if (location.entityId !== entityId || location.contextId !== instance.record.id) {
        throw new Error(`实体 ${entityId} 的空间位置端点不一致`)
      }
      if (!instance.spatialGraph.nodes[location.nodeId]) {
        throw new Error(`实体 ${entityId} 的空间位置引用未知节点`)
      }
    }
  }
  return entries
}
