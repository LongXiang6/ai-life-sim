/**
 * Purpose: Build the NPC subsystem read projection consumed by the round orchestrator.
 * Owner: mod-npc
 * Responsibility: Select scene-relevant NPC state without mutating persistence.
 */

import type { RoundContext, SubSystemState } from '@/foundation'
import {
  contextHasCapability,
  listCoLocatedWorldEntityIds,
  listWorldContexts,
} from '@/mods/mod-world'
import { getRelationshipSystem } from '@/mods/mod-social/relationship-system-api'

import { selectNpcSystemPersistenceState } from '../../store'
import { clone } from './common'

export function ageYears(bornAtTotalDays: number, totalDays: number): number {
  return Math.max(0, Math.floor((totalDays - bornAtTotalDays) / 365))
}

export function latestOccurredAtTotalDays<T extends { occurredAtTotalDays: number }>(items: readonly T[]): number | undefined {
  return items.reduce<number | undefined>((latest, item) => (
    latest === undefined || item.occurredAtTotalDays > latest ? item.occurredAtTotalDays : latest
  ), undefined)
}

export function latestCreatedAtTotalDays<T extends { createdAtTotalDays: number }>(items: readonly T[]): number | undefined {
  return items.reduce<number | undefined>((latest, item) => (
    latest === undefined || item.createdAtTotalDays > latest ? item.createdAtTotalDays : latest
  ), undefined)
}

export function buildNpcSystemProjection(context: RoundContext): SubSystemState {
  if (!contextHasCapability(context.contextId, 'npc')) {
    return { id: 'npc-system', summary: '', data: { enabled: false, contextId: context.contextId, npcs: [] } }
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
    id: 'npc-system',
    summary: `【${'NPC 系统'}：当前上下文 ${npcs.length} 名】`,
    data: { enabled: true, contextId: context.contextId, npcs: clone(npcs) },
  }
}

