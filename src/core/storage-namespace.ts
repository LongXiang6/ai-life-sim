/**
 * @module storage-namespace.ts
 * @description 存储命名空间 — 引擎级 per-MOD 存储隔离
 * @mod core
 *
 * 吸收 Factorio per-MOD storage 命名空间隔离设计。
 *
 * 每个 MOD 只能通过 getStorage() 访问自己的存储分区，
 * 所有读写自动前缀 MOD 名称键，防止跨 MOD 数据污染。
 *
 * 使用方式：
 *   const myStorage = context.getStorage<MyState>()
 *   myStorage.set('key', value)
 *   const val = myStorage.get('key')
 */

import type { IStorageService, StorageNamespace } from '@/foundation'

/**
 * 创建隔离的存储命名空间
 *
 * @param modName - MOD 名称（用作键前缀）
 * @param baseStorage - 基础存储服务（通常为 localStorage 包装器）
 * @returns 带前缀隔离的 StorageNamespace 实例
 */
export function createStorageNamespace<T extends Record<string, unknown> = Record<string, unknown>>(
  modName: string,
  baseStorage: IStorageService,
): StorageNamespace<T> {
  const prefix = `${modName}:`

  return {
    get(key) {
      const raw = baseStorage.getItem(`${prefix}${String(key)}`)
      if (raw === null) return undefined
      try {
        return JSON.parse(raw) as T[typeof key]
      } catch {
        return undefined
      }
    },

    set(key, value) {
      baseStorage.setItem(`${prefix}${String(key)}`, JSON.stringify(value))
    },

    delete(key) {
      baseStorage.removeItem(`${prefix}${String(key)}`)
    },

    getAll() {
      const result: Record<string, unknown> = {}
      // 扫描所有以 prefix 开头的键
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(prefix)) {
          const raw = localStorage.getItem(k)
          if (raw !== null) {
            try {
              result[k.slice(prefix.length)] = JSON.parse(raw)
            } catch {
              // 跳过不可解析的条目
            }
          }
        }
      }
      return result as Partial<T>
    },
  }
}
