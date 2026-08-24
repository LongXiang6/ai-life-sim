/**
 * Purpose: Expose the stable Foundation type surface.
 * Owner: foundation:types
 * Responsibility: Type exports only; definitions remain in their owning modules.
 *
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
  LuckNarrativeDirection,
  LuckNarrativeGuidance,
  LuckModifiers,
  LuckState,
  LuckPersistenceState,
} from './luck.types'

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

export {
  EXECUTION_PHASES,
} from './execution-sequence.types'
export type {
  ExecutionPhase,
  ExecutionNodeSignalStatus,
  ExecutionRecordStatus,
  ExecutionOutcomeCodes,
  ExecutionFlowRegistration,
  ExecutionNodeDescriptor,
  ExecutionNodeRuntime,
  ExecutionNodeSignal,
  ExecutionSequenceNode,
  ExecutionSequenceEvent,
  ExecutionNodeRecord,
  ExecutionSequenceFailure,
  ExecutionSequenceResult,
  ResolveExecutionOrderOptions,
  RunExecutionSequenceOptions,
} from './execution-sequence.types'

export type {
  AIModelConfig,
  ReasoningEffort,
  NarrativeResponse,
  ResponseFormat,
} from './api.types'

export type {
  LifeScoringEvidenceKind,
  LifeScoringEvidence,
  LifeScoringDimension,
  LifeScoringIntegrityResult,
  LifeScoringResult,
  NarrativeTransitionAuditSnapshot,
  LifeScoringAuditSnapshot,
  StoredLifeScoringResult,
} from './scoring.types'

export type {
  PromptTemplate,
  PromptContext,
  WorldSetting,
  CharacterState,
  NarrativeTalentPromptView,
  CompressedMemoryEvent,
  CompressedSummaryItem,
  CompressedSummaries,
  DeathCause,
  WorldDirectionRecord,
  YearEventKeyEvent,
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
