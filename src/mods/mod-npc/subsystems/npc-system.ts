/**
 * Purpose: Own NPC subsystem lifecycle, command application, persistence, and public runtime access.
 * Owner: mod-npc
 * Responsibility: Mutate NPC-owned state while delegating validation, projection, and autonomous advancement.
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type {
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
import {
  assertWorldEntityReference,
  getWorldEntityReference,
  moveWorldEntityLocation,
  registerWorldEntityReference,
} from '@/mods/mod-world'

import {
  selectNpcSystemPersistenceState,
  useNpcSystemStore,
} from '../store'
import { advanceNpcSystem } from './npc-system/background-progress'
import { preflightNpcChanges } from './npc-system/command-validation'
import { isPlainRecord, stringList } from './npc-system/common'
import { plannedNpcReference } from './npc-system/entity-validation'
import { validateNpcPersistenceState } from './npc-system/persistence-validation'
import { buildNpcSystemProjection } from './npc-system/projection'

export class NpcSystem extends BaseSubsystem {
  readonly id = 'npc-system' as const
  readonly mod = 'mod-npc' as const
  readonly label = 'NPC 系统' as const
  readonly description = '拥有 NPC 连续身份、当地状态、目标、行为和主观记忆' as const

  collectState(context: RoundContext): SubSystemState {
    return buildNpcSystemProjection(context)
  }



  advance(context: RoundContext): void {
    advanceNpcSystem(context)
  }



  preflightChanges(
    changes: SubSystemChanges,
    context: RoundContext,
    packageChanges?: readonly SubSystemChanges[],
  ): void {
    preflightNpcChanges(changes, context, packageChanges)
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
    return validateNpcPersistenceState(selectNpcSystemPersistenceState())
  }

  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) {
      useNpcSystemStore.getState().reset()
      return
    }
    useNpcSystemStore.getState().replacePersistenceState(validateNpcPersistenceState(snapshot))
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
