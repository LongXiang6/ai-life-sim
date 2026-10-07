/**
 * Purpose: Centralize internal module surfaces consumed by the core round orchestrator.
 * Owner: mod-engine
 * Responsibility: Re-export existing orchestrator dependencies without becoming a public state owner.
 *
 * @module orchestrator-shared.ts
 * @description 编排器依赖重导出，集中由编排器消费的内部模块接口。
 * @mod mod-engine
 *
 * 解决 D-07: orchestrator-system.ts 15 个相对 import 的合规问题。
 * 仅由编排器使用，避免把辅助模块误识别为一个子系统。
 */

// bootstrap
export {
  CausalDelaySystem,
  ForeshadowingSystem,
  MemoryLifecycleSystem,
  PlotStructureSystem,
  SubsystemRelevanceSystem,
  SummaryCompressorSystem,
  TimeSystem,
  timeSystem,
  summaryCompressor,
  plotStructure,
  foreshadowing,
  memoryLifecycle,
  causalDelay,
  subsystemRelevance,
} from './bootstrap/engine-subsystem-registry'

// helpers
export {
  DEFAULT_ENGINE_CONFIG,
  buildWordCountInstruction,
  buildStyleInstruction,
  resolveNarrativeToneHint,
  globalDeadLoopDetector,
  sanitizeSubSystemState,
  clampNumber,
  buildLayeredMemoryStateCard,
  collectMemoryStateSummaries,
  dedupeSummariesAgainstMemory,
  isPromptNoiseSummary,
  isSubsystemDataEnabled,
  isSubsystemOpenForPrompt,
  isMvpRuntimeSubsystem,
  resolvePromptStateLayer,
  resolveTimeStep,
  normalizeNarrativeParagraphs,
  buildNarrativeHints,
  type NarrativeHintInput,
} from './helpers/orchestrator-pipeline-support'

export {
  RoundCommitBus,
  type RoundCommitSource,
  type RoundCommitResult,
} from './helpers/round-commit-bus'

export {
  createNarrativeLifeRunId,
  calculateNarrativeRepetitionMetric,
  collectNarrativeRepetitionMetrics,
  isNarrativeRepetitionMetric,
  summarizeNarrativeHistoryRepetition,
  summarizeNarrativeRepetitionMetrics,
} from './helpers/narrative-repetition-metrics'

export type { NarrativePromptComponent } from './helpers/narrative-prompt-component-types'

export {
  buildNarrativeTimeContext,
  readEraStartYearFromConfig,
  readBirthEraYearFromConfig,
  formatNarrativeTimeLabel,
  resolveCalendarEraYear,
} from './helpers/narrative-calendar'

export { buildTimeScaleNarrativeHint } from './helpers/time-scale-narrative'

// constants
export { DEFAULT_WORD_COUNT_TARGET } from './constants/narrative-config'
export { RECENT_NARRATIVE_WINDOW } from './constants'

// simulation
export { simulationBridge } from './simulation/simulation-bridge'

// store
export { useEngineStore } from './store'

// types
export type {
  EngineState,
  RoundInfo,
  RoundResult,
  NarrativeChunk,
  NarrativeEventResult,
  NarrativeDestinyPatternGrowthProjection,
  TimeStep,
} from './types'
export type {
  NarrativeAIStoryContinuityData,
} from './helpers/narrative-ai-protocol'
export type {
  NarrativeStoryContinuityTransactionSnapshot,
  PreparedNarrativeStoryContinuity,
} from './subsystems/summary-compressor-system'
export type {
  NarrativeEventCommitData,
  ParsedNarrative,
} from './subsystems/narrative-parser-system'

// 结算复算使用的逐轮迁移审计属于 foundation 公共契约；编排器只通过
// 该重导出边界消费它，避免在 orchestrator-system 中建立私有类型副本。
export type { NarrativeTransitionAuditSnapshot } from '@/foundation'
