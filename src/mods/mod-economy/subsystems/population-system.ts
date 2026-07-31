import { BaseSubsystem } from '@/core'
import {
  compareDecimalIntegers,
  normalizeDecimalInteger,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'
import { getFormulaModifier } from '@/mods/mod-world'
import { DEFAULT_RACE_POOL, WORLDVIEW_RACE_POOLS } from '../constants'
import type { PopulationPersistenceState, PopulationState, PopulationRace } from '../types'
import {
  boundedByCapacity,
  clone,
  contextConfig,
  formatQuantity,
  populationDelta,
  requiredContextId,
  scaleForContext,
} from './economy-runtime'

function initialState(context: RoundContext): PopulationState {
  const scale = scaleForContext(context)
  const config = contextConfig(context)
  const pool = WORLDVIEW_RACE_POOLS[config?.essenceTag ?? ''] ?? DEFAULT_RACE_POOL
  const weights = pool.map((item) => item.weight)
  const races: PopulationRace[] = pool.map((item, index) => ({
    name: item.name,
    ratio: weights[index] / weights.reduce((sum, value) => sum + value, 0),
    growthRate: item.growthRate,
    integration: 70,
    tension: 0,
  }))
  return {
    totalPopulation: scale.populationTotal,
    carryingCapacity: scale.populationCarryingCapacity,
    contextId: context.contextId,
    updatedAtTotalDays: context.totalDays,
    races,
    birthRate: scale.annualBirthsPerMillion / 1_000_000,
    deathRate: scale.annualDeathsPerMillion / 1_000_000,
    growthRate: (scale.annualBirthsPerMillion - scale.annualDeathsPerMillion) / 1_000_000,
    migrations: [],
    urbanizationRate: scale.urbanizationBasisPoints / 10_000,
    mobilityIndex: Math.max(0.05, Math.min(1, scale.urbanizationBasisPoints / 10_000 * 0.7 + 0.1)),
    consecutiveGrowthYears: 0,
    consecutiveDeclineYears: 0,
    recentPopulationEvents: [`初始人口 ${formatQuantity(scale.populationTotal)}`],
  }
}

export class PopulationSystem extends BaseSubsystem {
  readonly id = 'population' as const
  readonly mod = 'mod-economy' as const
  readonly label = '人口' as const
  readonly description = '按上下文拥有宏观人口、构成、出生死亡、迁移与城镇化' as const
  private states: Record<string, PopulationState> = {}

  private ensure(context: RoundContext): PopulationState {
    const id = requiredContextId(context)
    const current = this.states[id]
    if (current) return current
    const created = initialState(context)
    this.states[id] = created
    return created
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const scale = scaleForContext(context)
    const delta = populationDelta(state.totalPopulation, scale, context.daysPassed)
    const before = state.totalPopulation
    const next = boundedByCapacity(
      (BigInt(before) + delta.net < BigInt(0) ? '0' : (BigInt(before) + delta.net).toString()),
      state.carryingCapacity,
    )
    state.totalPopulation = next
    state.birthRate = scale.annualBirthsPerMillion / 1_000_000
    state.deathRate = scale.annualDeathsPerMillion / 1_000_000
    const beforeValue = BigInt(before)
    const scaledGrowth = beforeValue === BigInt(0)
      ? BigInt(0)
      : delta.net * BigInt(1_000_000_000) / beforeValue
    state.growthRate = Number(scaledGrowth) / 1_000_000_000
    state.urbanizationRate = Math.min(
      scale.urbanizationBasisPoints / 10_000,
      state.urbanizationRate + context.daysPassed / 365 * 0.002 * getFormulaModifier('socialMobilityModifier', 1),
    )
    state.mobilityIndex = Math.max(0.05, Math.min(1, state.urbanizationRate * 0.7 + 0.1))
    state.updatedAtTotalDays = context.totalDays
    if (compareDecimalIntegers(next, before) >= 0) {
      state.consecutiveGrowthYears += context.daysPassed / 365
      state.consecutiveDeclineYears = 0
    } else {
      state.consecutiveDeclineYears += context.daysPassed / 365
      state.consecutiveGrowthYears = 0
    }
    state.recentPopulationEvents = [
      `本轮出生 ${formatQuantity(delta.births < BigInt(0) ? '0' : delta.births.toString())}，死亡 ${formatQuantity(delta.deaths.toString())}`,
      `总人口 ${formatQuantity(next)}，承载量 ${formatQuantity(state.carryingCapacity)}`,
    ]
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return { id: this.id, summary: `【人口】${formatQuantity(state.totalPopulation)}；城镇化 ${Math.round(state.urbanizationRate * 100)}%`, data: structuredClone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    const state = this.ensure(context)
    const value = changes.changes.totalPopulation ?? changes.changes.total
    if (value !== undefined) state.totalPopulation = boundedByCapacity(normalizeDecimalInteger(String(value)), state.carryingCapacity)
    if (typeof changes.changes.urbanizationRate === 'number') state.urbanizationRate = Math.max(0, Math.min(1, changes.changes.urbanizationRate))
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): PopulationPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (!snapshot) { this.states = {}; return }
    const value = snapshot as PopulationPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('人口持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): PopulationPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const populationSystem = new PopulationSystem()
