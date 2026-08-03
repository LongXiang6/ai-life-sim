import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { contextHasCapability } from '@/mods/mod-world'
import type { MonsterPersistenceState, MonsterState } from '../types'
import { assertContext, assertEvidence, assertNode, clone, worldConfig } from './p8-runtime'
import { DEFAULT_MONSTER_TYPES, MONSTER_TYPES_BY_WORLDVIEW } from '../constants'

function initialState(context: RoundContext): MonsterState {
  const worldview = worldConfig(context.contextId)?.essenceTag ?? ''
  return { contextId: context.contextId, initialized: true, enabled: contextHasCapability(context.contextId, 'supernatural'), speciesIds: [], habitatNodeIds: [], regionalThreat: {}, populationThreatDirection: worldview === 'survival_horror' || worldview === 'post_apocalyptic' ? 'attract' : 'repel', encounters: [], updatedAtTotalDays: context.totalDays }
}

export class MonsterSystem extends BaseSubsystem {
  readonly id = 'monster' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '怪物生态插件' as const
  readonly description = '引用生态种群与统一空间节点，计算区域威胁并记录有证据的遭遇' as const
  private states: Record<string, MonsterState> = {}
  private ensure(context: RoundContext): MonsterState { return this.states[context.contextId] ??= initialState(context) }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    state.enabled = contextHasCapability(context.contextId, 'supernatural')
    if (!state.enabled || context.daysPassed <= 0) { state.updatedAtTotalDays = context.totalDays; return }
    const ecology = context.subsystemStates.ecology?.data as { species?: Array<{ id: string; category: string; habitatNodeIds?: string[]; population?: string; carryingCapacity?: string }> } | undefined
    const species = ecology?.species?.filter((item) => item.category === 'monster' || item.category === 'mutant' || item.category === 'alien') ?? []
    state.speciesIds = species.map((item) => item.id)
    state.habitatNodeIds = [...new Set(species.flatMap((item) => item.habitatNodeIds ?? []))]
    const pollution = context.subsystemStates.pollution?.data as { regionPollutions?: Record<string, { pollutionIndex?: number }> } | undefined
    state.regionalThreat = Object.fromEntries(state.habitatNodeIds.map((nodeId) => {
      const localSpecies = species.filter((item) => item.habitatNodeIds?.includes(nodeId))
      const density = localSpecies.reduce((sum, item) => {
        const population = Number(item.population ?? 0)
        const capacity = Math.max(1, Number(item.carryingCapacity ?? 1))
        return sum + Math.max(0, Math.min(1, population / capacity)) * 60
      }, 0)
      const pollutionIndex = pollution?.regionPollutions?.[nodeId]?.pollutionIndex ?? 0
      const pressure = state.populationThreatDirection === 'attract' ? 10 : -10
      return [nodeId, Math.max(0, Math.min(100, density + pollutionIndex * 0.2 + pressure))]
    }))
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!state.enabled) return { id: this.id, summary: '', data: structuredClone(state) }
    const maxThreat = Math.max(0, ...Object.values(state.regionalThreat))
    const worldview = worldConfig(context.contextId)?.essenceTag ?? ''
    const names = MONSTER_TYPES_BY_WORLDVIEW[worldview] ?? DEFAULT_MONSTER_TYPES
    return { id: this.id, summary: `【怪物】物种 ${state.speciesIds.length}；栖息节点 ${state.habitatNodeIds.length}；最高威胁 ${Math.round(maxThreat)}；候选 ${names.join('、')}`, data: structuredClone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('怪物指令目标不匹配')
    assertContext(changes, context, '怪物')
    const state = this.ensure(context)
    const operation = changes.operation ?? 'record-encounter'
    if (operation === 'record-encounter') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '怪物')
      const speciesId = typeof changes.changes.speciesId === 'string' ? changes.changes.speciesId : ''
      const nodeId = typeof changes.changes.nodeId === 'string' ? changes.changes.nodeId : ''
      if (!state.speciesIds.includes(speciesId) || !nodeId) throw new Error('怪物遭遇目标无效')
      assertNode(context.contextId, nodeId)
      state.encounters.push({ id: changes.targetObjectId ?? `monster-encounter:${context.contextId}:${context.totalDays}:${state.encounters.length}`, speciesId, nodeId, threatLevel: Math.round(state.regionalThreat[nodeId] ?? 0), occurredAtTotalDays: context.totalDays, evidenceEventIds: [...(changes.evidenceEventIds ?? [])] })
      state.encounters = state.encounters.slice(-50)
    } else if (operation === 'adjust-threat') {
      const nodeId = typeof changes.changes.nodeId === 'string' ? changes.changes.nodeId : ''
      const delta = changes.changes.delta
      if (!nodeId || typeof delta !== 'number') throw new Error('怪物威胁调整输入无效')
      assertNode(context.contextId, nodeId)
      state.regionalThreat[nodeId] = Math.max(0, Math.min(100, (state.regionalThreat[nodeId] ?? 0) + delta))
    } else throw new Error(`未知怪物操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): MonsterPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { if (snapshot === undefined) { this.states = {}; return }; const value = snapshot as MonsterPersistenceState; if (value.schemaVersion !== 1 || !value.contexts) throw new Error('怪物持久化快照无效'); this.states = clone(value.contexts) }
  reset(): void { this.states = {} }
}

export const monsterSystem = new MonsterSystem()
