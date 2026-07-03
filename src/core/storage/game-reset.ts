/**
 * @module game-reset.ts
 * @description 清空游戏进度 localStorage + OPFS
 *             仅豁免：API Key / 端口 / 提供商 / 模型 / 免责声明已接受标记
 *             采用排除法——未在此白名单中的全部清除，防遗漏
 * @mod core
 */

import { enqueueOpfsWrite } from './persist-layer'

// ============================================================
// 白名单（仅豁免项） —— 语义：不止不删，还保护不被误入删除集
// 如果发现还有不该留的被留下了，从下面删掉即可
// ============================================================

/** 精确匹配的白名单 key（原始 localStorage key，含 Zustand persist name） */
const KEEP_EXACT = new Set<string>([
  'ai-life-sim:disclaimer-accepted',
])

/** 前缀白名单（键以这些前缀开头则保留） */
const KEEP_PREFIXES: string[] = []

/** Zustand persist store <name> → 保留的顶层字段（不在这些字段中的全被删） */
const KEEP_PERSIST_FIELDS: Record<string, string[]> = {
  'mod-settings:store': ['provider', 'customKey', 'customUrl', 'customModel'],
}

// ============================================================
// 收集 → 删除 → 写回
// ============================================================

function shouldKeep(key: string): boolean {
  if (KEEP_EXACT.has(key)) return true
  return KEEP_PREFIXES.some((p) => key.startsWith(p))
}

/**
 * 清除所有游戏进度相关的 localStorage + 同步 OPFS。
 *
 * 策略（排除法——不是「选要删的」，而是「定义留下什么」）：
 *   仅保留：
 *     - ai-life-sim:disclaimer-accepted  免责声明接受标记
 *     - mod-settings:store 的 provider / customKey / customUrl / customModel
 *   其余所有 key 全部删除（含主题、字体、难度、世界、角色、缓存 等）。
 *
 *   这样做是故意的：防止新增 persist store 或 cache key 被漏删。
 *   如果你新增了需要保留的 key，必须显式添加到 KEEP_EXACT / KEEP_PREFIXES /
 *   KEEP_PERSIST_FIELDS。
 *
 * @returns 删除的 key 数量（不含 trimmed 的字段级清理）
 */
export function clearGameProgressFromLocalStorage(): number {
  // ── 1. 对需修剪的 persist store 做字段级保留 ──
  const trimmedStoreData: Record<string, string> = {}
  for (const storeName of Object.keys(KEEP_PERSIST_FIELDS)) {
    const fieldWhitelist = KEEP_PERSIST_FIELDS[storeName]
    try {
      const raw = localStorage.getItem(storeName)
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, unknown>
        // Zustand persist with version → 数据嵌套在 state 字段中
        const dataObj = (obj.state as Record<string, unknown> | undefined) || obj
        const kept: Record<string, unknown> = {}
        for (const field of fieldWhitelist) {
          if (field in dataObj) {
            kept[field] = dataObj[field]
          }
        }
        // 保持原始结构（version + state），只替换 state 内容
        if (obj.version !== undefined) {
          trimmedStoreData[storeName] = JSON.stringify({ state: kept, version: obj.version })
        } else {
          trimmedStoreData[storeName] = JSON.stringify(kept)
        }
      }
    } catch {
      // 解析失败则丢弃该 store（不恢复）
    }
  }

  // ── 2. 收集所有要删除的 key ──
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (shouldKeep(key)) continue
    // trim 过的 store 不删（后面重写），其他一致删除
    if (trimmedStoreData[key] !== undefined) continue
    keysToRemove.push(key)
  }

  // ── 3. 同步删除 local + OPFS ──
  for (const key of keysToRemove) {
    localStorage.removeItem(key)
    enqueueOpfsWrite(key, null)
  }

  // ── 4. 写回修剪后的 persist store ──
  for (const [storeName, json] of Object.entries(trimmedStoreData)) {
    localStorage.setItem(storeName, json)
    enqueueOpfsWrite(storeName, json)
  }

  return keysToRemove.length
}
