import { BaseSubsystem } from '@/core'
import {
  compareDecimalIntegers,
  multiplyDecimalInteger,
  normalizeDecimalInteger,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'
import { SETTLEMENT_POPULATION_RANGE, SETTLEMENT_TIER_HINTS, WORLDVIEW_TIER_MAP } from '../constants'
import type { SettlementPersistenceState, SettlementState, Settlement, SettlementType } from '../types'
import { addSigned, clampPercent, clone, contextConfig, populationDelta, requiredContextId, scaleForContext } from './economy-runtime'

function initialState(context: RoundContext): SettlementState {
  const scale = scaleForContext(context)
  const config = contextConfig(context)
  const worldview = WORLDVIEW_TIER_MAP[config?.essenceTag ?? ''] ?? 'modern'
  const urbanPopulation = multiplyDecimalInteger(
    scale.populationTotal,
    scale.urbanizationBasisPoints,
    10_000,
  )
  const localPopulation = multiplyDecimalInteger(urbanPopulation, 1, 10_000)
  const cappedLocalPopulation = compareDecimalIntegers(localPopulation, '20000000') > 0
    ? '20000000'
    : compareDecimalIntegers(localPopulation, '50') < 0 ? '50' : localPopulation
  const initialType: SettlementType = compareDecimalIntegers(cappedLocalPopulation, '100000') >= 0
    ? 'capital'
    : compareDecimalIntegers(cappedLocalPopulation, '20000') >= 0
      ? 'city'
      : compareDecimalIntegers(cappedLocalPopulation, '2000') >= 0 ? 'town' : 'village'
  const first: Settlement = {
    id: `settlement:${context.contextId}:root`,
    name: config?.name ? `${config.name}聚落` : '初始聚落',
    type: initialType,
    region: context.contextId,
    population: normalizeDecimalInteger(cappedLocalPopulation),
    prosperity: 40,
    safety: 60,
    cultureInfluence: 30,
    yearsInCurrentTier: 0,
  }
  return {
    playerSettlement: first,
    worldSettlements: [first],
    levelLabels: {
      village: SETTLEMENT_TIER_HINTS[worldview]?.village?.label ?? '村庄',
      town: SETTLEMENT_TIER_HINTS[worldview]?.town?.label ?? '城镇',
      city: SETTLEMENT_TIER_HINTS[worldview]?.city?.label ?? '城市',
      capital: SETTLEMENT_TIER_HINTS[worldview]?.capital?.label ?? '都城',
      fortress: '要塞',
      monastery: '修道院',
    },
    totalRelocations: 0,
    tierHints: SETTLEMENT_TIER_HINTS,
  }
}

const TIER_ORDER: SettlementType[] = ['village', 'town', 'city', 'capital']

export class SettlementSystem extends BaseSubsystem {
  readonly id = 'settlement' as const
  readonly mod = 'mod-economy' as const
  readonly label = '定居系统' as const
  readonly description = '拥有定居实体、人口分配、繁荣度与安全度' as const
  private states: Record<string, SettlementState> = {}
  private ensure(context: RoundContext): SettlementState { return this.states[requiredContextId(context)] ??= initialState(context) }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    const scale = scaleForContext(context)
    for (const settlement of state.worldSettlements) {
      settlement.yearsInCurrentTier += context.daysPassed / 365
      settlement.prosperity = clampPercent(settlement.prosperity + context.daysPassed / 365 * 0.5)
      settlement.safety = clampPercent(settlement.safety + context.daysPassed / 365 * 0.2)
      const delta = populationDelta(settlement.population, scale, context.daysPassed)
      settlement.population = addSigned(settlement.population, delta.net)
    }
    if (state.playerSettlement) {
      const currentIndex = TIER_ORDER.indexOf(state.playerSettlement.type)
      const next = TIER_ORDER[currentIndex + 1]
      const threshold = next ? BigInt(SETTLEMENT_POPULATION_RANGE[next][0]) : BigInt(0)
      if (next && BigInt(state.playerSettlement.population) >= threshold && state.playerSettlement.prosperity >= 60) {
        state.playerSettlement.type = next
        state.playerSettlement.yearsInCurrentTier = 0
      }
    }
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return { id: this.id, summary: `【定居】${state.worldSettlements.length} 个定居点；玩家=${state.playerSettlement?.name ?? '无'}`, data: structuredClone(state) }
  }
  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    const state = this.ensure(context)
    if (typeof changes.changes.prosperity === 'number' && state.playerSettlement) state.playerSettlement.prosperity = clampPercent(changes.changes.prosperity)
    if (typeof changes.changes.safety === 'number' && state.playerSettlement) state.playerSettlement.safety = clampPercent(changes.changes.safety)
    if (typeof changes.changes.prosperityDelta === 'number' && state.playerSettlement) state.playerSettlement.prosperity = clampPercent(state.playerSettlement.prosperity + changes.changes.prosperityDelta)
    if (typeof changes.changes.safetyDelta === 'number' && state.playerSettlement) state.playerSettlement.safety = clampPercent(state.playerSettlement.safety + changes.changes.safetyDelta)
  }
  capturePersistenceState(): SettlementPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { this.states = snapshot ? clone((snapshot as SettlementPersistenceState).contexts ?? {}) : {} }
  capturePreviewState(): SettlementPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}
export const settlementSystem = new SettlementSystem()
