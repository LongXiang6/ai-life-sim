/**
 * @module index.ts
 * @description AI 服务统一导出
 * @mod core
 */

export { callAI, callAIConversation, callAIStream, callAIStreamConversation, callAIDegraded, callAIStreamDegraded, getCacheStats, resetCacheStats, recordRoundCacheMetrics, getRoundCacheMetrics, setOnAiError, isAiCredentialError } from './ai-client'
export type { AICallOptions, CachePoolType, CacheHitInfo, CacheStatsFilter, CacheStatsSnapshot, RoundCacheMetrics, AICallLogContext, AICallUsageSnapshot } from './ai-client'
export { callAIWithPromptTemplate } from './ai-call-wrapper'
export type { UnifiedCallOptions, PromptTemplateLike } from './ai-call-wrapper'
export { applyKvPromptOrder } from './kv-prompt-order'
export type { KvPromptOrderResult } from './kv-prompt-order'
export { handleStream } from './stream-handler'
export { buildPrompt, buildSegmentedPrompt, buildNarrativeUserJson, getNarrativeUserSegments } from './prompt-builder'
export type { PromptSegments, PromptSegmentStrategy, BuildNarrativeUserJsonOptions } from './prompt-builder'
export { buildConversationMessages } from './conversation-messages'
export type { ChatMessage, ConversationBuildOptions } from './conversation-messages'
export {
  USE_LEGACY_SEGMENTED_PROMPT,
  USE_AI_SUMMARY_COMPRESSION,
  KV_TWO_USER_SEGMENTS,
  OMIT_EMPTY_PROMPT_FIELDS,
  DEDUP_NARRATIVE_HISTORY,
  KV_MESSAGE_STRATEGY,
  BRIDGE_SUMMARY_MIN_TICKS,
  KV_CONVERSATION_WINDOW,
  EXPERIMENTAL_TIME_STEPS_UI,
} from './prompt-flags'
export type { KVMessageStrategy } from './prompt-flags'
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
  REASONING_BUDGET_MAP,
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
