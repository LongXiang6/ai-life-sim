/**
 * Purpose: Preserve the public AI client API while routing each responsibility to its owned component.
 * Owner: core:ai-service
 * Responsibility: Public exports only; request, retry, stream, logging, metrics, and validation logic live below ai-client/.
 */

export { getCacheStats, resetCacheStats } from './cache-stats'
export type { CacheStatsFilter, CacheStatsSnapshot } from './cache-stats'
export { getRoundCacheMetrics, recordRoundCacheMetrics } from './ai-client/cache-metrics'
export {
  AIResponseTruncatedError,
  isAiCredentialError,
  isAiResponseTruncatedError,
  setOnAiError,
} from './ai-client/errors'
export { buildProxyBody } from './ai-client/request-body'
export { callAI, callAIConversation, callAIStream, callAIStreamConversation } from './ai-client/calls'
export { callAIDegraded, callAIStreamDegraded } from './ai-client/degraded-calls'
export { handleStreamResponse } from './ai-client/stream-response'
export type {
  AICallLogContext,
  AICallOptions,
  AICallUsageSnapshot,
  CacheHitInfo,
  RoundCacheMetrics,
} from './ai-client/types'
