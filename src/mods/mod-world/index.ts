/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 世界
 * @mod mod-world
 */

// 类型
export type {
  WorldConfig,
  WorldEntity,
  Nation,
  Faction,
  NobleHouse,
  Settlement,
  TradeRoute,
  AnyWorldEntity,
  TimelineEvent,
  StageMeta,
  WorldTimelineInternalState,
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
  STAGE_SPAN,
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
export type { WorldInitAIStatus } from './store'

// Hooks
export { useWorld, useWorldEntities, useWorldTime } from './hooks'

// AI Prompts
export { worldConfigPrompt } from './prompts/world-config-prompt'
export { worldTagsPrompt } from './prompts/world-tags-prompt'
export { worldTimelinePrompt } from './prompts/world-timeline-prompt'
export { worldEntityPrompt } from './prompts/world-entity-prompt'
export { worldCalibrationPrompt, worldCalibrationOutputSchema } from './prompts/world-calibration-prompt'

export {
  buildDefaultCalibration,
  clampCalibration,
  clampModifier,
  formatCalibrationSummary,
  getEventDistributionStrategy,
  getImpactRangeModifier,
  getWorldviewStyleHint,
  FORMULA_KEYS,
  inferMapTemplate,
  DEFAULT_ECONOMY_TIER_RATIOS,
  MODIFIER_MIN,
  MODIFIER_MAX,
} from './utils/calibration-clamp'

export { getStageIndex } from './utils/stage-index'

export { formatAdaptationCalibrationBlock, fillAdaptationPrompt } from './utils/adaptation-prompt-calibration'

export {
  getWorldCalibration,
  getFormulaModifier,
} from './utils/calibration-access'

export {
  isWorldInitAIAvailable,
  shouldUseStaticEntityFallback,
  shouldUseGenericSimulationPools,
  resolveStaticPoolWorldviewKey,
} from './utils/world-init-fallback'

export {
  buildWorldCoherenceHint,
  buildTimelineStyleHint,
  resolveWorldviewStyleHint,
  TIMELINE_NARRATIVE_STYLE,
  NARRATIVE_STYLE_DEFAULT,
} from './utils/world-coherence-hints'

export {
  inferWorldCoherenceFromDescription,
  applyCoherenceToWorldConfig,
  applyCoherenceKeepUserTags,
  previewCoherenceCorrection,
  buildCoherenceNote,
  configConflictsWithPrehistoric,
} from './utils/world-coherence-inference'
export type {
  WorldCoherenceInference,
  CoherencePreview,
  CoherenceFieldChange,
} from './utils/world-coherence-inference'

// 激活 shared/ 的世界观类型规范化 → 标准化用户输入的世界观标签
export { normalizeWorldviewType, WORLDVIEW_TYPE_MAP } from '@/core/shared'

export {
  mapPowerSystemZhToTag,
  mapWorldviewEssenceZhToTag,
  buildCoherenceLocksFromUi,
  COHERENCE_LOCK_FIELD_MAP,
  CIVILIZATION_ZH_MAP,
  SPATIAL_FORM_ZH_MAP,
} from './utils/world-config-mapping'

export { buildWorldInitPromptVars } from './utils/world-init-prompt-vars'
export { buildWorldInitPipelineBudgets } from './utils/world-init-budgets'
export type { WorldInitPipelineBudgets } from './utils/world-init-budgets'

export {
  runWorldInitPipeline,
  createDefaultWorldInitSteps,
  createWorldInitPipelineContext,
} from './utils/world-init-pipeline'
export type { WorldInitStep, WorldInitPipelineContext } from './utils/world-init-pipeline'

export { resolvePresetWorldCode } from './utils/preset-world-code'
export {
  scanWorldCodesWithGeneratedCache,
  hasWorldGeneratedCache,
  clearWorldGeneratedCache,
} from './utils/world-generated-cache'
