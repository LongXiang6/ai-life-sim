'use client'

/**
 * @module store.ts
 * @description mod-economy Zustand Store —— 5 状态分片：economy, settlement, work, item, population
 * @mod mod-economy
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  EconomyState,
  SettlementState,
  WorkState,
  ItemState,
  PopulationState,
  EconomyStoreSummary,
} from './types'

import {
  DEFAULT_CURRENCY,
  INITIAL_WEALTH,
  SETTLEMENT_TYPE_LABELS,
  DEFAULT_INVENTORY_CAPACITY,
  INITIAL_POPULATION,
  BASE_BIRTH_RATE,
  BASE_DEATH_RATE,
} from './constants'

// ─── 初始状态工厂 ───

/** 创建初始经济状态 */
function createInitialEconomy(): EconomyState {
  return {
    initialized: false,
    annualEconomicOutput: '0',
    roundEconomicOutput: '0',
    production: { primarySector: 'agriculture', sectorShares: { agriculture: 1 }, productivityIndex: 100, technologyAdoption: 0, updatedAtTotalDays: 0 },
    currency: { type: DEFAULT_CURRENCY, name: '金币', playerWealth: INITIAL_WEALTH, totalCirculation: '100000', inflation: 0, stabilityIndex: 50 },
    tradeRoutes: [],
    marketPhase: 'normal',
    marketCycleProgress: 0,
    priceIndex: 100,
    taxRate: 10,
    assets: [],
    debts: [],
    difficultyMultiplier: 1,
    giniCoefficient: 0.35,
    recentEvents: [],
  }
}

/** 创建初始定居状态 */
function createInitialSettlement(): SettlementState {
  return {
    playerSettlement: null,
    worldSettlements: [],
    totalRelocations: 0,
    tierHints: null,
    levelLabels: SETTLEMENT_TYPE_LABELS as Record<string, string>,
  }
}

/** 创建初始工作状态 */
function createInitialWork(): WorkState {
  return {
    profession: 'farmer',
    professionLevel: 1,
    income: '5',
    satisfaction: 50,
    promotionProgress: 0,
    careerHistory: [],
  }
}

/** 创建初始物品状态 */
function createInitialItem(): ItemState {
  return {
    inventory: [],
    equipped: {},
    capacity: DEFAULT_INVENTORY_CAPACITY,
  }
}

/** 创建初始人口状态 */
function createInitialPopulation(): PopulationState {
  return {
    totalPopulation: INITIAL_POPULATION,
    carryingCapacity: '2000000',
    races: [{ name: '人类', ratio: 1, growthRate: 0.01, integration: 100, tension: 0 }],
    birthRate: BASE_BIRTH_RATE,
    deathRate: BASE_DEATH_RATE,
    growthRate: BASE_BIRTH_RATE - BASE_DEATH_RATE,
    migrations: [],
    urbanizationRate: 0.1,
    mobilityIndex: 0.5,
    consecutiveGrowthYears: 0,
    consecutiveDeclineYears: 0,
    recentPopulationEvents: [],
  }
}

export function createInitialEconomyState(): EconomyState { return createInitialEconomy() }
export function createInitialSettlementState(): SettlementState { return createInitialSettlement() }
export function createInitialWorkState(): WorkState { return createInitialWork() }
export function createInitialItemState(): ItemState { return createInitialItem() }
export function createInitialPopulationState(): PopulationState { return createInitialPopulation() }

// ─── Store 接口 ───

interface EconomyStore {
  /** 经济状态 */
  economy: EconomyState
  /** 定居状态 */
  settlement: SettlementState
  /** 工作状态 */
  work: WorkState
  /** 物品状态 */
  item: ItemState
  /** 人口状态 */
  population: PopulationState

  /** 获取 5 个分片的摘要 */
  getSummary: () => EconomyStoreSummary

  /** 部分更新经济状态 */
  setEconomy: (s: Partial<EconomyState>) => void
  /** 部分更新定居状态 */
  setSettlement: (s: Partial<SettlementState>) => void
  /** 部分更新工作状态 */
  setWork: (s: Partial<WorkState>) => void
  /** 部分更新物品状态 */
  setItem: (s: Partial<ItemState>) => void
  /** 部分更新人口状态 */
  setPopulation: (s: Partial<PopulationState>) => void

  /** 重置所有状态 */
  reset: () => void,
}

// ─── Store 实现 ───

export const useEconomyStore = create<EconomyStore>()(
  persist(
    (set, get) => ({
      economy: createInitialEconomy(),
      settlement: createInitialSettlement(),
      work: createInitialWork(),
      item: createInitialItem(),
      population: createInitialPopulation(),

      getSummary: () => {
        const s = get()
        return {
          economy: s.economy,
          settlement: s.settlement,
          work: s.work,
          item: s.item,
          population: s.population,
        }
      },

      setEconomy: (partial) => set((s) => ({ economy: { ...s.economy, ...partial } })),
      setSettlement: (partial) => set((s) => ({ settlement: { ...s.settlement, ...partial } })),
      setWork: (partial) => set((s) => ({ work: { ...s.work, ...partial } })),
      setItem: (partial) => set((s) => ({ item: { ...s.item, ...partial } })),
      setPopulation: (partial) => set((s) => ({ population: { ...s.population, ...partial } })),

      reset: () => set({
        economy: createInitialEconomy(),
        settlement: createInitialSettlement(),
        work: createInitialWork(),
        item: createInitialItem(),
        population: createInitialPopulation(),
      }),
    }),
    {
      name: 'mod-economy:persist:economy-state',
      version: 1,
      migrate: (persistedState: unknown, _version: number) => persistedState as EconomyStore,
      partialize: (state) => {
        const { getSummary: _a, setEconomy: _b, setSettlement: _c, setWork: _d, setItem: _e, setPopulation: _f, reset: _g, ...rest } = state
        return rest
      },
    },
  ),
)
