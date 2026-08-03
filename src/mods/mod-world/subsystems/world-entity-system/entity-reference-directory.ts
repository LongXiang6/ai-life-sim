/**
 * Purpose: Execute entity-reference directory transactions, repair, and persistence projection.
 * Owner: mod-world / world-entity.
 * Responsibility: Directory state operations only; entity generation and subsystem scheduling stay outside.
 */

import type {
  EntityReference,
  EntityReferenceDirectoryPersistenceState,
  EntityReferenceKind,
  GlobalEntityId,
} from '@/foundation'
import { useWorldStore } from '../../store'
import {
  cloneEntityReference,
  isPlainRecord,
  validateEntityDirectorySnapshot,
  validateEntityReference,
} from './entity-reference-validation'

export function registerEntityReference(reference: EntityReference): EntityReference {
  const state = useWorldStore.getState()
  const validated = validateEntityReference(reference, state.contexts)
  state.registerEntityReference(validated)
  return assertEntityReference(validated.entityId)
}

export function getEntityReference(entityId: GlobalEntityId): EntityReference | undefined {
  const reference = useWorldStore.getState().entityReferences[entityId]
  return reference ? cloneEntityReference(reference) : undefined
}

export function listEntityReferences(): EntityReference[] {
  return Object.values(useWorldStore.getState().entityReferences).map(cloneEntityReference)
}

export function assertEntityReference(
  entityId: GlobalEntityId,
  allowedKinds?: readonly EntityReferenceKind[],
): EntityReference {
  const reference = getEntityReference(entityId)
  if (!reference) throw new Error(`实体引用不存在：${entityId}`)
  if (allowedKinds && !allowedKinds.includes(reference.kind)) {
    throw new Error(`实体引用 ${entityId} 的种类不符合要求`)
  }
  return reference
}

export function buildContextTransitionDirectory(input: {
  movedEntityIds: readonly GlobalEntityId[]
  sourceContextId: string
  targetContextId: string
  actorEntityId: GlobalEntityId
  globalTotalDays: number
}): Record<GlobalEntityId, EntityReference> {
  const state = useWorldStore.getState()
  if (!state.contexts[input.sourceContextId] || !state.contexts[input.targetContextId]) {
    throw new Error('实体目录切换事务引用了不存在的上下文')
  }
  if (!Number.isInteger(input.globalTotalDays) || input.globalTotalDays < 0) {
    throw new Error('实体目录切换事务的规范全局时间无效')
  }

  const next = structuredClone(state.entityReferences)
  for (const entityId of [...new Set(input.movedEntityIds)]) {
    const existing = next[entityId]
    if (!existing) {
      if (entityId !== input.actorEntityId) {
        throw new Error(`迁移实体未在实体引用目录中登记：${entityId}`)
      }
      next[entityId] = {
        entityId,
        kind: 'player',
        displayName: `实体 ${entityId}`,
        contextIds: [input.sourceContextId, input.targetContextId],
        registeredAtTotalDays: input.globalTotalDays,
      }
      continue
    }
    next[entityId] = {
      ...existing,
      ...(entityId === input.actorEntityId && existing.kind === 'npc' ? { kind: 'player' as const } : {}),
      contextIds: [...new Set([...existing.contextIds, input.sourceContextId, input.targetContextId])],
    }
  }
  return next
}

export function capturePersistenceState(): EntityReferenceDirectoryPersistenceState {
  const state = useWorldStore.getState()
  const entries = listEntityReferences()
  validateEntityDirectorySnapshot({ schemaVersion: 1, entries }, state.contexts)
  return { schemaVersion: 1, entries }
}

export function restorePersistenceState(snapshot: unknown): void {
  const state = useWorldStore.getState()
  if (snapshot === undefined) {
    state.replaceEntityReferences([])
    rebuildOrganizationDirectory()
    return
  }
  state.replaceEntityReferences(validateEntityDirectorySnapshot(snapshot, state.contexts))
}

export function capturePreviewState(): EntityReferenceDirectoryPersistenceState {
  return { schemaVersion: 1, entries: listEntityReferences() }
}

export function restorePreviewState(snapshot: unknown): void {
  if (!isPlainRecord(snapshot) || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.entries)) {
    throw new Error('实体引用预览快照必须是 schemaVersion: 1 的条目数组')
  }
  useWorldStore.getState().replaceEntityReferences(
    snapshot.entries.map((entry) => cloneEntityReference(entry as EntityReference)),
  )
}

export function repairEntityReferenceDirectory(): { fallbackEntityIds: string[] } {
  const state = useWorldStore.getState()
  const fallbackEntityIds: string[] = []
  const directory = structuredClone(state.entityReferences)

  const mergeReference = (reference: EntityReference): void => {
    const existing = directory[reference.entityId]
    if (existing && existing.kind !== reference.kind) {
      if (reference.entityId.startsWith('character_') && existing.kind === 'npc' && reference.kind === 'player') {
        directory[reference.entityId] = {
          ...existing,
          kind: 'player',
          displayName: reference.displayName,
          contextIds: [...new Set([...existing.contextIds, ...reference.contextIds])],
        }
        return
      }
      throw new Error(`实体引用 ${reference.entityId} 的种类冲突`)
    }
    directory[reference.entityId] = existing
      ? {
          ...existing,
          displayName: reference.displayName || existing.displayName,
          contextIds: [...new Set([...existing.contextIds, ...reference.contextIds])],
        }
      : structuredClone(reference)
  }

  for (const instance of Object.values(state.contexts)) {
    for (const entity of instance.entities) {
      mergeReference({
        entityId: entity.id,
        kind: 'organization',
        displayName: entity.name,
        contextIds: [instance.record.id],
        registeredAtTotalDays: instance.record.createdAtGlobalDay,
      })
    }
  }

  for (const instance of Object.values(state.contexts)) {
    for (const [entityId, location] of Object.entries(instance.spatialGraph.entityLocations)) {
      const existing = directory[entityId]
      if (existing) {
        const inferredKind: EntityReferenceKind = entityId.startsWith('character_') ? 'player' : 'npc'
        if (existing.kind === 'npc' && inferredKind === 'player') {
          mergeReference({
            ...existing,
            kind: 'player',
            displayName: existing.displayName || `实体 ${entityId}`,
            contextIds: [...existing.contextIds, instance.record.id],
          })
        } else if (!existing.contextIds.includes(instance.record.id)) {
          mergeReference({ ...existing, contextIds: [...existing.contextIds, instance.record.id] })
        }
        continue
      }
      mergeReference({
        entityId,
        kind: entityId.startsWith('character_') ? 'player' : 'npc',
        displayName: `实体 ${entityId}`,
        contextIds: [instance.record.id],
        registeredAtTotalDays: Number.isInteger(location.updatedAtGlobalDay)
          ? location.updatedAtGlobalDay
          : instance.record.createdAtGlobalDay,
      })
      fallbackEntityIds.push(entityId)
    }
  }

  state.replaceEntityReferences(Object.values(directory))
  return { fallbackEntityIds }
}

export function rebuildOrganizationDirectory(): void {
  const state = useWorldStore.getState()
  for (const instance of Object.values(state.contexts)) {
    for (const entity of instance.entities) {
      state.registerEntityReference({
        entityId: entity.id,
        kind: 'organization',
        displayName: entity.name,
        contextIds: [instance.record.id],
        registeredAtTotalDays: instance.record.createdAtGlobalDay,
      })
    }
  }
}

export function ensureEntityDirectoryValidated(): void {
  const state = useWorldStore.getState()
  validateEntityDirectorySnapshot(
    { schemaVersion: 1, entries: listEntityReferences() },
    state.contexts,
  )
}
