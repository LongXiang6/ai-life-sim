/**
 * @module local-storage.ts
 * @description localStorage 封装 —— 带前缀的键值存储，JSON 自动序列化
 * @mod core
 *
 * 存储键规范（mod-specification.md §9）：
 *   配置：{mod}:config:{key}
 *   存档：{mod}:save:{slot}:{key}
 *   缓存：{mod}:cache:{key}
 *   临时：{mod}:temp:{key}
 */

const STORAGE_PREFIX = 'ai-life-sim'

/** 配置存储 */
export const configStore = {
  get<T = unknown>(mod: string, key: string): T | null {
    return read<T>(`${mod}:config:${key}`)
  },
  set<T = unknown>(mod: string, key: string, value: T): void {
    write(`${mod}:config:${key}`, value)
  },
  remove(mod: string, key: string): void {
    remove(`${mod}:config:${key}`)
  },
}

/** 存档存储 */
export const saveStore = {
  get<T = unknown>(mod: string, slot: number, key: string): T | null {
    return read<T>(`${mod}:save:${slot}:${key}`)
  },
  set<T = unknown>(mod: string, slot: number, key: string, value: T): void {
    write(`${mod}:save:${slot}:${key}`, value)
  },
  remove(mod: string, slot: number, key: string): void {
    remove(`${mod}:save:${slot}:${key}`)
  },
  listSlots(): number[] {
    const slots = new Set<number>()
    for (let i = 0; i < localStorage.length; i++) {
      const rawKey = localStorage.key(i)
      if (rawKey?.startsWith(STORAGE_PREFIX)) {
        const key = rawKey.slice(STORAGE_PREFIX.length + 1)
        const match = key.match(/^(.+):save:(\d+):.+$/)
        if (match) {
          slots.add(Number(match[2]))
        }
      }
    }
    return [...slots].sort((a, b) => a - b)
  },
}

/** 缓存条目（含时间戳，30 天自动过期） */
interface CacheEntry<T> {
  data: T
  ts: number
}

/** 缓存存储 */
export const cacheStore = {
  get<T = unknown>(mod: string, key: string): T | null {
    const entry = read<CacheEntry<T> | T>(`${mod}:cache:${key}`)
    if (!entry) return null
    // 向后兼容：旧缓存无时间戳包裹
    if (typeof entry !== 'object' || entry === null || !('data' in entry && 'ts' in entry)) {
      return entry as T
    }
    const cached = entry as CacheEntry<T>
    // 30 天自动过期
    if (Date.now() - cached.ts > 30 * 24 * 60 * 60 * 1000) {
      remove(`${mod}:cache:${key}`)
      return null
    }
    return cached.data
  },
  set<T = unknown>(mod: string, key: string, value: T): void {
    write(`${mod}:cache:${key}`, { data: value, ts: Date.now() })
  },
  remove(mod: string, key: string): void {
    remove(`${mod}:cache:${key}`)
  },
}

/** 临时存储 */
export const tempStore = {
  get<T = unknown>(mod: string, key: string): T | null {
    return read<T>(`${mod}:temp:${key}`)
  },
  set<T = unknown>(mod: string, key: string, value: T): void {
    write(`${mod}:temp:${key}`, value)
  },
  remove(mod: string, key: string): void {
    remove(`${mod}:temp:${key}`)
  },
}

// 内部工具

function fullKey(key: string): string {
  return `${STORAGE_PREFIX}:${key}`
}

function read<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(fullKey(key))
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function write<T = unknown>(key: string, value: T): void {
  try {
    localStorage.setItem(fullKey(key), JSON.stringify(value))
  } catch (e) {
    // QuotaExceededError：localStorage 满时触发，清理旧缓存后重试
    if (e instanceof DOMException && (
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22
    )) {
      console.warn('[Storage] localStorage 配额已满，尝试清理旧缓存...')
      try {
        // 清理所有 cache: 和 temp: 前缀的条目（保留 config: 和 save:）
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const rawKey = localStorage.key(i)
          if (rawKey?.startsWith(STORAGE_PREFIX)) {
            const strippedKey = rawKey.slice(STORAGE_PREFIX.length + 1)
            if (strippedKey.includes(':cache:') || strippedKey.includes(':temp:')) {
              keysToRemove.push(rawKey)
            }
          }
        }
        for (const k of keysToRemove) {
          localStorage.removeItem(k)
        }
        console.warn(`[Storage] 清理了 ${keysToRemove.length} 条缓存/临时数据，重试写入`)
        localStorage.setItem(fullKey(key), JSON.stringify(value))
      } catch (retryErr) {
        console.error(`[Storage] 清理后仍写入失败: ${key}`, retryErr)
      }
    } else {
      console.error(`[Storage] 写入失败: ${key}`, e)
    }
  }
}

function remove(key: string): void {
  localStorage.removeItem(fullKey(key))
}
