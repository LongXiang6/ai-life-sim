/**
 * Purpose: Normalize and merge world Store aggregates before Zustand commits them.
 * Owner: mod-world / world Store.
 * Responsibility: Pure Store helper transformations; persistence and action dispatch stay outside.
 */

import type {
  EntityReference,
  GlobalEntityId,
  SimulationScope,
} from '@/foundation'
import type { WorldConfig, WorldContextInstance } from '../types'
import { deriveCapabilityProfile } from '../utils/world-context-runtime'
import type { WorldStore } from './contracts'

export function normalizeEntityReference(reference: EntityReference): EntityReference {
  if (!reference.entityId.trim()) throw new Error('实体引用缺少稳定实体 ID')
  if (!reference.displayName.trim()) throw new Error(`实体引用 ${reference.entityId} 缺少显示标签`)
  if (!['player', 'npc', 'organization'].includes(reference.kind)) {
    throw new Error(`实体引用 ${reference.entityId} 的种类无效`)
  }
  if (!Number.isInteger(reference.registeredAtTotalDays) || reference.registeredAtTotalDays < 0) {
    throw new Error(`实体引用 ${reference.entityId} 的登记时间无效`)
  }
  const contextIds = [...new Set(reference.contextIds)]
  if (contextIds.some((contextId) => !contextId.trim())) {
    throw new Error(`实体引用 ${reference.entityId} 含空上下文 ID`)
  }
  return { ...structuredClone(reference), contextIds }
}

export function mergeEntityReference(
  directory: Record<GlobalEntityId, EntityReference>,
  reference: EntityReference,
): Record<GlobalEntityId, EntityReference> {
  const normalized = normalizeEntityReference(reference)
  const existing = directory[normalized.entityId]
  if (existing && existing.kind !== normalized.kind) {
    throw new Error(`实体引用 ${normalized.entityId} 的种类冲突`)
  }
  return {
    ...directory,
    [normalized.entityId]: {
      ...normalized,
      contextIds: [...new Set([...(existing?.contextIds ?? []), ...normalized.contextIds])],
      registeredAtTotalDays: existing?.registeredAtTotalDays ?? normalized.registeredAtTotalDays,
    },
  }
}

export function mergeContextOrganizations(
  directory: Record<GlobalEntityId, EntityReference>,
  instance: WorldContextInstance,
): Record<GlobalEntityId, EntityReference> {
  let next = directory
  for (const entity of instance.entities) {
    next = mergeEntityReference(next, {
      entityId: entity.id,
      kind: 'organization',
      displayName: entity.name,
      contextIds: [instance.record.id],
      registeredAtTotalDays: instance.record.createdAtGlobalDay,
    })
  }
  return next
}

export function updateCurrentContext(
  state: WorldStore,
  update: (instance: WorldContextInstance) => WorldContextInstance,
): Pick<WorldStore, 'contexts'> {
  const id = state.currentContextId
  if (!id || !state.contexts[id]) return { contexts: state.contexts }
  return {
    contexts: {
      ...state.contexts,
      [id]: update(structuredClone(state.contexts[id])),
    },
  }
}

export function deriveUpdatedCapabilityProfile(instance: WorldContextInstance, config: WorldConfig) {
  const confirmedCapabilities = instance.capabilityProfile.derivedFrom === 'confirmed-facts'
    ? instance.capabilityProfile.capabilities
    : undefined
  return deriveCapabilityProfile(
    instance.record.id,
    config,
    instance.capabilityProfile.derivedFrom,
    confirmedCapabilities,
  )
}

export function lifecycleForScope(scope: SimulationScope): WorldContextInstance['record']['lifecycle'] {
  if (scope === 'closed') return 'closed'
  if (scope === 'dormant') return 'dormant'
  return 'open'
}
