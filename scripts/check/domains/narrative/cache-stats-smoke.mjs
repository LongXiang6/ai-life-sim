#!/usr/bin/env node
/**
 * Purpose: Regress AI cache and usage statistics in an isolated browser-like storage fixture.
 * Owner: quality:narrative
 * Responsibility: Cache-stat accounting assertions only.
 */

class MemoryStorage {
  #values = new Map()

  get length() { return this.#values.size }
  clear() { this.#values.clear() }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null }
  key(index) { return [...this.#values.keys()][index] ?? null }
  removeItem(key) { this.#values.delete(key) }
  setItem(key, value) { this.#values.set(key, String(value)) }
}

globalThis.localStorage = new MemoryStorage()

const {
  getCacheStats,
  recordCacheUsage,
  resetCacheStats,
} = await import('../../../../src/core/ai-service/cache-stats.ts')
const {
  getAiUsageStats,
  recordAiUsage,
} = await import('../../../../src/core/ai-service/usage-stats.ts')
const { normalizeAiUsage } = await import('../../../../src/core/ai-service/normalize-ai-usage.ts')
const { resolveInternalCachePool } = await import('../../../../src/core/ai-service/cache-pool.ts')

function assertOk(condition, message) {
  if (!condition) throw new Error(`[cache-stats-smoke] ${message}`)
}

assertOk(resolveInternalCachePool('narrative', 'narrative-main') === 'narrative-main', 'main narrative must have its own internal cache pool')
assertOk(resolveInternalCachePool('narrative', 'narrative-story-continuity') === 'narrative-story-continuity', 'story continuity must have its own internal cache pool')
assertOk(resolveInternalCachePool('narrative', 'narrative-talent-growth') === 'narrative-talent-growth', 'talent growth must have its own internal cache pool')
assertOk(resolveInternalCachePool('narrative', 'narrative-event-library') === 'narrative-event-library', 'event library must have its own internal cache pool')
assertOk(resolveInternalCachePool('lowFrequency', 'life-settlement-score') === 'low-frequency', 'life settlement scoring must use the low-frequency pool')
assertOk(resolveInternalCachePool('lowFrequency', 'ending-review') === 'low-frequency', 'ending review must use the low-frequency pool')

const deepseekMain = {
  providerId: 'deepseek',
  model: 'deepseek-v4-flash',
  pool: 'narrative',
  callKind: 'narrative-main',
}
const deepseekContinuity = { ...deepseekMain, callKind: 'narrative-story-continuity' }
const deepseekTalent = { ...deepseekMain, callKind: 'narrative-talent-growth' }
const deepseekEventLibrary = { ...deepseekMain, callKind: 'narrative-event-library' }
const managedMain = {
  providerId: 'managed',
  model: 'LongCat-2.0',
  pool: 'narrative',
  callKind: 'narrative-main',
}

const deepseekUsage = normalizeAiUsage({
  prompt_cache_hit_tokens: 640,
  prompt_cache_miss_tokens: 160,
  completion_tokens: 20,
  completion_tokens_details: { reasoning_tokens: 8 },
  total_tokens: 820,
})
assertOk(
  deepseekUsage?.hitTokens === 640 && deepseekUsage.missTokens === 160 && deepseekUsage.reasoningTokens === 8,
  'DeepSeek usage must keep explicit cache and reasoning fields',
)

const longcatUsage = normalizeAiUsage({
  prompt_tokens: 4816,
  cached_tokens: 0,
  cache_read_tokens: 0,
  effectiveCachedTokens: 4736,
  prompt_tokens_details: { cached_tokens: 4736 },
  completion_tokens: 2,
  total_tokens: 4818,
})
assertOk(
  longcatUsage?.hitTokens === 4736 && longcatUsage.missTokens === 80,
  'LongCat cache usage must prefer the effective nested cache count over zero-valued aliases',
)

localStorage.setItem('ai-cache-stats', JSON.stringify({ hitTokens: 999, missTokens: 1 }))
assertOk(getCacheStats(deepseekMain).hitRate === 0, 'legacy mixed statistics must not leak into a scoped model view')

localStorage.setItem('ai-usage-stats', JSON.stringify({
  version: 1,
  total: { knownCalls: 1, hitTokens: 999, missTokens: 1 },
  byPool: { narrative: { knownCalls: 1, hitTokens: 999, missTokens: 1 } },
}))
const migratedUsage = getAiUsageStats()
assertOk(
  migratedUsage.version === 2
    && migratedUsage.total.knownCalls === 0
    && Object.keys(migratedUsage.byPool).length === 0,
  'legacy broad-pool usage must not leak into fine-grained usage statistics',
)
recordAiUsage(deepseekUsage, {
  ...deepseekMain,
  pool: 'narrative-main',
  reasoningEffort: 'auto',
  lifeRunId: 'life-cache-smoke',
  round: 1,
  executionKind: 'real',
  durationMs: 1234,
})
assertOk(
  getAiUsageStats().byPool['narrative-main']?.knownCalls === 1,
  'new usage must be recorded under the resolved internal cache pool',
)
const latencyAggregate = getAiUsageStats().runs['life-cache-smoke']?.byPool['narrative-main']
assertOk(
  latencyAggregate?.latencySamples === 1
    && latencyAggregate.latencyMsTotal === 1234
    && latencyAggregate.latencyMaxMs === 1234,
  'per-run and per-pool usage must retain complete response latency statistics',
)

recordCacheUsage({ hitTokens: 100, missTokens: 100 }, deepseekMain)
recordCacheUsage({ hitTokens: 900, missTokens: 100 }, deepseekContinuity)
recordCacheUsage({ hitTokens: 600, missTokens: 400 }, deepseekTalent)
recordCacheUsage({ hitTokens: 700, missTokens: 300 }, deepseekEventLibrary)
recordCacheUsage({ hitTokens: 500, missTokens: 0 }, managedMain)
recordCacheUsage({ hitTokens: 0, missTokens: 0 }, deepseekMain)

const mainStats = getCacheStats(deepseekMain)
assertOk(
  mainStats.hitTokens === 100 && mainStats.missTokens === 100 && mainStats.hitRate === 50,
  'main narrative statistics must exclude other narrative call types',
)
assertOk(getCacheStats(deepseekContinuity).hitRate === 90, '02 statistics must remain independently queryable')
assertOk(getCacheStats(deepseekTalent).hitRate === 60, '03 statistics must remain independently queryable')
assertOk(getCacheStats(deepseekEventLibrary).hitRate === 70, '04 statistics must remain independently queryable')
assertOk(getCacheStats(managedMain).hitRate === 100, 'provider switching must select a separate statistics bucket')

resetCacheStats(deepseekMain)
assertOk(getCacheStats(deepseekMain).hitRate === 0, 'scoped reset must clear only the selected model and call type')
assertOk(getCacheStats(deepseekContinuity).hitRate === 90, 'scoped reset must preserve 02 statistics')
assertOk(getCacheStats(deepseekTalent).hitRate === 60, 'scoped reset must preserve 03 statistics')
assertOk(getCacheStats(deepseekEventLibrary).hitRate === 70, 'scoped reset must preserve 04 statistics')
assertOk(getCacheStats(managedMain).hitRate === 100, 'scoped reset must preserve other providers')

resetCacheStats()
assertOk(getCacheStats().hitRate === 0, 'global reset must clear every statistics bucket')

console.log('[cache-stats-smoke] PASS')
