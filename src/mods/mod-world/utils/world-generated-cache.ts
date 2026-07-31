/**
 * @module world-generated-cache.ts
 * @description 按 worldCode 聚合 AI 生成物本地缓存 —— 扫描 / 检测 / 清空
 * @mod mod-world
 */

import { cacheStore, configStore, saveStore } from '@/core'

const STORAGE_PREFIX = 'ai-life-sim'

const DESTINY_POOL_CACHE_PREFIX = 'mod-character:cache:destiny-pool:'

const CACHE_KEY_PATTERNS: RegExp[] = [
  /^mod-world:save:0:init-cal:(\d+)/,
  /^mod-world:save:0:entities:(\d+)/,
  /^mod-pages:config:(?:talent-draw|fate-preview|attribute-alloc|character-create-form):(\d+)/,
]

function parseDestinyPoolWorldCode(logicalKey: string): number | null {
  if (!logicalKey.startsWith(DESTINY_POOL_CACHE_PREFIX)) return null
  const suffix = logicalKey.slice(DESTINY_POOL_CACHE_PREFIX.length)
  const rawWorldCode = suffix.slice(suffix.lastIndexOf(':') + 1)
  if (!/^\d+$/.test(rawWorldCode)) return null
  const worldCode = Number.parseInt(rawWorldCode, 10)
  return worldCode > 0 ? worldCode : null
}

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
    const destinyPoolWorldCode = parseDestinyPoolWorldCode(stripped)
    if (destinyPoolWorldCode !== null) {
      codes.add(destinyPoolWorldCode)
      continue
    }
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
 * 清空指定 worldCode 下全部 AI 生成缓存（命格池 / 初始化校准 / 实体 / 流程页状态）
 */
export function clearWorldGeneratedCache(worldCode: number): void {
  if (!worldCode || typeof window === 'undefined') return

  try {
    cacheStore.remove('mod-character', `destiny-pool:${worldCode}`)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const raw = localStorage.key(i)
      if (!raw) continue
      const stripped = stripStoragePrefix(raw)
      if (stripped && parseDestinyPoolWorldCode(stripped) === worldCode) {
        localStorage.removeItem(raw)
      }
    }
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
  } catch {
    /* ignore */
  }

  try {
    configStore.remove('mod-pages', `talent-draw:${worldCode}`)
    configStore.remove('mod-pages', `fate-preview:${worldCode}`)
    configStore.remove('mod-pages', `attribute-alloc:${worldCode}`)
    configStore.remove('mod-pages', `character-create-form:${worldCode}`)
  } catch {
    /* ignore */
  }
}
