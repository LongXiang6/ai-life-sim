/**
 * @module index
 * @description mod-base-universe 公共 API 导出
 * @mod mod-base-universe
 */

// 类型
export type {
  CelestialPhase,
  CelestialEvent,
  CelestialEventRarity,
  CelestialPrerequisiteType,
  CelestialEventPrerequisite,
  CelestialHistoryEntry,
  CelestialCrossEffect,
  CelestialState,
  EraEntry,
  EraPhase,
  EraHints,
  EraHistoryEntry,
  EraState,
  TerrainType,
  MapTemplate,
  MapTemplateOptions,
  StellarLayoutMode,
  RegionResource,
  FactionRelationType,
  FactionRelationEntry,
  WorldRegion,
  WorldMapState,
  ProphecySource,
  Prophecy,
  ProphecyOmenStage,
  ProphecyOmenEvent,
  FateProphecyState,
  DeityEffect,
  DeityPool,
  DivineState,
  BaseUniverseSummary,
  ProphecyTemplate,
  TerrainWeight,
  CelestialProbabilityConfig,
} from './types'

// 常量
export {
  CELESTIAL_PHASE_LABELS,
  CELESTIAL_PHASE_LABELS_BY_WORLDVIEW,
  CELESTIAL_LUCK_MODS,
  CELESTIAL_PROBABILITIES,
  CELESTIAL_RARITY_WEIGHTS,
  CELESTIAL_HISTORY_MAX,
  CELESTIAL_EVENT_POOL,
  CELESTIAL_EVENT_POOL_BY_WORLDVIEW,
  ERA_HINTS_ANCIENT,
  ERA_HINTS_XIANXIA,
  ERA_HINTS_MODERN,
  ERA_HINTS_BY_WORLDVIEW,
  MAP_TEMPLATE_LABELS,
  MAP_TEMPLATE_REGION_COUNT,
  MAP_TEMPLATE_TERRAINS,
  TERRAIN_ZH_MAP,
  TERRAIN_RESOURCE_POOL,
  TERRAIN_RESOURCE_POOL_BY_WORLDVIEW,
  REGION_NAME_PREFIXES_BY_WORLDVIEW,
  REGION_NAME_SUFFIXES_BY_WORLDVIEW,
  FACTION_PREFIXES_BY_WORLDVIEW,
  FACTION_SUFFIXES_BY_WORLDVIEW,
  POPULATION_RANGE_BY_WORLDVIEW,
  TEMPERATURE_RANGE_BY_WORLDVIEW,
  HUMIDITY_RANGE_BY_WORLDVIEW,
  AVAILABLE_TEMPLATES_BY_WORLDVIEW,
  STELLAR_LINEAR_PARAMS,
  PLANAR_LAYER_PARAMS,
  ARCHIPELAGO_SPIRAL_PARAMS,
  STORAGE_KEYS,
  FACTION_RELATION_LABELS,
  FACTION_RELATION_MARKS,
  FACTION_RELATION_GENERATION_WEIGHTS,
  FACTION_RELATION_EVOLVE_CHANCE,
  FACTION_TENSION_INITIAL,
  FACTION_TENSION_DRIFT,
  FACTION_TENSION_WAR_THRESHOLD,
  FACTION_TENSION_ALLIANCE_THRESHOLD,
  FACTION_TENSION_CELESTIAL_BONUS,
  PROPHECY_TEMPLATES,
  PROPHECY_SOURCE_LABELS,
  PROPHECY_PROGRESS_STEP,
  PROPHECY_OMEN_THRESHOLDS,
  PROPHECY_OMEN_LABELS,
  COORD_RANGE,
  ADJACENT_DISTANCE,
} from './constants'

// 工具函数
export { ROUND_DECIMALS, round } from './utils'

// Store
export { useBaseUniverseStore } from './store'

// Hook
export { useBaseUniverse } from './hooks'
