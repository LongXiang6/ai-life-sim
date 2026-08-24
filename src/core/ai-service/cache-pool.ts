/**
 * Purpose: Register and resolve internal AI cache-pool identities.
 * Owner: core / ai-service
 * Responsibility: Cache-pool naming only; providers own transport caching behavior.
 */

export const INTERNAL_CACHE_POOLS = [
  'adaptation',
  'connectivity-test',
  'fate-talent',
  'low-frequency',
  'narrative-main',
  'narrative-story-continuity',
  'narrative-talent-growth',
] as const

export type InternalCachePool = typeof INTERNAL_CACHE_POOLS[number]

export type CachePoolType =
  | 'adaptation'
  | 'fate'
  | 'lowFrequency'
  | 'narrative'

export function resolveInternalCachePool(
  pool: CachePoolType,
  callKind?: string,
): InternalCachePool {
  const kind = callKind?.trim().toLowerCase() ?? ''
  if (kind.includes('connect') && kind.includes('test')) return 'connectivity-test'
  if (kind === 'narrative-main' || kind === 'immersion-warmup') return 'narrative-main'
  if (kind === 'narrative-story-continuity') return 'narrative-story-continuity'
  if (kind === 'narrative-talent-growth') return 'narrative-talent-growth'
  if (kind.startsWith('narrative-')) return 'narrative-main'
  if (pool === 'adaptation') return 'adaptation'
  if (pool === 'fate') return 'fate-talent'
  if (pool === 'lowFrequency') return 'low-frequency'
  return 'narrative-main'
}
