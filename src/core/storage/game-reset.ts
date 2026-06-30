/**
 * @module game-reset.ts
 * @description 清空游戏进度 localStorage（保留设置 / 外观 / 难度）
 * @mod core
 */

/** 完整 key 白名单（精确匹配） */
const KEEP_KEYS = new Set([
  'mod-settings:store',
  'mod-difficulty:persist:difficulty-state',
  'core-theme-store',
  'core-theme',
  'core-font-storage',
  'ai-life-sim:disclaimer-accepted',
])

/** 前缀白名单（设置类） */
const KEEP_PREFIXES = [
  'mod-settings:',
  'ai-life-sim:mod-settings:',
]

function shouldKeepLocalStorageKey(key: string): boolean {
  if (KEEP_KEYS.has(key)) return true
  return KEEP_PREFIXES.some((p) => key.startsWith(p))
}

/**
 * 清除所有游戏进度相关的 localStorage 条目。
 * 含 Zustand persist（mod-*:persist:*）与 ai-life-sim 命名空间的 cache/save/temp/config。
 * @returns 删除的 key 数量
 */
export function clearGameProgressFromLocalStorage(): number {
  const keysToRemove: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || shouldKeepLocalStorageKey(key)) continue

    if (/^mod-.+:persist:.+$/.test(key)) {
      keysToRemove.push(key)
      continue
    }

    if (key.startsWith('ai-life-sim:')) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }

  return keysToRemove.length
}
