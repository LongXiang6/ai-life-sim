/**
 * @module types.ts
 * @description mod-environment-ecology 类型定义 —— 气候、地理、生态、自然资源、污染
 * @mod mod-environment-ecology
 */

// ============================================================
// §1 气候系统 (合并 Season)
// ============================================================

/** 气候带 */
export type ClimateZone = 'tropical' | 'subtropical' | 'temperate' | 'boreal' | 'polar' | 'arid' | 'mediterranean'

/** 季节 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** 灾害类型 */
export type DisasterType = 'flood' | 'drought' | 'earthquake' | 'tsunami' | 'volcano' | 'storm' | 'blizzard' | 'wildfire' | 'plague' | 'locust'

/** 灾害条目 */
export interface Disaster {
  type: DisasterType
  /** 严重程度 0-100 */
  severity: number
  /** 影响区域 */
  affectedRegions: string[]
  /** 发生年份 */
  year: number
  /** 持续回合 */
  duration: number,
}

/** 季节效果乘数（供其他系统消费） */
export interface SeasonEffect {
  diseaseRiskMultiplier: number
  incomeMultiplier: number
  staminaCostMultiplier: number
  healthRegenMultiplier: number
  narrativeTheme: string,
}

/** 世界观特殊季节 */
export interface SpecialSeason {
  name: string
  description: string,
}

/** 气候状态 */
export interface ClimateState {
  /** 全局气温偏移量 */
  temperatureOffset: number
  /** 全局湿度 0-100 */
  humidity: number
  /** 当前季节 */
  season: Season
  /** 季节进度 0-100（每回合增长，满100换季） */
  seasonProgress: number
  /** 季节效果乘数 */
  seasonEffects: SeasonEffect
  /** 当前特殊季节（世界观专属），无则为 null */
  specialSeason: SpecialSeason | null
  /** 活跃灾害 */
  activeDisasters: Disaster[]
  /** 气候带分布 */
  climateZones: Record<string, ClimateZone>,
}

// ============================================================
// §2 地理系统 (合并 Terrain + 旧 Geography)
// ============================================================

/** 地形类型 (10 种) */
export type TerrainType =
  | 'plain'          // 平原
  | 'mountain'       // 山脉
  | 'desert'         // 沙漠
  | 'forest'         // 森林
  | 'tundra'         // 冻土
  | 'ocean'          // 海洋
  | 'swamp'          // 沼泽
  | 'volcanic'       // 火山
  | 'underground'    // 地下
  | 'skyIsland'      // 空岛

/** 区域地形定义 */
export interface RegionTerrain {
  regionId: string
  terrainType: TerrainType
  /** 行军难度 1-100 */
  marchDifficulty: number
  /** 海拔 */
  elevation: number
  /** 改道路距离 */
  detourDistance: number,
}

/** 板块活动事件 */
export interface TectonicEvent {
  type: 'earthquake' | 'volcanic_eruption' | 'mountain_rise' | 'land_subside'
  regionId: string
  magnitude: number
  year: number,
}

/** 地理状态 */
export interface GeographyState {
  /** 区域地形映射 */
  regionTerrains: Record<string, RegionTerrain>
  /** 板块活动事件历史 */
  tectonicEvents: TectonicEvent[]
  /** 气候带迁移累积 */
  climateShiftProgress: number
  /** 最近被改变的区域地形 ID 列表 */
  recentlyChanged: string[],
}

// ============================================================
// §3 生态系统 (合并 Biodiversity)
// ============================================================

/** 物种分类 */
export type SpeciesCategory = 'plant' | 'animal' | 'monster' | 'spirit' | 'alien' | 'mutant'

/** 物种稀有度 */
export type SpeciesRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

/** 生态健康指标 */
export interface EcologyMetrics {
  /** 生物多样指数 0-100 */
  biodiversityIndex: number
  /** 生态恢复力 0-100 */
  resilience: number
  /** 栖息地完整度 0-100 */
  habitatIntegrity: number
  /** 食物链稳定性 0-100 */
  foodChainStability: number,
}

/** 物种条目 */
export interface SpeciesEntry {
  name: string
  /** 物种类别 */
  category: SpeciesCategory
  /** 稀有度 */
  rarity: SpeciesRarity
  /** 栖息地区域 */
  region: string
  /** 种群数量 */
  population: number
  /** 最大种群数量 */
  maxPopulation: number
  /** 灭绝威胁累积 0-100 */
  extinctionThreat: number
  /** 是否濒危 */
  endangered: boolean
  /** 生态角色 */
  role: 'predator' | 'prey' | 'producer' | 'decomposer' | 'keystone',
}

/** 生态状态 */
export interface EcologyState {
  metrics: EcologyMetrics
  /** 物种列表 */
  species: SpeciesEntry[]
  /** 入侵物种 */
  invasiveSpecies: string[]
  /** 灭绝事件历史 */
  extinctionEvents: string[]
  /** 过度开发持续年数（人口超阈值累积） */
  overexploitationYears: number
}

// ============================================================
// §4 自然资源系统 (世界级宏观指标)
// ============================================================

/** 资源类型 */
export type NaturalResourceType = 'mineral' | 'forest' | 'water' | 'farmland' | 'energy' | 'special'

/** 资源指标 */
export interface ResourceMetrics {
  type: NaturalResourceType
  /** 总储量 0-100 */
  totalReserves: number
  /** 再生速率/年 */
  regenerationRate: number
  /** 消耗速率/年 */
  consumptionRate: number
  /** 是否可再生 */
  renewable: boolean,
}

/** 自然资源状态 */
export interface NaturalResourceState {
  /** 资源指标列表 */
  resources: Record<NaturalResourceType, ResourceMetrics>
  /** 资源危机警报 */
  alarms: string[],
}

// ============================================================
// §5 污染系统
// ============================================================

/** 污染等级 */
export type PollutionLevel = 0 | 1 | 2 | 3 | 4 | 5

/** 产业类型 */
export type IndustryType = 'agriculture' | 'mining' | 'manufacturing' | 'magic' | 'military' | 'trade' | 'service' | 'mixed'

/** 区域污染 */
export interface RegionPollution {
  regionId: string
  /** 工业排放累积 */
  industrialEmission: number
  /** 污染等级 */
  level: PollutionLevel
  /** 自然衰减速率 */
  decayRate: number
  /** 区域产业类型（影响排放系数） */
  industryType: IndustryType,
}

/** 污染状态 */
export interface PollutionState {
  /** 区域污染映射 */
  regionPollutions: Record<string, RegionPollution>
  /** 全球平均污染 0-100 */
  globalPollutionIndex: number,
}

// ============================================================
// §6 Store 聚合类型
// ============================================================

export interface EnvironmentEcologySummary {
  climate: ClimateState
  geography: GeographyState
  ecology: EcologyState
  naturalResource: NaturalResourceState
  pollution: PollutionState,
}

// ============================================================
// §7 常量辅助类型（从 constants.ts 迁移）
// ============================================================

/** 物种模板（世界观分层） */
export interface SpeciesTemplate {
  name: string
  category: SpeciesCategory
  rarity: SpeciesRarity
  region: string
  maxPopulation: number
  compatibleWorldviews: string[]
  role: 'predator' | 'prey' | 'producer' | 'decomposer' | 'keystone',
}

