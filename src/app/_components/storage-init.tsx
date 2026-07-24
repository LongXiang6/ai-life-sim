'use client'

import { useEffect, useState } from 'react'
import {
  STORAGE_INIT_TIMEOUT_MS,
  initStorage,
  flushOpfsQueueNow,
} from '@/core/storage/persist-layer'

// 必须严格晚于存储层自己的超时，避免外层先放行、子页面读到尚未恢复的 localStorage。
const STORAGE_READY_TIMEOUT_MS = STORAGE_INIT_TIMEOUT_MS + 1_000

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
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const fallbackTimer = window.setTimeout(() => {
      if (!mounted) return
      console.info('[storage-init] 本地存档恢复等待超时，已继续进入应用')
      setReady(true)
    }, STORAGE_READY_TIMEOUT_MS)
    void initStorage().finally(() => {
      window.clearTimeout(fallbackTimer)
      if (mounted) setReady(true)
    })
    return () => {
      mounted = false
      window.clearTimeout(fallbackTimer)
    }
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

  if (!ready) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          color: 'var(--color-text-secondary)',
          background: 'var(--color-bg-page)',
          letterSpacing: '0.08em',
        }}
      >
        正在恢复本地存档…
      </div>
    )
  }

  return <>{children}</>
}
