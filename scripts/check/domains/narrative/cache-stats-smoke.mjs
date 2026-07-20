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
  model: 'gpt-5.6-luna',
  pool: 'narrative',
  callKind: 'narrative-main',
}

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
