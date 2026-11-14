/**
 * Purpose: Expose the mod-engine public API and shared runtime types.
 * Owner: mod-engine
 * Responsibility: Public export wiring only; simulation state remains in owning systems.
 *
 * @module index.ts
 * @description MOD 公共 API 导出 —— AI 人生模拟器引擎
 * @mod mod-engine
 */

// 类型
export type {
  TimeStep,
  RoundInfo,
  SimulationStatus,
  EngineConfig,
  NarrativeChunk,
  NarrativeDestinyPatternGrowthOption,
  NarrativeDestinyPatternGrowthPattern,
  NarrativeDestinyPatternGrowthProjection,
  EngineState,
  RoundResult,
  CompressionStats,
} from './types'

// 常量
export {
  CALENDAR,
  SEASONS,
  SEASON_NAMES,
  getSeasonForMonth,
  MONTH_ZH,
  ERA_SPAN,
  ERA_NAME_POOL,
  REIGN_TITLES,
  REIGN_DURATION,
  DEFAULT_ENGINE_CONFIG,
  STORAGE_KEYS,
  AVAILABLE_TIME_STEPS,
  RECENT_NARRATIVE_WINDOW,
} from './constants'
export {
  NARRATIVE_STYLE_PROMPTS,
  DEFAULT_WORD_COUNT_TARGET,
  COMPACT_JSON_KEY_MAP,
  buildWordCountInstruction,
  buildStyleInstruction,
} from './constants/narrative-config'
export { applyGameSave, collectGameSavePayload, collectManualGameSavePayload, saveCurrentGameToSlot } from './helpers/save-restore'
export {
  AVAILABLE_TIME_STEPS as ENGINE_AVAILABLE_TIME_STEPS,
  encodeTimeStepKey,
  setSimulationTimeStep,
  setSimulationTimeStepByKey,
} from './helpers/simulation-time-api'
export { resolveNarrativeBranchChoice, setForceBranchNextRound } from './helpers/branch-commands'

// Store
export { useEngineStore } from './store'

// Hooks
export { useEngine, useNarrative, useSimulationSnapshot, useSimulationAdvance, syncOrchestratorToEngineStore } from './hooks'
export { simulationBridge } from './simulation/simulation-bridge'
export type { SimulationSnapshot } from './simulation/simulation-types'

// 工具
export {
  formatRound,
  daysBetween,
  basePointsBetween,
  timeStepLabel,
  estimateTokens,
} from './utils'

// Prompts
export { narrativePrompt, NARRATIVE_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-prompt'
