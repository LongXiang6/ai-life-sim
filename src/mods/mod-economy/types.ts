/**
 * @module types.ts
 * @description mod-economy 类型定义 —— 经济、定居、工作、物品、人口 5 个子系统状态类型
 * @mod mod-economy
 */

// ============================================================
// §1 经济系统 (EconomySystem — 合并 Currency + TradeRoute + MarketCycle)
// ============================================================

/** 货币类型 */
export type CurrencyType = 'barter' | 'coin' | 'paper' | 'credit' | 'crystal' | 'spirit' | 'energy'

/** 货币状态 */
export interface CurrencyState {
  /** 货币类型 */
  type: CurrencyType
  /** 货币名称 */
  name: string
  /** 玩家持有货币 */
  playerWealth: number
  /** 全球货币总量 */
  totalCirculation: number
  /** 通货膨胀率 */
  inflation: number
  /** 货币稳定性指数 0-100 */
  stabilityIndex: number,
}

/** 商路状态枚举 */
export type TradeRouteStatus = 'flourishing' | 'normal' | 'declining' | 'blocked'

/** 商路状态 */
export interface TradeRouteState {
  id: string
  name: string
  /** 起始区域 */
  from: string
  /** 目标区域 */
  to: string
  /** 繁荣度 0-100 */
  prosperity: number
  /** 商路状态（由 prosperity 阈值驱动） */
  status: TradeRouteStatus
  /** 危险等级 0-100 */
  dangerLevel: number
  /** 主要交易货物 */
  goods: string[],
}

/** 市场周期阶段 */
export type MarketCyclePhase = 'boom' | 'normal' | 'recession' | 'depression' | 'recovery'

/** 经济资产 */
export interface EconomicAsset {
  id: string
  name: string
  /** 每轮收入 */
  incomePerRound: number
  /** 购入成本 */
  cost: number
  /** 购入轮/年 */
  acquiredYear: number,
}

/** 经济债务 */
export interface EconomicDebt {
  id: string
  name: string
  /** 每轮利息 */
  interestPerRound: number
  /** 本金 */
  principal: number
  /** 剩余期数 */
  remainingTerms: number
  /** 借款轮/年 */
  borrowedYear: number,
}

/** 经济整体状态 */
export interface EconomyState {
  /** 是否已初始化 */
  initialized: boolean
  /** 货币状态 */
  currency: CurrencyState
  /** 资产列表 */
  assets: EconomicAsset[]
  /** 债务列表 */
  debts: EconomicDebt[]
  /** 商路列表 */
  tradeRoutes: TradeRouteState[]
  /** 当前市场周期阶段 */
  marketPhase: MarketCyclePhase
  /** 市场周期进度 0-100 */
  marketCycleProgress: number
  /** 物价指数（100=正常，供事件检测与跨域） */
  priceIndex: number
  /** 税率 0-100 */
  taxRate: number
  /** 基尼系数 0-1 */
  giniCoefficient: number
  /** 最近经济事件 */
  recentEvents: string[]
  /** 难度乘数（1.0=正常） */
  difficultyMultiplier: number,
}

// ============================================================
// §2 定居系统 (合并玩家定居 + 世界定居点)
// ============================================================

/** 定居点类型 */
export type SettlementType = 'village' | 'town' | 'city' | 'capital' | 'fortress' | 'monastery'

/** 定居点 */
export interface Settlement {
  id: string
  name: string
  type: SettlementType
  /** 所属区域（显示名，与世界地图 region.name 同步） */
  region: string
  /** 世界地图 regionId（与 world-map 区域绑定） */
  regionId?: string
  /** 玩家/定居点世界坐标（地图 X/Y） */
  coordinates?: { x: number; y: number }
  /** 人口 */
  population: number
  /** 繁荣度 0-100 */
  prosperity: number
  /** 安全度 0-100 */
  safety: number
  /** 文化影响力 0-100 */
  cultureInfluence: number
  /** 在当前定居点居住年数 */
  yearsInCurrentTier: number,
}

/** 定居点等级叙事提示 */
export interface SettlementTierHint {
  /** 等级标签 */
  label: string
  /** 叙事提示 */
  hint: string,
}

/** 定居状态 */
export interface SettlementState {
  /** 玩家定居地 */
  playerSettlement: Settlement | null
  /** 世界定居点列表 */
  worldSettlements: Settlement[]
  /** 定居点等级术语（AI 适配） */
  levelLabels: Record<SettlementType, string>
  /** 迁居总次数 */
  totalRelocations: number
  /** 世界观分层标签集（key = worldview，如 'cultivation'） */
  tierHints: Record<string, Record<SettlementType, SettlementTierHint>> | null,
}

// ============================================================
// §3 工作系统
// ============================================================

/** 职业 */
export type Profession =
  | 'farmer' | 'merchant' | 'artisan' | 'scholar' | 'soldier'
  | 'official' | 'priest' | 'artist' | 'doctor' | 'explorer'

/** 工作状态 */
export interface WorkState {
  /** 当前职业 */
  profession: Profession
  /** 职业等级 1-10 */
  professionLevel: number
  /** 收入/回合 */
  income: number
  /** 工作满意度 0-100 */
  satisfaction: number
  /** 晋升进度 0-100 */
  promotionProgress: number
  /** 职业历史 */
  careerHistory: { profession: Profession; years: number }[],
}

// ============================================================
// §4 物品系统
// ============================================================

/** 物品品质 */
export type ItemQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** 物品类别 */
export type ItemCategory = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'quest' | 'treasure'

/** 物品 */
export interface Item {
  id: string
  name: string
  category: ItemCategory
  quality: ItemQuality
  /** 数量 */
  quantity: number
  /** 基础价值（在当前世界观中按 powerStageHint + 经济层级自动缩放） */
  value: number
  /** 描述 */
  description: string
  /** 是否可交易 */
  tradable: boolean
  /** 耐久度 0-100（可消耗品为 -1） */
  durability: number
  /** 适用世界观列表（空/undefined = 通用） */
  worldTypes?: string[]
  /** 堆叠上限（undefined = 无上限） */
  maxStack?: number
  /** 叙事效果描述（供 AI 使用） */
  narrativeEffect?: string
  /** 物品对应的战力阶位（用于计算在当前世界观下的经济层级），undefined = 始终凡品 */
  powerStageHint?: number
}

/** 物品状态 */
export interface ItemState {
  /** 背包物品 */
  inventory: Item[]
  /** 装备栏 */
  equipped: Record<string, Item>
  /** 背包容量 */
  capacity: number,
}

// ============================================================
// §5 人口系统 (合并 PopulationMobility)
// ============================================================

/** 人口种族 */
export interface PopulationRace {
  name: string
  /** 占比 0-1 */
  ratio: number
  /** 增长率 */
  growthRate: number
  /** 社会融合度 0-100（高=和其他种族融合好） */
  integration: number
  /** 种族紧张度 0-100（高=冲突风险大） */
  tension: number,
}

/** 种族池条目（用于世界观分层定义） */
export interface RacePoolEntry {
  name: string
  /** 初始比例（总和不必为1，系统会自动归一化） */
  weight: number
  /** 基础增长率 */
  growthRate: number,
}

/** 人口流动条目 */
export interface MigrationFlow {
  from: string
  to: string
  /** 流动人口数 */
  amount: number
  /** 原因 */
  reason: string,
}

/** 人口状态 */
export interface PopulationState {
  /** 总人口 */
  totalPopulation: number
  /** 种族构成 */
  races: PopulationRace[]
  /** 出生率 */
  birthRate: number
  /** 死亡率 */
  deathRate: number
  /** 人口增长率 */
  growthRate: number
  /** 人口流动 */
  migrations: MigrationFlow[]
  /** 城镇化率 0-1 */
  urbanizationRate: number
  /** 人口流动性指数 0-1（影响迁移活跃度） */
  mobilityIndex: number
  /** 连续增长年数（趋势事件） */
  consecutiveGrowthYears: number
  /** 连续衰减年数（趋势事件） */
  consecutiveDeclineYears: number
  /** 人口相关事件摘要 */
  recentPopulationEvents: string[],
}

// ============================================================
// §6 聚合类型
// ============================================================

/** MOD 整体摘要 */
export interface EconomyStoreSummary {
  economy: EconomyState
  settlement: SettlementState
  work: WorkState
  item: ItemState
  population: PopulationState,
}
