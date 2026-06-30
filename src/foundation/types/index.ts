/**
 * @module index.ts
 * @description Foundation 类型统一导出
 * @mod foundation
 */

export type {
  ModManifest,
  ModManifestV2,
  ModCampaignHooks,
  ModRoute,
  ModEvents,
  ModDependency,
  ModFeatureFlags,
  ModLifecycle,
  ModLifecycleV2,
  ModLifecycleV3,
  ModSettingDeclaration,
  ConfigurationChangedData,
  ModContext,
  ModScanEntry,
  StorageNamespace,
  IEventBus,
  GlobalStore,
  IAIService,
  IStorageService,
} from './mod.types'

export type {
  ISubSystem,
  ISubSystemV2,
  ISubSystemV3,
  ReadonlyRoundContext,
  WritableRoundContext,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
  TimeStep,
} from './subsystem.types'

export type {
  AIModelConfig,
  NarrativeResponse,
  ResponseFormat,
} from './api.types'

export type {
  PromptTemplate,
  PromptContext,
  WorldSetting,
  CharacterState,
  SummaryLevel,
  CompressedSummaryItem,
  CompressedSummaries,
  LifeStage,
  DeathCause,
  WorldDirectionRecord,
  YearEvent,
  LongTermMemory,
} from './narrative.types'
export type {
  NarrativeDirection,
  ForbiddenActionPattern,
  DifficultyLevel,
  NarrativeStage,
  NarrativeStageMachine,
} from './narrative.types'
export {
  FORBIDDEN_ACTION_PATTERNS,
  SAFETY_GUIDE,
  DIFFICULTY_LABELS,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_MULTIPLIERS_HEALTH,
  DIFFICULTY_MULTIPLIERS_FORTUNE,
} from './narrative.types'

// 属性类型
export type {
  AttributeId,
  AttributeTier,
  AttributeData,
} from './attribute.types'
export {
  ASSIGNABLE_ATTRIBUTE_IDS,
  HIDDEN_ATTRIBUTE_IDS,
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  ATTRIBUTE_DESCRIPTIONS,
  ATTRIBUTE_TIERS,
  HIDDEN_FORTUNE_RANGE,
} from './attribute.types'

// 世界观类型
export type {
  WorldviewId,
} from './worldview.types'
export {
  WORLDVIEW_IDS,
  WORLDVIEW_NAMES,
  WORLDVIEW_DESCRIPTIONS,
} from './worldview.types'
