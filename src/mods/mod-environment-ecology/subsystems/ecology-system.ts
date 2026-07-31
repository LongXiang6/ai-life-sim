import { BaseSubsystem } from '@/core'
import { annualRateDelta, normalizeDecimalInteger, type RoundContext, type SubSystemChanges, type SubSystemState } from '@/foundation'
import { assertWorldSpatialNode } from '@/mods/mod-world'
import type { EcologyPersistenceState, EcologyState, SpeciesCategory, SpeciesEntry, SpeciesRarity } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))

export class EcologySystem extends BaseSubsystem {
  readonly id = 'ecology' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '生态' as const
  readonly description = '按上下文拥有物种聚合种群、生物多样性、栖息地和灭绝记录；怪物规则由插件扩展' as const
  private states: Record<string, EcologyState> = {}

  private ensure(context: RoundContext): EcologyState {
    return this.states[context.contextId] ??= { contextId: context.contextId,
      metrics: { biodiversityIndex: 70, resilience: 60, habitatIntegrity: 80, foodChainStability: 65 },
      species: [], invasiveSpeciesIds: [], extinctionEvents: [], overexploitationYears: 0, updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const pollution = context.subsystemStates.pollution?.data as Partial<{ globalPollutionIndex: number }> | undefined
    const pollutionIndex = typeof pollution?.globalPollutionIndex === 'number' ? pollution.globalPollutionIndex : 0
    const habitatTarget = clamp(100 - pollutionIndex * 0.7)
    state.metrics.habitatIntegrity = clamp(state.metrics.habitatIntegrity + (habitatTarget - state.metrics.habitatIntegrity) * context.daysPassed / 365 * 0.02)
    for (const species of state.species) {
      const delta = annualRateDelta(species.population, species.annualGrowthPerMillion, context.daysPassed)
      const next = BigInt(species.population) + delta
      const bounded = next < BigInt(0) ? BigInt(0) : next > BigInt(species.carryingCapacity) ? BigInt(species.carryingCapacity) : next
      species.population = bounded.toString()
      const ratio = BigInt(species.carryingCapacity) === BigInt(0) ? 0 : Number(bounded * BigInt(10_000) / BigInt(species.carryingCapacity)) / 10_000
      species.extinctionThreat = clamp((1 - ratio) * 100 + (100 - state.metrics.habitatIntegrity) * 0.35)
      species.endangered = species.extinctionThreat >= 70
      species.updatedAtTotalDays = context.totalDays
    }
    const living = state.species.filter((item) => item.population !== '0')
    state.metrics.biodiversityIndex = state.species.length === 0 ? state.metrics.biodiversityIndex : clamp(living.length / state.species.length * 100)
    state.metrics.resilience = clamp((state.metrics.habitatIntegrity + state.metrics.biodiversityIndex) / 2)
    state.metrics.foodChainStability = clamp(state.metrics.resilience - state.invasiveSpeciesIds.length * 4)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const endangered = state.species.filter((item) => item.endangered).length
    return { id: this.id, summary: `【生态】多样性 ${state.metrics.biodiversityIndex.toFixed(1)}；登记物种 ${state.species.length}；濒危 ${endangered}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('生态指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('生态指令上下文不匹配')
    const state = this.ensure(context)
    const operation = changes.operation ?? 'adjust-habitat'
    if (operation === 'register-species') {
      const name = typeof changes.changes.name === 'string' ? changes.changes.name.trim() : ''
      const category = changes.changes.category as SpeciesCategory
      const rarity = changes.changes.rarity as SpeciesRarity
      const population = normalizeDecimalInteger(String(changes.changes.population ?? '0'))
      const capacity = normalizeDecimalInteger(String(changes.changes.carryingCapacity ?? population))
      const nodes = Array.isArray(changes.changes.habitatNodeIds) ? changes.changes.habitatNodeIds.filter((item): item is string => typeof item === 'string') : []
      if (!name || !['plant', 'animal', 'monster', 'spirit', 'alien', 'mutant'].includes(category) || !['common', 'uncommon', 'rare', 'legendary'].includes(rarity) || BigInt(population) > BigInt(capacity)) throw new Error('物种登记输入无效')
      nodes.forEach((nodeId) => assertWorldSpatialNode(context.contextId, nodeId))
      const id = changes.targetObjectId ?? `species:${encodeURIComponent(context.contextId)}:${encodeURIComponent(name)}`
      const entry: SpeciesEntry = { id, name, category, rarity, habitatNodeIds: nodes, population, carryingCapacity: capacity,
        annualGrowthPerMillion: typeof changes.changes.annualGrowthPerMillion === 'number' ? Math.round(changes.changes.annualGrowthPerMillion) : 0,
        extinctionThreat: 0, endangered: false, role: (changes.changes.role as SpeciesEntry['role']) ?? 'producer', updatedAtTotalDays: context.totalDays }
      state.species = [...state.species.filter((item) => item.id !== id), entry]
    } else if (operation === 'adjust-population') {
      const species = state.species.find((item) => item.id === changes.targetObjectId)
      if (!species) throw new Error(`物种不存在：${changes.targetObjectId}`)
      const delta = BigInt(String(changes.changes.populationDelta ?? '0'))
      const next = BigInt(species.population) + delta
      species.population = (next < BigInt(0) ? BigInt(0) : next > BigInt(species.carryingCapacity) ? BigInt(species.carryingCapacity) : next).toString()
      if (species.population === '0') state.extinctionEvents.push(`${species.name}@${context.totalDays}`)
    } else if (operation === 'adjust-habitat') {
      if (typeof changes.changes.habitatIntegrityDelta !== 'number') throw new Error('栖息地变化缺少数值')
      state.metrics.habitatIntegrity = clamp(state.metrics.habitatIntegrity + changes.changes.habitatIntegrityDelta)
    } else throw new Error(`未知生态操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): EcologyPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as EcologyPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('生态持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): EcologyPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const ecologySystem = new EcologySystem()
