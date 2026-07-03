'use client'

import { useEffect, useRef } from 'react'
import { initStorage, flushOpfsQueueNow } from '@/core/storage/persist-layer'

/**
 * StorageInit —— 应用启动时从 OPFS 恢复数据到 localStorage + 页面卸载前刷盘
 *
 * 作为 layout 的最外层包裹器，确保在任何组件读取数据之前，
 * OPFS 中的持久化备份已恢复到 localStorage。
 *
 * OPFS（Origin Private File System）不受普通"清除浏览器缓存"影响，
 * 只有"网站设置 → 清除站点数据"才会删除。
 * 因此即使 localStorage 被清，下次启动时数据仍然可恢复。
 */
export function StorageInit({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    initStorage()
  }, [])

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
