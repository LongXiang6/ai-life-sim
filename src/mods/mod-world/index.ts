/**
 * Purpose: Expose the mod-world public API and stable type boundary.
 * Owner: mod-world
 * Responsibility: Public exports only; world business decisions stay in owned systems and utilities.
 *
 * @module index.ts
 * @description MOD 公共 API 导出 —— 世界
 * @mod mod-world
 */

// 类型
export type {
  WorldConfig,
  WorldContextInstance,
  WorldContextCollection,
  WorldSnapshot,
  RegionData,
  // 世界标签 V2（6×39 层次标签体系）
  WorldTagsV2,
  SocietyTags,
  EnvironmentTags,
  EconomyTags,
  SupernaturalTags,
  DemographicsTags,
  CulturalFabricTags,
  WorldTagConstraints,
  WorldCalibration,
  WorldCalibrationFormulas,
  FormulaModifierKey,
  EventDistributionStrategy,
  MapTemplateId,
  EntityCountRange,
} from './types'

// 常量
export {
  ESSENCE_TAGS,
  MAP_TEMPLATES,
  SPACE_POWER_CAP,
  ENTITY_GENERATION_COUNTS,
  STORAGE_KEYS,
} from './constants'

// 世界标签默认值 + 工具函数
export {
  WORLDVIEW_TAG_DEFAULTS,
  combineTagDefaults,
  TAG_VALUE_ZH_MAP,
  translateTagValue,
  formatWorldTagsText,
} from './constants/world-tag-defaults'

// 预设世界
export {
  PRESET_WORLDS,
  DEFAULT_GENDERS,
  ADDITIONAL_GENDERS,
  ADDITIONAL_RACES,
  getPresetWorld,
  getMaterialistWorlds,
  getIdealistWorlds,
  getSurvivalHorrorWorlds,
} from './constants/presets'
export type { PresetWorld, WorldCategory } from './constants/presets'

// 世界配置映射 + 初始化调度
export {
  buildWorldConfigFromPreset,
  buildWorldConfigFromCustom,
  allocateWorldCode,
} from './utils/preset-to-config'
export type { CustomWorldInput } from './utils/preset-to-config'
// 重初始化 API 见 ./world-init-api.ts（避免拉入 world-init-bundle 加载链）

// Store
export { useWorldStore } from './store'
export { sanitizeWorldStateSnapshot } from './utils/world-state-migration'
export {
  listWorldContexts,
  getCurrentWorldContext,
  contextHasCapability,
  canRunBackgroundWorldSubsystem,
  assertWorldSpatialNode,
  getCurrentRegion,
  setCurrentRegion,
} from './world-context-api'

// Hooks
export { useWorld, useWorldRegions, useWorldTime } from './hooks'

export {
  buildDefaultCalibration,
  clampCalibration,
  clampModifier,
  formatCalibrationSummary,
  getWorldviewStyleHint,
  FORMULA_KEYS,
  inferMapTemplate,
  MODIFIER_MIN,
  MODIFIER_MAX,
} from './utils/calibration-clamp'

export { getWorldCalibration, getFormulaModifier } from './utils/calibration-access'
export {
  buildDefaultWorldScale,
  clampWorldScale,
  getCivilizationScaleBaseline,
} from './utils/world-scale-calibration'

export { formatAdaptationCalibrationBlock, fillAdaptationPrompt } from './utils/adaptation-prompt-calibration'

export {
  shouldUseGenericSimulationPools,
  resolveStaticPoolWorldviewKey,
} from './utils/world-pool-selectors'

// 激活 shared/ 的世界观类型规范化 → 标准化用户输入的世界观标签
export { normalizeWorldviewType, WORLDVIEW_TYPE_MAP } from '@/core/shared'
export {
  createDefaultPowerFramework,
  materializePowerFramework,
  assertValidPowerFramework,
  formatPowerFrameworkForPrompt,
} from './utils/power-framework'

export { inferAnchorYearFromDescription } from './utils/world-init-anchor-year'

export { resolvePresetWorldCode } from './utils/preset-world-code'
