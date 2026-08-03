/**
 * @module orchestrator-shared.ts
 * @description 编排器依赖重导出，集中由编排器消费的内部模块接口。
 * @mod mod-engine
 *
 * 解决 D-07: orchestrator-system.ts 15 个相对 import 的合规问题。
 * 仅由编排器使用，避免把辅助模块误识别为一个子系统。
 */

// bootstrap
export {
  TimeSystem,
  timeSystem,
  summaryCompressor,
  memoryEngine,
  plotStructure,
  foreshadowing,
  memoryLifecycle,
  memoryForgetting,
  causalDelay,
  coreMemory,
  subsystemRelevance,
} from './bootstrap/engine-subsystem-registry'

export { shouldAlignTimeStepTransition } from './subsystems/time-system'

// helpers
export {
  DEFAULT_ENGINE_CONFIG,
  USE_AI_SUMMARY_COMPRESSION,
  getWorldRules,
  buildWordCountInstruction,
  buildStyleInstruction,
  resolveNarrativeToneHint,
  buildTimeBridgeSummary,
  extractBridgeSnapshot,
  globalDeadLoopDetector,
  sanitizeSubSystemState,
  clampNumber,
  buildLayeredMemoryStateCard,
  buildNarrativeCoherenceHeader,
  buildNarrativeWorldRules,
  collectActiveModWorldRules,
  collectMemoryStateSummaries,
  dedupeSummariesAgainstMemory,
  isSubsystemOpenForPrompt,
  isMvpSystemInstructionSubsystem,
  isMvpRuntimeSubsystem,
  resolveTimeStep,
  mapSubsystemStatesToDetectionStates,
  buildLifecycleNarrativeHint,
  buildLifecycleLifespanReminder,
  normalizeNarrativeParagraphs,
  buildNarrativeHints,
  type BridgeSnapshot,
  type EventLifecycleTracker,
  type NarrativeHintInput,
} from './helpers/orchestrator-pipeline-support'

export {
  RoundCommitBus,
  type RoundCommitSource,
  type RoundCommitResult,
} from './helpers/round-commit-bus'

export { runCompressionGate } from './helpers/compression-gate'

export {
  NarrativeBackgroundResultInbox,
  createNarrativeBackgroundInputHash,
  type NarrativeBackgroundAnalysisIdentity,
  type NarrativeBackgroundAnalysisKind,
  type NarrativeBackgroundAnalysisRecord,
} from './helpers/narrative-background-result-inbox'

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
  digestLedger,
  type DigestEntry,
  type LedgerEvent,
  type DigestLedgerSnapshot,
} from './helpers/digest-ledger'

export {
  buildNarrativeTimeContext,
  resolveNarrativeCalendarNode,
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
export type { EngineState, RoundInfo, RoundResult, NarrativeChunk, CharacterCreation, TimeStep } from './types'
export type {
  NarrativeEventCommitData,
  ParsedNarrative,
} from './subsystems/narrative-parser-system'

// 结算复算使用的逐轮迁移审计属于 foundation 公共契约；编排器只通过
// 该重导出边界消费它，避免在 orchestrator-system 中建立私有类型副本。
export type { NarrativeTransitionAuditSnapshot } from '@/foundation'
