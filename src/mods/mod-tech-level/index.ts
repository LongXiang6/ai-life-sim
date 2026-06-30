/**
 * @module index
 * @description mod-tech-level 公共 API 导出
 * @mod mod-tech-level
 */

// === 类型 ===
export type {
  PrimaryFocus,
  IndustryState,
  RegionResource,
  ResourceDistributionState,
  CultureTrendCategory,
  CultureTrend,
  CultureTechState,
  TechLevelSummary,
  TerrainType,
  ResourceRangeEntry,
} from './types'

// === 常量 ===
export {
  FOCUS_THRESHOLDS,
  FOCUS_LABELS_ZH,
  POLLUTION_FACTORS,
  TECH_LEVEL_RANGE,
  RESOURCES_RANGE,
  PRODUCTIVITY_RANGE,
  ADOPTION_RANGE,
  BASE_RESOURCES,
  RENEWABLE_RESOURCES,
  RECOVERY_RATES,
  DISCOVERY_PROBABILITY,
  DEPLETION_THRESHOLD,
  RESOURCE_LABELS,
  TECH_LEVEL_MIN,
  TECH_LEVEL_MAX,
  DEFAULT_TECH_LEVEL,
  TECH_BREAKTHROUGH_PROBABILITY,
  BASE_TECH_PROGRESS,
  TRADE_BOOST_MULTIPLIER,
  KNOWLEDGE_BOOST_MAX,
  KNOWLEDGE_DIVISOR,
  WAR_TECH_PENALTY,
  MAX_ACTIVE_TRENDS,
  CULTURE_TREND_DURATION_MIN,
  CULTURE_TREND_DURATION_MAX,
  KNOWLEDGE_BONUS_PER_LEVEL,
  WORK_QUALITY_PER_TREND,
  CULTURE_TREND_POOL,
  TREND_CATEGORY_LABELS,
} from './constants'

// === 工具函数 ===
export {
  ROUND_DECIMALS,
  round,
  clamp,
  pickRandom,
  computeAverage,
  randomInt,
} from './utils'

// === 基础地形资源 ===
export { BASE_TERRAIN_RESOURCE_RANGES, WORLDVIEW_TERRAIN_EXTRAS } from './constants'

// === Store ===
export { useTechLevelStore } from './store'

// === Hook ===
export { useIndustry, useResource, useCultureTech } from './hooks'
