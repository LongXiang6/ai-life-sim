/**
 * @module index
 * @description mod-environment-ecology 公共 API 导出
 * @mod mod-environment-ecology
 */

// === 类型 ===
export type {
  ClimateZone,
  Season,
  DisasterType,
  Disaster,
  SeasonEffect,
  SpecialSeason,
  ClimateState,
  SpeciesCategory,
  SpeciesRarity,
  EcologyMetrics,
  SpeciesEntry,
  EcologyState,
  PollutionLevel,
  RegionPollution,
  PollutionState,
  IndustryType,
  EnvironmentEcologySummary,
} from './types'

// === 常量 ===
export {
  // 气候常量
  SEASON_ORDER,
  SEASON_LABELS,
  CLIMATE_ZONE_LABELS,
  DISASTER_LABELS,
  DISASTER_BASE_SEVERITY,
  DISASTER_POOL_BY_WORLDVIEW,
  SEASON_DURATION,
  SEASON_EFFECTS,
  WORLD_SPECIAL_SEASONS,
  // 生态常量
  WORLDVIEW_SPECIES_POOL,
  SPECIES_POOL,
  ECOLOGY_RANGE,
  BASE_BIODIVERSITY_RECOVERY,
  HABITAT_DAMAGE_FACTOR,
  INVASIVE_SPREAD_PROBABILITY,
  EXTINCTION_THREAT_THRESHOLD,
  EXTINCTION_PROBABILITY,
  EXTINCTION_INDEX_PENALTY,
  EXTINCTION_THREAT_MAX,
  // 污染常量
  POLLUTION_LEVEL_LABELS,
  POLLUTION_LEVEL_THRESHOLDS,
  NATURAL_DECAY_RATE,
  EMISSION_PER_INDUSTRY,
  INDUSTRY_EMISSION_MAP,
} from './constants'

// === 工具函数 ===
export {
  ROUND_DECIMALS,
  round,
  clamp,
  pickRandom,
  randomInt,
  getPollutionLevel,
} from './utils'

// === Store ===
export { useEnvironmentEcologyStore } from './store'

// === Hook ===
export {
  useClimate,
  useEcology,
  usePollution,
  useEnvironmentEcology,
} from './hooks'
