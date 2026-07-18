/**
 * @module persist-layer.ts
 * @description localStorage + OPFS 双层持久化层
 * @mod core
 *
 * 需求来源：
 *   - 用户要求数据在同设备上持久化，清浏览器缓存不丢失
 *   - 废弃项目已有成熟方案，参照实现
 *
 * 功能说明：
 *   - 运行时读写走 localStorage（同步，快速）
 *   - 写操作自动异步入队同步到 OPFS（浏览器文件系统持久备份）
 *   - 页面启动时调用 initStorage() 从 OPFS 恢复到 localStorage
 *   - 不支持 OPFS 时退化为纯 localStorage
 *
 * OPFS 特性：
 *   - 独立于浏览器缓存，普通"清除浏览器缓存"不影响
 *   - 只有在"网站设置 → 清除站点数据"时才会被删除
 *   - 因此数据可跨会话、跨启动持久保存
 *
 * 依赖：opfs-storage.ts
 * 被依赖：local-storage.ts
 */

import { isOPFSSupported, opfsFlushQueue, opfsRestoreAll } from './opfs-storage'

/** OPFS 写入队列刷新间隔（毫秒） */
const OPFS_FLUSH_INTERVAL_MS = 500
/** 部分浏览器/来源的 OPFS 句柄可能永久 pending；启动页不能因此无限阻塞。 */
export const STORAGE_INIT_TIMEOUT_MS = 5_000

let _initializationPromise: Promise<void> | null = null
let _opfsQueue: Array<{ key: string; value: string | null }> = []
let _flushTimer: ReturnType<typeof setTimeout> | null = null

async function restoreOpfsEntriesWithinTimeout(): Promise<Awaited<ReturnType<typeof opfsRestoreAll>> | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), STORAGE_INIT_TIMEOUT_MS)
  })

  try {
    return await Promise.race([opfsRestoreAll(), timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

function scheduleFlush(): void {
  if (!isOPFSSupported() || _opfsQueue.length === 0) return
  if (_flushTimer) return
  _flushTimer = setTimeout(async () => {
    await flushOpfsQueueNow()
  }, OPFS_FLUSH_INTERVAL_MS)
}

/**
 * 立即刷盘：取消定时器，立即同步队列中所有 OPFS 写/删操作。
 * 用于页面卸载（beforeunload）和数据重置（reload 前）等需要即时持久化的场景。
 */
export async function flushOpfsQueueNow(): Promise<void> {
  if (!isOPFSSupported() || _opfsQueue.length === 0) return
  if (_flushTimer) {
    clearTimeout(_flushTimer)
    _flushTimer = null
  }
  const batch = _opfsQueue
  _opfsQueue = []
  try {
    await opfsFlushQueue(batch)
  } catch {
    // 静默忽略
  }
}

/**
 * 安全重置/重新加载页面：先立即刷盘 OPFS 队列，再 reload。
 *
 * 这是个统一入口，目的是防止开发者写出：
 *   clearGameProgressFromLocalStorage()
 *   window.location.reload()   ← BUG: flat-key 删除还在 500ms 队列里，来不及落地
 *
 * 正确用法：
 *   clearGameProgressFromLocalStorage()
 *   await safeCleanupReload()   ← 确保 OPFS 已同步后才 reload
 *
 * /gate:OPFS-RELOAD-SAFETY — 调用链覆盖 CL-146
 */
export async function safeCleanupReload(): Promise<void> {
  await flushOpfsQueueNow()
  window.location.reload()
}

/**
 * 入队 OPFS 写入（500ms 防抖批量刷盘）
 *
 * @param key   完整 localStorage key（含 ai-life-sim: 前缀）
 * @param value JSON 字符串（null 表示删除）
 */
export function enqueueOpfsWrite(key: string, value: string | null): void {
  if (!isOPFSSupported()) return
  _opfsQueue = _opfsQueue.filter(e => e.key !== key)
  _opfsQueue.push({ key, value })
  scheduleFlush()
}

/**
 * 初始化持久化层：从 OPFS 恢复到 localStorage
 *
 * 调用时机：应用启动时（StorageInit 组件 useEffect 中）
 * 幂等：多次调用只执行一次
 *
 * 行为：
 *   - 遍历 OPFS 根目录所有文件
 *   - 对于 localStorage 中缺失的 key，从 OPFS 恢复
 *   - localStorage 已有的 key 不覆盖（防止回退旧数据）
 */
export function initStorage(): Promise<void> {
  if (_initializationPromise) return _initializationPromise

  _initializationPromise = (async () => {
    if (typeof window === 'undefined' || !isOPFSSupported()) return

    try {
      const entries = await restoreOpfsEntriesWithinTimeout()
      if (!entries) {
        console.info('[persist-layer] OPFS 恢复等待超时，已使用现有 localStorage 继续启动')
        return
      }
      let restored = 0
      for (const { key, value } of entries) {
        if (!localStorage.getItem(key) && value) {
          localStorage.setItem(key, value)
          restored++
        }
      }
      if (restored > 0) {
        console.info(`[persist-layer] 从 OPFS 恢复了 ${restored} 个条目到 localStorage`)
      }
    } catch {
      // OPFS 不可用，继续使用 localStorage
    }
  })()

  return _initializationPromise
}
