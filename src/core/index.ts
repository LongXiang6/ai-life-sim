/**
 * @module index.ts
 * @description Core 层统一导出 —— MOD 加载器 + 事件总线 + 全局 Store + AI 服务 + 存储 + 主题
 * @mod core
 */

// MOD 加载器
export {
  defineMod,
  loadMods,
  ENGINE_FEATURE_FLAGS,
  modRegistry,
  resolveDependenciesV2,
  parseDependency,
  validateDirectoryName,
  validateManifest,
  validateStructure,
  validateFeatureFlags,
  invokeModLifecycles,
  notifyConfigurationChanged,
  invokeModOnLoad,
  getModImporter,
  getModControlImporter,
  getModApiImporter,
  validateRemoteContracts,
  reportRemoteContractIssues,
  enrichModLoadError,
  runtimeRegistry,
} from './mod-loader'
export type {
  LoadResult,
  ModEntry,
  ResolveResult,
  ValidationResult,
  RemoteContractIssue,
  ModLoadErrorWithHint,
  RuntimeRegistrySnapshot,
  RuntimeModSnapshot,
  SubsystemBinding,
} from './mod-loader'

// Remote Interface
export { remote } from './remote-interface/remote-interface'

// Settings 阶段
export { runSettingsStage } from './mod-loader/settings-stage'
export type { SettingsStageResult } from './mod-loader/settings-stage'

// Prototype 阶段
export { runPrototypeStage } from './mod-loader/prototype-stage'
export type { PrototypeStageResult } from './mod-loader/prototype-stage'

// 存储命名空间
export { createStorageNamespace } from './storage-namespace'

// 子系统抽象基类（BaseSubsystem，implements ISubSystemV2；模拟系统重写梯队一）
export { BaseSubsystem } from './subsystem-base'

// 存储迁移
export { autoMigrate, autoMigrateFromDir } from './store-migration/migration-runner'
export type { MigrationStep, MigrationResult } from './store-migration/migration-runner'

// 事件总线
export { eventBus, CoreEvents, EngineEvents, WorldEvents, CharacterEvents, StorageEvents } from './event-bus'
export type { EventName } from './event-bus'

// 全局 Store
export { useGlobalStore } from './global-store'
export type { GlobalState, GamePhase } from './global-store'

// AI 服务
export { callAI, callAIConversation, callAIStream, callAIStreamConversation, callAIDegraded, callAIStreamDegraded, handleStream, buildPrompt, buildSegmentedPrompt, buildNarrativeUserJson, getNarrativeUserSegments, buildConversationMessages, recordRoundCacheMetrics, getRoundCacheMetrics, callAIWithPromptTemplate, isAiCredentialError, parseAIJSON } from './ai-service'
export type { AICallOptions, CachePoolType, InternalCachePool, CacheHitInfo, PromptSegments, RoundCacheMetrics, ChatMessage, KVMessageStrategy, AICallLogContext, AICallUsageSnapshot, UnifiedCallOptions, PromptTemplateLike } from './ai-service'

// 存储服务
export { configStore, saveStore, cacheStore, tempStore, opfsStorage, saveManager, clearGameProgressFromLocalStorage, flushOpfsQueueNow, safeCleanupReload } from './storage'
export type { SaveMetadata } from './storage'

// 主题
export { ThemeProvider, useThemeStore } from './theme'
export type { ThemeType } from './theme'

// 插桩模式
export {
  enableInstrumentMode,
  disableInstrumentMode,
  isInstrumentEnabled,
  getInstrumentHooks,
} from './instrument/instrument-mode'
export type { InstrumentHooks, PromptAssemblyReport } from './instrument/instrument-mode'

export {
  postNarrativeRoundOutcome,
} from './logger/narrative-round-diagnostic'
export type {
  NarrativeDiagnosticPhase,
  NarrativeRoundAdoption,
  NarrativeRoundOutcomeReport,
} from './logger/narrative-round-diagnostic'

// 跨 MOD 公共函数库
export {
  // common-utils
  safeJsonParse,
  clamp,
  randomInt,
  deepMerge,
  uniqueId,
  delay,
  // character-utils
  calcAgeDecay,
  calcAttributeValue,
  isLifespanExpired,
  getHealthStatus,
  // world-utils
  WORLDVIEW_TYPE_MAP,
  normalizeWorldviewType,
  TERRAIN_HABITABILITY,
  getTerrainHabitability,
  calcResourceAbundance,
  // narrative-utils
  NARRATIVE_PROMPT_KEYS,
  calcTagMatchScore,
} from './shared'
export type { NarrativePromptKey } from './shared'

// Deterministic life scoring
export * from './scoring'
