/**
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
  SUMMARY_INTERVAL,
  COMPRESS_L1_DELAY_BLOCKS,
  RECENT_NARRATIVE_WINDOW,
  SUMMARY_LEVEL_MULTIPLIER,
  COMPRESS_L2_MERGE_COUNT,
  COMPRESS_L3_MERGE_COUNT,
  MIN_SUMMARY_TOKENS,
  MAX_SUMMARY_TOKENS,
} from './constants'
export {
  NARRATIVE_STYLE_PROMPTS,
  WORD_COUNT_RANGES,
  DEFAULT_WORD_COUNT_TARGET,
  COMPACT_JSON_KEY_MAP,
  buildWordCountInstruction,
  buildStyleInstruction,
} from './constants/narrative-config'
export {
  PRE_GEN_CONFIG,
  savePreGenResult,
  loadPreGenResult,
  clearPreGenResult,
  getPreGenStatus,
  setPreGenStatus,
} from './constants/pre-gen-config'
export type {
  PreGenStatus,
  PreGenCache,
} from './constants/pre-gen-config'
export { checkAndClearPreGenOnTimeStepChange, clearPreGenQueue, fillPreGenQueue, getPreGenQueueLength, getPreGenQueueStatus, subscribePreGenQueue } from './helpers/pre-gen-queue'
export type { PreGenCachedRound, PreGenQueueStatus } from './helpers/pre-gen-queue'
export { applyGameSave, collectGameSavePayload, saveCurrentGameToSlot } from './helpers/save-restore'
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
export { useEngine, useNarrative, useSimulationSnapshot, useSimulationAdvance, usePreGenQueueStatus, syncOrchestratorToEngineStore } from './hooks'
export { simulationBridge } from './simulation/simulation-bridge'
export type { SimulationSnapshot } from './simulation/simulation-types'

// 工具
export {
  formatRound,
  daysBetween,
  timeStepLabel,
  computeSummaryTokenBudget,
  computeSummaryL2Tokens,
  computeSummaryL3Tokens,
  estimateTokens,
  estimateTokenBudget,
  clampMaxTokens,
} from './utils'

// Prompts
export { narrativePrompt, NARRATIVE_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-prompt'
export { buildSummaryPrompt, buildSummarySystemPrompt, summaryPrompt } from './prompts/summary-prompt'
