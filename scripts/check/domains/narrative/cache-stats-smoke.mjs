#!/usr/bin/env node

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
const { normalizeAiUsage } = await import('../../../../src/core/ai-service/normalize-ai-usage.ts')

function assertOk(condition, message) {
  if (!condition) throw new Error(`[cache-stats-smoke] ${message}`)
}

const deepseekMain = {
  providerId: 'deepseek',
  model: 'deepseek-v4-flash',
  pool: 'narrative',
  callKind: 'narrative-main',
}
const deepseekRepair = { ...deepseekMain, callKind: 'narrative-format-repair' }
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
  total_tokens: 820,
})
assertOk(
  deepseekUsage?.hitTokens === 640 && deepseekUsage.missTokens === 160,
  'DeepSeek cache usage must keep its explicit hit and miss fields',
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

recordCacheUsage({ hitTokens: 100, missTokens: 100 }, deepseekMain)
recordCacheUsage({ hitTokens: 900, missTokens: 100 }, deepseekRepair)
recordCacheUsage({ hitTokens: 500, missTokens: 0 }, managedMain)
recordCacheUsage({ hitTokens: 0, missTokens: 0 }, deepseekMain)

const mainStats = getCacheStats(deepseekMain)
assertOk(
  mainStats.hitTokens === 100 && mainStats.missTokens === 100 && mainStats.hitRate === 50,
  'main narrative statistics must exclude format-repair calls',
)
assertOk(getCacheStats(deepseekRepair).hitRate === 90, 'format-repair statistics must remain independently queryable')
assertOk(getCacheStats(managedMain).hitRate === 100, 'provider switching must select a separate statistics bucket')

resetCacheStats(deepseekMain)
assertOk(getCacheStats(deepseekMain).hitRate === 0, 'scoped reset must clear only the selected model and call type')
assertOk(getCacheStats(deepseekRepair).hitRate === 90, 'scoped reset must preserve other call types')
assertOk(getCacheStats(managedMain).hitRate === 100, 'scoped reset must preserve other providers')

resetCacheStats()
assertOk(getCacheStats().hitRate === 0, 'global reset must clear every statistics bucket')

console.log('[cache-stats-smoke] PASS')
