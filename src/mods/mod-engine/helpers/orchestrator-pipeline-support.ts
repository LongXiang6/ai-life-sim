/**
 * @module orchestrator-pipeline-support.ts
 * @description orchestrator 管线本地依赖聚合（非公共 API，仅供 orchestrator-system 使用）
 * @mod mod-engine
 */

export { getWorldRules } from '../campaigns/default/prompts/system-prompt'
export {
  DEFAULT_ENGINE_CONFIG,
  MAX_NARRATIVE_HISTORY,
  MAX_CHARACTER_CREATIONS,
  USE_AI_SUMMARY_COMPRESSION,
} from '../constants'
export {
  buildWordCountInstruction,
  buildStyleInstruction,
  resolveNarrativeToneHint,
} from '../constants/narrative-config'
export {
  buildEventInjectionText,
  type EventLifecycleTracker,
} from './event-lifecycle-tracker'
export {
  buildTimeBridgeSummary,
  extractBridgeSnapshot,
  extractL0Title,
  type BridgeSnapshot,
} from './time-bridge-summary'
export {
  WorldEventBus,
  type DomainEvent,
  type SubsystemInstruction,
} from './cross-domain-rules'
export { globalDeadLoopDetector, deepSanitize, sanitizeSubSystemState, clampNumber } from './system-safety'
// 激活 shared/ 的叙事 Prompt Key 常量 → 子系统用标准化 key 注入 Prompt 片段
export { NARRATIVE_PROMPT_KEYS } from '@/core/shared'
export type { NarrativePromptKey } from '@/core/shared'
export {
  buildLayeredMemoryStateCard,
  buildMemoryStateCard,
  buildNarrativeCoherenceHeader,
  buildNarrativeWorldRules,
  collectMemoryStateSummaries,
  dedupeSummariesAgainstMemory,
  getNarrativeChangeBlockReason,
  isPromptNoiseSummary,
  isSubsystemOpenForPrompt,
  shouldSkipEconomyTierRules,
} from './subsystem-prompt-gate'
export {
  MVP_ALLOWED_SUBSYSTEMS_TEXT,
  MVP_SUBSYSTEM_GUIDE,
  isMvpNarrativeChangeSubsystem,
  isMvpPromptSubsystem,
  isMvpRuntimeSubsystem,
  shouldApplyMvpCommit,
} from './mvp-runtime-policy'
export { runPostNarrativePhase } from './post-narrative-processor'
export { resolveTimeStep } from '../utils/time-step-resolver'
export { mapSubsystemStatesToDetectionStates } from './detection-state-mapper'
export {
  buildLifeStageNarrativeHint,
  resolveLifeStageFromAge,
} from './life-stage-narrative'
export {
  generateArchetypeHint,
  buildLifespanReminder,
  countConsecutiveConflictRounds,
  isLastEventConflict,
  isPlayerGoalPeaceful,
  type NarrativeArchetype,
} from './life-stage-archetypes'
export { normalizeNarrativeParagraphs } from './normalize-narrative-paragraphs'
export {
  buildNarrativeHints,
  classifyActionScale,
  INFORMATION_PRIORITY_RULE,
} from './narrative-hints'
export type { NarrativeHintInput, NarrativeHints } from './narrative-hints'
