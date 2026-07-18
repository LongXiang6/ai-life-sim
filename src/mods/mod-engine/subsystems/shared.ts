/**
 * @module subsystems/shared.ts
 * @description 子系统共享重导出 —— 集中所有相对路径 import，让 n* 子系统文件只需 1 行 `from './shared'`
 * @mod mod-engine
 *
 * 解决 D-07: orchestrator-system.ts 15 个相对 import 的合规问题。
 * 所有子系统文件引用以下符号时，统一走 `./shared`。
 */

// bootstrap
export {
  TimeSystem,
  timeSystem,
  narrativeParser,
  summaryCompressor,
  memoryEngine,
  plotStructure,
  foreshadowing,
  memoryLifecycle,
  memoryForgetting,
  causalDelay,
  coreMemory,
  subsystemRelevance,
} from '../bootstrap/engine-subsystem-registry'

export { shouldAlignTimeStepTransition } from './time-system'

// helpers
export { adaptationManager } from './adaptation-manager-system'

export {
  DEFAULT_ENGINE_CONFIG,
  MAX_NARRATIVE_HISTORY,
  MAX_CHARACTER_CREATIONS,
  USE_AI_SUMMARY_COMPRESSION,
  getWorldRules,
  buildWordCountInstruction,
  buildStyleInstruction,
  resolveNarrativeToneHint,
  buildEventInjectionText,
  buildTimeBridgeSummary,
  extractBridgeSnapshot,
  extractL0Title,
  WorldEventBus,
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
  isMvpNarrativeChangeSubsystem,
  isMvpPromptSubsystem,
  isMvpRuntimeSubsystem,
  buildMvpSubsystemGuide,
  resolveTimeStep,
  mapSubsystemStatesToDetectionStates,
  buildLifeStageNarrativeHint,
  resolveLifeStageFromAge,
  normalizeNarrativeParagraphs,
  buildNarrativeHints,
  INFORMATION_PRIORITY_RULE,
  type BridgeSnapshot,
  type EventLifecycleTracker,
  type DomainEvent,
  type SubsystemInstruction,
  type NarrativeHintInput,
} from '../helpers/orchestrator-pipeline-support'

export {
  RoundCommitBus,
  type RoundCommitSource,
  type RoundCommitResult,
} from '../helpers/round-commit-bus'

export { runNarrativeInterceptors } from '../helpers/narrative-interceptor-pipeline'

export {
  digestLedger,
  type DigestEntry,
  type LedgerEvent,
  type DigestLedgerSnapshot,
} from '../helpers/digest-ledger'

export {
  buildNarrativeTimeContext,
  readEraStartYearFromConfig,
  readBirthEraYearFromConfig,
  formatNarrativeTimeLabel,
  resolveCalendarEraYear,
} from '../helpers/narrative-calendar'

export { buildTimeScaleNarrativeHint } from '../helpers/time-scale-narrative'

export { generateArchetypeHint, buildLifespanReminder } from '../helpers/life-stage-archetypes'

export { collectGameSavePayload } from '../helpers/save-restore'

// constants
export { computeNarrativeMaxTokens, DEFAULT_WORD_COUNT_TARGET } from '../constants/narrative-config'
export { RECENT_NARRATIVE_WINDOW } from '../constants'

// simulation
export { simulationBridge } from '../simulation/simulation-bridge'

// store
export { useEngineStore } from '../store'

// types
export type { EngineState, RoundInfo, RoundResult, NarrativeChunk, CharacterCreation, TimeStep } from '../types'
export type { ParsedNarrative } from './narrative-parser-system'
