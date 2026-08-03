/**
 * Purpose: Persist and publish the small client-side round cache strategy history.
 * Owner: core:ai-service
 * Responsibility: Round cache metrics only; provider usage accounting remains in usage-stats and cache-stats.
 */

import type { RoundCacheMetrics } from './types'

const ROUND_CACHE_METRICS_KEY = 'roundCacheMetrics'
const MAX_ROUND_CACHE_METRICS = 10

export function recordRoundCacheMetrics(metrics: Omit<RoundCacheMetrics, 'timestamp'>): void {
  try {
    const raw = localStorage.getItem(ROUND_CACHE_METRICS_KEY)
    const list: RoundCacheMetrics[] = raw ? JSON.parse(raw) : []
    list.push({ ...metrics, timestamp: Date.now() })
    while (list.length > MAX_ROUND_CACHE_METRICS) list.shift()
    localStorage.setItem(ROUND_CACHE_METRICS_KEY, JSON.stringify(list))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('round-cache-metrics-updated'))
    }
  } catch {
    // Cache metrics are observational and do not block the AI call when storage is unavailable.
  }
}

export function getRoundCacheMetrics(): RoundCacheMetrics[] {
  try {
    const raw = localStorage.getItem(ROUND_CACHE_METRICS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
