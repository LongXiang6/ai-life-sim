/**
 * @module cache-pool.ts
 * @description AI 调用系统缓存池的唯一注册与解析契约
 * @mod core
 */

export const INTERNAL_CACHE_POOLS = [
  'adaptation',
  'connectivity-test',
  'fate-talent',
  'low-frequency',
  'narrative-basic-attribute-analysis',
  'narrative-basic-attribute-analysis-repair',
  'narrative-data-analysis',
  'narrative-data-analysis-repair',
  'narrative-event-recognition',
  'narrative-event-recognition-repair',
  'narrative-macro-impact',
  'narrative-macro-impact-repair',
  'narrative-main',
  'narrative-repair',
  'summary-L1',
  'summary-L2',
  'summary-L3',
  'world-init',
] as const

export type InternalCachePool = typeof INTERNAL_CACHE_POOLS[number]

export type CachePoolType =
  | 'adaptation'
  | 'fate'
  | 'lowFrequency'
  | 'narrative'
  | 'summary'
  | 'worldInit'

export function resolveInternalCachePool(
  pool: CachePoolType,
  callKind?: string,
): InternalCachePool {
  const kind = callKind?.trim().toLowerCase() ?? ''
  if (kind.includes('connect') && kind.includes('test')) return 'connectivity-test'
  if (kind === 'summary-compress-l1') return 'summary-L1'
  if (kind === 'summary-compress-l2') return 'summary-L2'
  if (kind === 'summary-compress-l3') return 'summary-L3'
  if (kind === 'narrative-main' || kind === 'immersion-warmup') return 'narrative-main'
  if (kind === 'narrative-basic-attribute-analysis') return 'narrative-basic-attribute-analysis'
  if (kind === 'narrative-basic-attribute-analysis-format-repair') return 'narrative-basic-attribute-analysis-repair'
  if (kind === 'narrative-data-analysis') return 'narrative-data-analysis'
  if (kind === 'narrative-data-analysis-format-repair') return 'narrative-data-analysis-repair'
  if (kind === 'narrative-event-recognition') return 'narrative-event-recognition'
  if (kind === 'narrative-event-recognition-format-repair') return 'narrative-event-recognition-repair'
  if (kind === 'narrative-macro-impact') return 'narrative-macro-impact'
  if (kind === 'narrative-macro-impact-format-repair') return 'narrative-macro-impact-repair'
  if (kind.startsWith('narrative-')) return 'narrative-repair'
  if (pool === 'adaptation') return 'adaptation'
  if (pool === 'fate') return 'fate-talent'
  if (pool === 'lowFrequency') return 'low-frequency'
  if (pool === 'summary') return 'summary-L1'
  if (pool === 'worldInit') return 'world-init'
  return 'narrative-main'
}
