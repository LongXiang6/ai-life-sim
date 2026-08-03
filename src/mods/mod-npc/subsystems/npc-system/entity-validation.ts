/**
 * Purpose: Resolve and validate NPC, world-entity, context, and historical-event references.
 * Owner: mod-npc
 * Responsibility: Enforce cross-system reference visibility without owning NPC state mutations.
 */

import type { EntityReference, RoundContext, SubSystemChanges } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import {
  assertWorldEntityReference,
  getWorldEntityReference,
  listWorldContexts,
} from '@/mods/mod-world'

import { requireStringList } from './common'

export function assertNpcContext(npcId: string, contextId: string, label: string): void {
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



export function plannedNpcReferenceForEntityId(
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

export function plannedNpcReference(
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

export function resolveNpcReference(
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

export function resolveEntityReference(
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

export function assertEntityVisibleInContext(
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

export function validateEvidence(value: unknown, contextId: string, label = 'NPC 依据事件'): string[] {
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
