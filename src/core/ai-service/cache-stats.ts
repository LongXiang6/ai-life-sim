/**
 * @module cache-stats.ts
 * @description 按 Provider、模型、调用池与调用类型隔离的上游 KV Cache 统计。
 * @mod core
 */

const CACHE_STATS_KEY = 'ai-cache-stats'
const CACHE_STATS_VERSION = 2

export interface CacheUsageContext {
  providerId: string
  model: string
  pool: string
  callKind: string
}

export interface CacheStatsFilter {
  providerId?: string
  model?: string
  pool?: string
  callKind?: string
}

export interface CacheStatsSnapshot {
  hitTokens: number
  missTokens: number
  hitRate: number
}

interface CacheStatsBucket extends CacheUsageContext {
  hitTokens: number
  missTokens: number
  updatedAt: number
}

interface CacheStatsStore {
  version: typeof CACHE_STATS_VERSION
  buckets: Record<string, CacheStatsBucket>
}

function emptyStore(): CacheStatsStore {
  return { version: CACHE_STATS_VERSION, buckets: {} }
}

function getBrowserStorage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

function normalizeTokenCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeBucket(value: unknown): CacheStatsBucket | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<CacheStatsBucket>
  if (
    !isNonEmptyString(candidate.providerId)
    || !isNonEmptyString(candidate.model)
    || !isNonEmptyString(candidate.pool)
    || !isNonEmptyString(candidate.callKind)
  ) {
    return undefined
  }
  return {
    providerId: candidate.providerId,
    model: candidate.model,
    pool: candidate.pool,
    callKind: candidate.callKind,
    hitTokens: normalizeTokenCount(candidate.hitTokens),
    missTokens: normalizeTokenCount(candidate.missTokens),
    updatedAt: normalizeTokenCount(candidate.updatedAt),
  }
}

function readStore(): CacheStatsStore {
  const storage = getBrowserStorage()
  if (!storage) return emptyStore()
  try {
    const raw = storage.getItem(CACHE_STATS_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as { version?: unknown; buckets?: unknown }
    // 旧版只有一个跨模型、跨任务累计桶，无法可靠拆分；不继承其误导性统计。
    if (parsed.version !== CACHE_STATS_VERSION || !parsed.buckets || typeof parsed.buckets !== 'object') {
      return emptyStore()
    }
    const buckets: Record<string, CacheStatsBucket> = {}
    for (const [key, value] of Object.entries(parsed.buckets)) {
      const bucket = normalizeBucket(value)
      if (bucket) buckets[key] = bucket
    }
    return { version: CACHE_STATS_VERSION, buckets }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: CacheStatsStore): void {
  const storage = getBrowserStorage()
  if (!storage) return
  storage.setItem(CACHE_STATS_KEY, JSON.stringify(store))
}

function bucketKey(context: CacheUsageContext): string {
  return JSON.stringify([context.providerId, context.model, context.pool, context.callKind])
}

function matchesFilter(bucket: CacheStatsBucket, filter: CacheStatsFilter): boolean {
  return (filter.providerId === undefined || bucket.providerId === filter.providerId)
    && (filter.model === undefined || bucket.model === filter.model)
    && (filter.pool === undefined || bucket.pool === filter.pool)
    && (filter.callKind === undefined || bucket.callKind === filter.callKind)
}

function notifyStatsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cache-stats-updated'))
  }
}

/** 记录一次上游实际返回的缓存 Token；无缓存字段的响应不会污染旧模型统计。 */
export function recordCacheUsage(
  usage: { hitTokens?: unknown; missTokens?: unknown },
  context: CacheUsageContext,
): void {
  const hitTokens = normalizeTokenCount(usage.hitTokens)
  const missTokens = normalizeTokenCount(usage.missTokens)
  if (hitTokens === 0 && missTokens === 0) return

  try {
    const store = readStore()
    const key = bucketKey(context)
    const previous = store.buckets[key]
    store.buckets[key] = {
      ...context,
      hitTokens: (previous?.hitTokens ?? 0) + hitTokens,
      missTokens: (previous?.missTokens ?? 0) + missTokens,
      updatedAt: Date.now(),
    }
    writeStore(store)
    notifyStatsUpdated()
  } catch {
    // localStorage 不可用时不影响 AI 主调用。
  }
}

/** 查询指定 Provider / 模型 / 调用池 / 调用类型的累计统计。 */
export function getCacheStats(filter: CacheStatsFilter = {}): CacheStatsSnapshot {
  try {
    const store = readStore()
    let hitTokens = 0
    let missTokens = 0
    for (const bucket of Object.values(store.buckets)) {
      if (!matchesFilter(bucket, filter)) continue
      hitTokens += bucket.hitTokens
      missTokens += bucket.missTokens
    }
    const total = hitTokens + missTokens
    return {
      hitTokens,
      missTokens,
      hitRate: total > 0 ? Math.round((hitTokens / total) * 10000) / 100 : 0,
    }
  } catch {
    return { hitTokens: 0, missTokens: 0, hitRate: 0 }
  }
}

/** 重置全部统计，或仅重置与筛选条件匹配的统计桶。 */
export function resetCacheStats(filter?: CacheStatsFilter): void {
  try {
    if (!filter || Object.keys(filter).length === 0) {
      writeStore(emptyStore())
    } else {
      const store = readStore()
      for (const [key, bucket] of Object.entries(store.buckets)) {
        if (matchesFilter(bucket, filter)) delete store.buckets[key]
      }
      writeStore(store)
    }
    notifyStatsUpdated()
  } catch {
    // localStorage 不可用时保持无副作用。
  }
}
