/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 经济系统
 * @mod mod-economy
 */

// 类型
export type {
  EconomyState,
  CurrencyType,
  CurrencyState,
  TradeRouteState,
  TradeRouteStatus,
  MarketCyclePhase,
  EconomicAsset,
  EconomicDebt,
  SettlementType,
  Settlement,
  SettlementState,
  SettlementTierHint,
  Profession,
  WorkState,
  ItemQuality,
  ItemCategory,
  Item,
  ItemState,
  PopulationRace,
  PopulationState,
  RacePoolEntry,
  MigrationFlow,
  EconomyStoreSummary,
  EconomyPersistenceState,
  SettlementPersistenceState,
  WorkPersistenceState,
  ItemPersistenceState,
  PopulationPersistenceState,
} from './types'

// Store
export { useEconomyStore } from './store'

// Hooks
export { useEconomy, useSettlement, useWork, useItem, usePopulation } from './hooks'
