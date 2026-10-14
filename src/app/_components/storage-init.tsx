'use client'

/** Purpose: Install page-lifecycle persistence hooks. Owner: app:storage-init. Responsibility: Flush queued OPFS writes without blocking first render. */

import { useEffect } from 'react'
import { flushOpfsQueueNow } from '@/core/storage/persist-layer'

/**
 * StorageInit —— 页面卸载前刷盘 OPFS 写入队列
 *
 * OPFS（Origin Private File System）不受普通"清除浏览器缓存"影响，
 * 只有"网站设置 → 清除站点数据"才会删除。
 * 因此即使 localStorage 被清，下次启动时数据仍然可恢复。
 */
export function StorageInit({ children }: { children: React.ReactNode }) {
  // 页面卸载/隐藏前立即刷盘（防止队列中未持久化的数据丢失）
  useEffect(() => {
    const handleUnload = () => { flushOpfsQueueNow() }
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [])

  return <>{children}</>
}
