/**
 * Purpose: Aggregate local orchestrator pipeline dependencies behind one internal import surface.
 * Owner: mod-engine
 * Responsibility: Re-export existing helpers for orchestrator-system without adding state or behavior.
 *
 * @module orchestrator-pipeline-support.ts
 * @description orchestrator 管线本地依赖聚合（非公共 API，仅供 orchestrator-system 使用）
 * @mod mod-engine
 */

export {
  DEFAULT_ENGINE_CONFIG,
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
  type BridgeSnapshot,
} from './time-bridge-summary'
export { globalDeadLoopDetector, deepSanitize, sanitizeSubSystemState, clampNumber } from './system-safety'
// 激活 shared/ 的叙事 Prompt Key 常量 → 子系统用标准化 key 注入 Prompt 片段
export { NARRATIVE_PROMPT_KEYS } from '@/core/shared'
export type { NarrativePromptKey } from '@/core/shared'
export {
  buildLayeredMemoryStateCard,
  buildMemoryStateCard,
  collectMemoryStateSummaries,
  dedupeSummariesAgainstMemory,
  isPromptNoiseSummary,
  isSubsystemOpenForPrompt,
} from './subsystem-prompt-gate'
export {
  isMvpPromptSubsystem,
  isMvpRuntimeSubsystem,
} from './mvp-runtime-policy'
export { resolveTimeStep } from '../utils/time-step-resolver'
export { mapSubsystemStatesToDetectionStates } from './detection-state-mapper'
export { normalizeNarrativeParagraphs } from './normalize-narrative-paragraphs'
export {
  buildNarrativeHints,
} from './narrative-hints'
export type { NarrativeHintInput, NarrativeHints } from './narrative-hints'
