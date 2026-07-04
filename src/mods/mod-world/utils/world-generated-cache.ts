/**
 * @module world-generated-cache.ts
 * @description 按 worldCode 聚合 AI 生成物本地缓存 —— 扫描 / 检测 / 清空
 * @mod mod-world
 */

import { cacheStore, configStore, saveStore } from '@/core'

const STORAGE_PREFIX = 'ai-life-sim'

const CACHE_KEY_PATTERNS: RegExp[] = [
  /^mod-character:cache:destiny-pool:(\d+)/,
  /^mod-world:save:0:init-cal:(\d+)/,
  /^mod-world:save:0:entities:(\d+)/,
  /^mod-base-universe:save:0:world-map:(\d+)/,
  /^mod-pages:config:(?:talent-draw|fate-preview|attribute-alloc|character-create-form|character-create-gf):(\d+)/,
]

function stripStoragePrefix(fullKey: string): string | null {
  if (!fullKey.startsWith(`${STORAGE_PREFIX}:`)) return null
  return fullKey.slice(STORAGE_PREFIX.length + 1)
}

/** 扫描 localStorage，返回存在 AI 生成缓存的 worldCode 集合 */
export function scanWorldCodesWithGeneratedCache(): Set<number> {
  const codes = new Set<number>()
  if (typeof window === 'undefined') return codes

  for (let i = 0; i < localStorage.length; i++) {
    const raw = localStorage.key(i)
    if (!raw) continue
    const stripped = stripStoragePrefix(raw)
    if (!stripped) continue
    for (const pattern of CACHE_KEY_PATTERNS) {
      const match = stripped.match(pattern)
      if (match) {
        const code = parseInt(match[1], 10)
        if (!Number.isNaN(code) && code > 0) {
          codes.add(code)
        }
      }
    }
  }
  return codes
}

/** 指定 worldCode 是否仍有 AI 生成缓存 */
export function hasWorldGeneratedCache(worldCode: number): boolean {
  if (!worldCode) return false
  return scanWorldCodesWithGeneratedCache().has(worldCode)
}

/**
 * 清空指定 worldCode 下全部 AI 生成缓存（命格池 / 初始化校准 / 实体 / 地图 / 流程页状态）
 */
export function clearWorldGeneratedCache(worldCode: number): void {
  if (!worldCode || typeof window === 'undefined') return

  try {
    cacheStore.remove('mod-character', `destiny-pool:${worldCode}`)
  } catch {
    /* ignore */
  }

  try {
    saveStore.remove('mod-world', 0, `init-cal:${worldCode}`)
  } catch {
    /* ignore */
  }

  try {
    saveStore.remove('mod-world', 0, `entities:${worldCode}`)
    saveStore.remove('mod-base-universe', 0, `world-map:${worldCode}`)
  } catch {
    /* ignore */
  }

  try {
    configStore.remove('mod-pages', `talent-draw:${worldCode}`)
    configStore.remove('mod-pages', `fate-preview:${worldCode}`)
    configStore.remove('mod-pages', `attribute-alloc:${worldCode}`)
    configStore.remove('mod-pages', `character-create-form:${worldCode}`)
    configStore.remove('mod-pages', `character-create-gf:${worldCode}`)
  } catch {
    /* ignore */
  }
}
