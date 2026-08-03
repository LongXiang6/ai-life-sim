import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { assertWorldSpatialNode, listWorldContexts } from '@/mods/mod-world'
import { getPollutionLevel } from '../utils'
import type { IndustryType, PollutionPersistenceState, PollutionState, RegionPollution } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))
const STAGE_BASELINE: Record<string, number> = { prehistoric: 0, ancient: 0.3, medieval: 0.8, renaissance: 2,
  industrial: 14, modern: 18, information: 12, space: 8 }
const STAGE_FLOW: Record<string, { emission: number; decay: number; industry: IndustryType }> = {
  prehistoric: { emission: 0.02, decay: 0.3, industry: 'agriculture' }, ancient: { emission: 0.1, decay: 0.3, industry: 'agriculture' },
  medieval: { emission: 0.2, decay: 0.35, industry: 'agriculture' }, renaissance: { emission: 0.5, decay: 0.4, industry: 'mixed' },
  industrial: { emission: 2.5, decay: 0.5, industry: 'manufacturing' }, modern: { emission: 1.8, decay: 1.1, industry: 'manufacturing' },
  information: { emission: 1.2, decay: 1.4, industry: 'service' }, space: { emission: 0.8, decay: 1.6, industry: 'service' },
}

export class PollutionSystem extends BaseSubsystem {
  readonly id = 'pollution' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '污染' as const
  readonly description = '按空间节点拥有污染存量、年排放与自然治理衰减；不重复拥有产业或资源状态' as const
  private states: Record<string, PollutionState> = {}

  private ensure(context: RoundContext): PollutionState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const stage = instance?.worldConfig.civilizationStage ?? 'ancient'
    const baseline = STAGE_BASELINE[stage] ?? 1
    const flow = STAGE_FLOW[stage] ?? STAGE_FLOW.ancient
    const nodes = Object.values(instance?.spatialGraph.nodes ?? {})
    const pollutions = Object.fromEntries(nodes.map((node): [string, RegionPollution] => [node.id, {
      nodeId: node.id, pollutionIndex: baseline, level: getPollutionLevel(baseline), annualEmission: flow.emission,
      annualDecay: flow.decay, industryType: flow.industry,
    }]))
    return this.states[context.contextId] = { contextId: context.contextId, regionPollutions: pollutions,
      globalPollutionIndex: baseline, updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const years = context.daysPassed / 365
    const disasters = context.subsystemStates.climate?.data as Partial<{ activeDisasters: unknown[] }> | undefined
    const disasterPulse = Array.isArray(disasters?.activeDisasters) ? disasters.activeDisasters.length * 0.2 * years : 0
    for (const pollution of Object.values(state.regionPollutions)) {
      pollution.pollutionIndex = clamp(pollution.pollutionIndex + (pollution.annualEmission - pollution.annualDecay) * years + disasterPulse)
      pollution.level = getPollutionLevel(pollution.pollutionIndex)
    }
    this.recalculate(state)
    state.updatedAtTotalDays = context.totalDays
  }

  private recalculate(state: PollutionState): void {
    const regions = Object.values(state.regionPollutions)
    state.globalPollutionIndex = regions.length ? regions.reduce((sum, item) => sum + item.pollutionIndex, 0) / regions.length : 0
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const severe = Object.values(state.regionPollutions).filter((item) => item.level >= 4).length
    return { id: this.id, summary: `【污染】指数 ${state.globalPollutionIndex.toFixed(1)}；高污染节点 ${severe}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('污染指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('污染指令上下文不匹配')
    const state = this.ensure(context)
    const nodeId = changes.targetObjectId ?? (typeof changes.changes.nodeId === 'string' ? changes.changes.nodeId : '')
    assertWorldSpatialNode(context.contextId, nodeId)
    const pollution = state.regionPollutions[nodeId] ?? { nodeId, pollutionIndex: 0, level: 0, annualEmission: 0, annualDecay: 0.5, industryType: 'mixed' as const }
    if (typeof changes.changes.pollutionDelta === 'number') pollution.pollutionIndex = clamp(pollution.pollutionIndex + changes.changes.pollutionDelta)
    if (typeof changes.changes.annualEmission === 'number') pollution.annualEmission = Math.max(0, changes.changes.annualEmission)
    if (typeof changes.changes.annualDecay === 'number') pollution.annualDecay = Math.max(0, changes.changes.annualDecay)
    pollution.level = getPollutionLevel(pollution.pollutionIndex)
    state.regionPollutions[nodeId] = pollution
    this.recalculate(state)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): PollutionPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as PollutionPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('污染持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const pollutionSystem = new PollutionSystem()
