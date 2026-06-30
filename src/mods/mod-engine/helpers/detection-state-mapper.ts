/**
 * @module detection-state-mapper.ts
 * @description 子系统 id → 事件检测 DetectionStates 唯一映射入口
 * @mod mod-engine
 */

import type { DetectionStates } from './event-lifecycle-tracker'

function asRecord(data: unknown): Record<string, unknown> | undefined {
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return undefined
}

function mapNationRelations(data: Record<string, unknown> | undefined): DetectionStates['nationState'] {
  if (!data || !Array.isArray(data.relations)) return undefined
  const relations = (data.relations as Array<Record<string, unknown>>).map((r) => {
    const stance = String(r.stance ?? r.status ?? '').toLowerCase()
    let status = 'NEUTRAL'
    if (stance === 'war') status = 'WAR'
    else if (stance === 'hostile') status = 'HOSTILE'
    else if (stance === 'ally' || stance === 'friendly') status = 'ALLY'
    return { status }
  })
  return { relations }
}

function mapNobleHouses(data: Record<string, unknown> | undefined): DetectionStates['nobleHouseState'] {
  if (!data || !Array.isArray(data.nobleHouses)) return undefined
  const houses = (data.nobleHouses as Array<Record<string, unknown>>).map((h) => ({
    name: String(h.name ?? '未知家族'),
    prosperity: typeof h.prosperity === 'number'
      ? h.prosperity
      : typeof h.influence === 'number'
        ? h.influence
        : 50,
  }))
  return { houses }
}

function mapMarketState(economy: Record<string, unknown> | undefined): DetectionStates['marketState'] {
  if (!economy) return undefined
  const currency = asRecord(economy.currency)
  const priceIndex = typeof economy.priceIndex === 'number'
    ? economy.priceIndex
    : currency
      ? 100 + (typeof currency.inflation === 'number' ? currency.inflation : 0) * 2
      : 100
  const inflationRate = currency && typeof currency.inflation === 'number'
    ? currency.inflation / 100
    : 0
  const volatility = typeof economy.marketCycleProgress === 'number'
    ? economy.marketCycleProgress / 100
    : 0
  return { priceIndex, inflationRate, volatility }
}

function mapTradeRouteState(economy: Record<string, unknown> | undefined): DetectionStates['tradeRouteState'] {
  if (!economy || !Array.isArray(economy.tradeRoutes)) return undefined
  const routes = (economy.tradeRoutes as Array<Record<string, unknown>>).map((r) => ({
    status: typeof r.status === 'string' ? r.status : 'normal',
  }))
  let globalTradeMultiplier = 1
  if (routes.length > 0) {
    const prosperities = (economy.tradeRoutes as Array<Record<string, unknown>>)
      .map((r) => (typeof r.prosperity === 'number' ? r.prosperity : 50))
    const avg = prosperities.reduce((s, p) => s + p, 0) / prosperities.length
    globalTradeMultiplier = Math.max(0.3, Math.min(1.5, 0.6 + (avg / 100) * 0.8))
  }
  const disrupted = routes.filter((r) => r.status === 'disrupted' || r.status === 'blocked').length
  if (disrupted > 0) {
    globalTradeMultiplier *= Math.max(0.3, 1 - disrupted * 0.15)
  }
  return { routes, globalTradeMultiplier }
}

function mapEconomyState(economy: Record<string, unknown> | undefined): DetectionStates['economyState'] {
  if (!economy) return undefined
  const currency = asRecord(economy.currency)
  const debts = Array.isArray(economy.debts)
    ? (economy.debts as Array<Record<string, unknown>>).map((d) => ({
      amount: typeof d.principal === 'number' ? d.principal : 0,
    }))
    : []
  if (!currency) return { debts }
  const currencyOut: Record<string, number> = {}
  if (typeof currency.playerWealth === 'number') currencyOut.playerWealth = currency.playerWealth
  if (typeof currency.totalCirculation === 'number') currencyOut.totalCirculation = currency.totalCirculation
  if (typeof currency.inflation === 'number') currencyOut.inflation = currency.inflation
  return { currency: currencyOut, debts }
}

/**
 * 将 orchestrator 子系统 data 快照映射为事件检测所需结构
 */
export function mapSubsystemStatesToDetectionStates(
  subsystemDataById: Record<string, unknown>,
): DetectionStates {
  const economy = asRecord(subsystemDataById.economy)
  const population = asRecord(subsystemDataById.population)
  const mapped: DetectionStates = {}

  const marketState = mapMarketState(economy)
  if (marketState) mapped.marketState = marketState

  const faction = asRecord(subsystemDataById['faction-dynamics'])
  if (faction && Array.isArray(faction.factions)) {
    mapped.factionState = {
      factions: (faction.factions as Array<Record<string, unknown>>).map((f) => ({
        name: String(f.name ?? '未知势力'),
        power: typeof f.power === 'number' ? f.power : 0,
      })),
    }
  }

  const climate = asRecord(subsystemDataById.climate)
  if (climate) {
    mapped.climateState = {
      activeDisasters: Array.isArray(climate.activeDisasters)
        ? (climate.activeDisasters as Array<{ type: string }>)
        : [],
    }
  }

  if (population) {
    mapped.populationState = {
      total: typeof population.totalPopulation === 'number' ? population.totalPopulation : undefined,
      growthRate: typeof population.growthRate === 'number' ? population.growthRate : undefined,
      migrationDirection: typeof population.migrationDirection === 'string'
        ? population.migrationDirection
        : undefined,
      consecutiveDeclineYears: typeof population.consecutiveDeclineYears === 'number'
        ? population.consecutiveDeclineYears
        : undefined,
      consecutiveGrowthYears: typeof population.consecutiveGrowthYears === 'number'
        ? population.consecutiveGrowthYears
        : undefined,
    }
  }

  const ecology = asRecord(subsystemDataById.ecology)
  if (ecology) {
    mapped.ecosystemState = {
      biodiversity: typeof ecology.biodiversity === 'number' ? ecology.biodiversity : undefined,
      currentPhase: typeof ecology.currentPhase === 'string' ? ecology.currentPhase : undefined,
      overexploitationYears: typeof ecology.overexploitationYears === 'number'
        ? ecology.overexploitationYears
        : undefined,
    }
  }

  const nationState = mapNationRelations(asRecord(subsystemDataById['nation-relation']))
  if (nationState) mapped.nationState = nationState

  const nobleHouseState = mapNobleHouses(asRecord(subsystemDataById['social-stratification']))
  if (nobleHouseState) mapped.nobleHouseState = nobleHouseState

  const tradeRouteState = mapTradeRouteState(economy)
  if (tradeRouteState) mapped.tradeRouteState = tradeRouteState

  const cultureTech = asRecord(subsystemDataById['culture-tech'])
  if (cultureTech) {
    mapped.cultureTechState = {
      techProgress: typeof cultureTech.techProgress === 'number' ? cultureTech.techProgress : undefined,
      techLevel: typeof cultureTech.techLevel === 'number' ? cultureTech.techLevel : undefined,
      activeEvents: Array.isArray(cultureTech.activeEvents)
        ? (cultureTech.activeEvents as string[])
        : undefined,
    }
  }

  const economyState = mapEconomyState(economy)
  if (economyState) mapped.economyState = economyState

  const characterIds = [
    'health', 'morality', 'combat-power', 'lifespan', 'character-base', 'reputation', 'faith', 'luck',
  ] as const
  for (const id of characterIds) {
    const data = asRecord(subsystemDataById[id])
    if (data) {
      mapped[id] = data as DetectionStates[typeof id]
    }
  }

  return mapped
}
