/**
 * @module index.ts
 * @description AI 服务统一导出
 * @mod core
 */

export { callAI, callAIConversation, callAIStream, callAIStreamConversation, callAIDegraded, callAIStreamDegraded, getCacheStats, resetCacheStats, recordRoundCacheMetrics, getRoundCacheMetrics, setOnAiError, isAiCredentialError } from './ai-client'
export type { AICallOptions, CachePoolType, InternalCachePool, CacheHitInfo, CacheStatsFilter, CacheStatsSnapshot, RoundCacheMetrics, AICallLogContext, AICallUsageSnapshot } from './ai-client'
export { resolveInternalCachePool } from './ai-client'
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
  computeNarrativeEventRecognitionTokenBudget,
  computeNarrativeSettlementTokenBudget,
  computeNarrativeTokenBudget,
} from './narrative-token-budget'
export type {
  NarrativeEventRecognitionTokenBudgetInput,
  NarrativeSettlementTokenBudgetInput,
  NarrativeTokenBudgetCalibration,
  NarrativeTokenBudgetInput,
} from './narrative-token-budget'
export { fetchDeepSeekBalance } from './deepseek-balance-client'
export type { DeepSeekBalanceInfo, DeepSeekBalanceSnapshot } from './deepseek-balance-client'
export { diagnoseApiError, diagnoseProxyError, formatApiErrorForUser } from './api-error'
export type { ApiDiagnostic } from './api-error'
export {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_ID,
  DEFAULT_AI_MODEL,
  LEGACY_MANAGED_AI_PROVIDER_ID,
  LEGACY_MANAGED_AI_MODEL,
  LEGACY_MANAGED_AI_FALLBACK_MODEL,
  isServerManagedProvider,
  isRegisteredProviderBaseUrl,
  shouldAggregateManagedNonStream,
  REASONING_EFFORT_OPTIONS,
  resolveProvider,
  getProviderIds,
  getProviderModels,
} from './provider-config'
export type {
  AIProviderConfig,
  ProviderModel,
  CustomProviderConfig,
  ResolvedProvider,
} from './provider-config'
export { resolveSeed, generateSeed, saveSeed, loadSeed } from './resolve-seed'
