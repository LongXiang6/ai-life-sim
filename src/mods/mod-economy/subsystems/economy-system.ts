import { BaseSubsystem } from '@/core'
import {
  addDecimalIntegers,
  annualRateDelta,
  formatChineseMagnitude,
  multiplyDecimalInteger,
  normalizeDecimalInteger,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'
import { getFormulaModifier } from '@/mods/mod-world'
import type { EconomyPersistenceState, EconomyState, MarketCyclePhase } from '../types'
import { getCurrencyTypeForStability, MARKET_PHASE_ORDER } from '../constants'
import { clone, contextConfig, requiredContextId, scaleForContext } from './economy-runtime'

function productionFor(stage: string, totalDays: number): EconomyState['production'] {
  const shares: Record<string, Record<string, number>> = {
    prehistoric: { subsistence: 0.9, craft: 0.1 },
    ancient: { agriculture: 0.72, craft: 0.14, trade: 0.08, administration: 0.06 },
    medieval: { agriculture: 0.66, craft: 0.17, trade: 0.1, administration: 0.07 },
    renaissance: { agriculture: 0.52, manufacturing: 0.2, trade: 0.18, service: 0.1 },
    industrial: { agriculture: 0.25, manufacturing: 0.42, trade: 0.13, service: 0.2 },
    modern: { agriculture: 0.05, manufacturing: 0.25, service: 0.55, information: 0.15 },
    information: { agriculture: 0.03, manufacturing: 0.18, service: 0.45, information: 0.34 },
    space: { foodSystems: 0.08, manufacturing: 0.2, service: 0.3, information: 0.27, spaceIndustry: 0.15 },
  }
  const sectorShares = shares[stage] ?? shares.ancient
  const primarySector = Object.entries(sectorShares).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed'
  const adoption = { prehistoric: 1, ancient: 5, medieval: 9, renaissance: 18, industrial: 42, modern: 72, information: 88, space: 96 }[stage] ?? 5
  return { primarySector, sectorShares, productivityIndex: 100, technologyAdoption: adoption, updatedAtTotalDays: totalDays }
}

export class EconomySystem extends BaseSubsystem {
  readonly id = 'economy' as const
  readonly mod = 'mod-economy' as const
  readonly label = '经济系统' as const
  readonly description = '拥有宏观产出、货币供应、市场周期、物价与商路' as const
  private states: Record<string, EconomyState> = {}
  private ensure(context: RoundContext): EconomyState {
    return this.states[requiredContextId(context)] ??= (() => {
      const scale = scaleForContext(context)
      const config = contextConfig(context)
      const type = scale.monetaryMode === 'barter' || scale.monetaryMode === 'none' ? 'barter' : 'coin'
      return {
        initialized: true,
        annualEconomicOutput: scale.annualEconomicOutput,
        roundEconomicOutput: '0',
        production: productionFor(config?.civilizationStage ?? 'ancient', context.totalDays),
        currency: {
          type,
          name: type === 'barter' ? '物物交换' : '通用货币',
          playerWealth: '100',
          totalCirculation: scale.moneySupply,
          inflation: scale.annualInflationPerMillion / 1_000_000,
          stabilityIndex: 70,
        },
        assets: [],
        debts: [],
        tradeRoutes: [],
        marketPhase: 'normal',
        marketCycleProgress: 0,
        priceIndex: scale.priceIndexBasisPoints / 100,
        taxRate: 10,
        giniCoefficient: 0.4,
        recentEvents: [],
        difficultyMultiplier: 1,
      }
    })()
  }
  advance(context: RoundContext): void {
    const state = this.ensure(context)
    const scale = scaleForContext(context)
    if (context.daysPassed <= 0) return
    const years = context.daysPassed / 365
    const economyBasisPoints = Math.max(0, Math.round(getFormulaModifier('economyModifier', 1) * 10_000))
    const technology = context.subsystemStates['culture-tech']?.data as Partial<{ domains: Array<{ diffusion: number }> }> | undefined
    const domains = Array.isArray(technology?.domains) ? technology.domains : []
    const adoptionTarget = domains.length > 0 ? domains.reduce((sum, item) => sum + item.diffusion, 0) / domains.length : state.production.technologyAdoption
    state.production.technologyAdoption = Math.max(0, Math.min(100, state.production.technologyAdoption + (adoptionTarget - state.production.technologyAdoption) * years * 0.02))
    state.production.productivityIndex = Math.max(10, Math.min(1000, state.production.productivityIndex + (state.production.technologyAdoption - 50) * years * 0.002))
    state.production.updatedAtTotalDays = context.totalDays
    state.annualEconomicOutput = multiplyDecimalInteger(
      scale.annualEconomicOutput,
      Math.round(economyBasisPoints * state.production.productivityIndex),
      1_000_000,
    )
    state.roundEconomicOutput = multiplyDecimalInteger(
      state.annualEconomicOutput,
      BigInt(context.daysPassed),
      BigInt(365),
    )

    state.currency.inflation = Math.max(
      -0.9,
      Math.min(1, scale.annualInflationPerMillion / 1_000_000 * getFormulaModifier('inflationModifier', 1)),
    )
    if (scale.monetaryMode === 'none' || scale.monetaryMode === 'barter' || scale.monetaryMode === 'reciprocity') {
      state.currency.totalCirculation = '0'
    } else {
      const populationGrowthPerMillion = scale.annualBirthsPerMillion
        - scale.annualDeathsPerMillion
        + scale.annualNetMigrationPerMillion
      const supplyGrowthPerMillion = Math.max(
        -900_000,
        Math.round(scale.annualInflationPerMillion + populationGrowthPerMillion),
      )
      const supplyDelta = annualRateDelta(
        state.currency.totalCirculation,
        supplyGrowthPerMillion,
        context.daysPassed,
      )
      state.currency.totalCirculation = supplyDelta >= BigInt(0)
        ? addDecimalIntegers(state.currency.totalCirculation, supplyDelta.toString())
        : (BigInt(state.currency.totalCirculation) + supplyDelta < BigInt(0)
            ? '0'
            : (BigInt(state.currency.totalCirculation) + supplyDelta).toString())
    }
    state.priceIndex = Math.max(1, Math.min(1_000_000, state.priceIndex * Math.pow(1 + state.currency.inflation, years)))
    state.marketCycleProgress += years * 100
    const completedCycles = Math.floor(state.marketCycleProgress / 100)
    for (let cycle = 0; cycle < completedCycles; cycle += 1) {
      const index = MARKET_PHASE_ORDER.indexOf(state.marketPhase)
      state.marketPhase = MARKET_PHASE_ORDER[(index + 1) % MARKET_PHASE_ORDER.length] as MarketCyclePhase
    }
    state.marketCycleProgress %= 100
    state.currency.type = getCurrencyTypeForStability(state.currency.stabilityIndex)
    state.recentEvents = [
      `本轮产出 ${formatChineseMagnitude(state.roundEconomicOutput)}；年化产出 ${formatChineseMagnitude(state.annualEconomicOutput)}`,
      `货币供应 ${formatChineseMagnitude(state.currency.totalCirculation)}；物价指数 ${Math.round(state.priceIndex)}`,
    ]
  }
  collectState(context: RoundContext): SubSystemState { const state = this.ensure(context); return { id: this.id, summary: `【经济】${state.marketPhase}；年产出 ${formatChineseMagnitude(state.annualEconomicOutput)}；货币 ${formatChineseMagnitude(state.currency.totalCirculation)}；物价 ${Math.round(state.priceIndex)}`, data: structuredClone(state) } }
  applyChanges(changes: SubSystemChanges, context: RoundContext): void { const state = this.ensure(context); if (typeof changes.changes.priceIndex === 'number') state.priceIndex = Math.max(1, Math.min(1_000_000, changes.changes.priceIndex)); if (typeof changes.changes.taxRate === 'number') state.taxRate = Math.max(0, Math.min(50, changes.changes.taxRate)); if (typeof changes.changes.wealth === 'string') state.currency.playerWealth = normalizeDecimalInteger(changes.changes.wealth); if (typeof changes.changes.productivityDelta === 'number') state.production.productivityIndex = Math.max(10, Math.min(1000, state.production.productivityIndex + changes.changes.productivityDelta)); if (typeof changes.changes.technologyAdoptionDelta === 'number') state.production.technologyAdoption = Math.max(0, Math.min(100, state.production.technologyAdoption + changes.changes.technologyAdoptionDelta)) }
  capturePersistenceState(): EconomyPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { this.states = snapshot ? clone((snapshot as EconomyPersistenceState).contexts ?? {}) : {} }
  capturePreviewState(): EconomyPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}
export const economySystem = new EconomySystem()
