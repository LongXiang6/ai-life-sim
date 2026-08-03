/**
 * @module index.ts
 * @description AI 服务统一导出
 * @mod core
 */

export { AIResponseTruncatedError, callAI, callAIConversation, callAIStream, callAIStreamConversation, callAIDegraded, callAIStreamDegraded, getCacheStats, resetCacheStats, recordRoundCacheMetrics, getRoundCacheMetrics, setOnAiError, isAiCredentialError, isAiResponseTruncatedError } from './ai-client'
export type { AICallOptions, CacheHitInfo, CacheStatsFilter, CacheStatsSnapshot, RoundCacheMetrics, AICallLogContext, AICallUsageSnapshot } from './ai-client'
export { INTERNAL_CACHE_POOLS, resolveInternalCachePool } from './cache-pool'
export type { CachePoolType, InternalCachePool } from './cache-pool'
export {
  AI_CALL_DEADLINE_MAX_MS,
  AI_CALL_DEADLINE_MIN_MS,
  computeAiCallDeadlineMs,
} from './ai-call-deadline'
export type { AiCallDeadlineInput } from './ai-call-deadline'
export { callAIWithPromptTemplate } from './ai-call-wrapper'
export type { UnifiedCallOptions, PromptTemplateLike } from './ai-call-wrapper'
export { applyKvPromptOrder } from './kv-prompt-order'
export type { KvPromptOrderResult } from './kv-prompt-order'
export { parseAIJSON } from './parse-ai-json'
export { handleStream } from './stream-handler'
export { buildSegmentedPrompt, buildNarrativeUserJson } from './prompt-builder'
export type { PromptSegments, PromptSegmentStrategy } from './prompt-builder'
export {
  USE_AI_SUMMARY_COMPRESSION,
  OMIT_EMPTY_PROMPT_FIELDS,
  BRIDGE_SUMMARY_MIN_TICKS,
  EXPERIMENTAL_TIME_STEPS_UI,
} from './prompt-flags'
export { getAiUsageStats, resetAiUsageStats, formatNanoYuan, DEEPSEEK_PRICE_VERSION, DEEPSEEK_PRICE_SOURCE, getNarrativeTokenCalibration } from './usage-stats'
export type { AiUsageAggregate, AiUsageContext, AiUsageStatsSnapshot, NarrativeTokenCalibrationSample } from './usage-stats'
export {
  computeNarrativeBasicAttributeTokenBudget,
  computeNarrativeDataAnalysisTokenBudget,
  computeNarrativeEventRecognitionTokenBudget,
  computeNarrativeMacroImpactTokenBudget,
  computeNarrativeTokenBudget,
} from './narrative-token-budget'
export type {
  NarrativeBasicAttributeTokenBudgetInput,
  NarrativeDataAnalysisTokenBudgetInput,
  NarrativeEventRecognitionTokenBudgetInput,
  NarrativeMacroImpactTokenBudgetInput,
  NarrativeTokenBudgetCalibration,
  NarrativeTokenBudgetInput,
} from './narrative-token-budget'
export { fetchDeepSeekBalance } from './deepseek-balance-client'
export type { DeepSeekBalanceInfo, DeepSeekBalanceSnapshot } from './deepseek-balance-client'
export { diagnoseApiError, diagnoseProxyError, formatApiErrorForUser } from './api-error'
export type { ApiDiagnostic } from './api-error'
export {
  DEFAULT_AI_PROVIDER_ID,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEEPSEEK_API_PRESET,
  DEEPSEEK_PRESET_BASE_URL,
  DEEPSEEK_PRESET_MODEL,
  isRegisteredProviderBaseUrl,
  REASONING_EFFORT_OPTIONS,
} from './provider-config'
export { resolveSeed, generateSeed, saveSeed, loadSeed } from './resolve-seed'
