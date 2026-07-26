'use client'

/**
 * @module useWorldSelectCache.ts
 * @description 世界选择页 —— 检测 / 清空按 worldCode 隔离的 AI 生成缓存
 * @mod mod-pages
 */

import { useState, useCallback, useEffect } from 'react'

import {
  scanWorldCodesWithGeneratedCache,
  clearWorldGeneratedCache,
  hasWorldGeneratedCache,
} from '@/mods/mod-world/world-init-api'

export function useWorldSelectCache() {
  const [worldCodesWithCache, setWorldCodesWithCache] = useState<Set<number>>(() => new Set<number>())
  const [rotatingWorldCode, setRotatingWorldCode] = useState<number | null>(null)
  const [pendingCacheReset, setPendingCacheReset] = useState<{ worldCode: number; worldName: string } | null>(null)

  const refreshWorldCodesWithCache = useCallback(() => {
    setWorldCodesWithCache(scanWorldCodesWithGeneratedCache())
  }, [])

  useEffect(() => {
    const initialRefreshId = window.setTimeout(refreshWorldCodesWithCache, 0)
    window.addEventListener('focus', refreshWorldCodesWithCache)
    window.addEventListener('pageshow', refreshWorldCodesWithCache)
    window.addEventListener('storage', refreshWorldCodesWithCache)
    return () => {
      window.clearTimeout(initialRefreshId)
      window.removeEventListener('focus', refreshWorldCodesWithCache)
      window.removeEventListener('pageshow', refreshWorldCodesWithCache)
      window.removeEventListener('storage', refreshWorldCodesWithCache)
    }
  }, [refreshWorldCodesWithCache])

  const handleRequestClearWorldCache = useCallback((worldCode: number, worldName: string) => {
    if (!worldCode || !hasWorldGeneratedCache(worldCode)) {
      refreshWorldCodesWithCache()
      return
    }
    setPendingCacheReset({ worldCode, worldName })
  }, [refreshWorldCodesWithCache])

  const handleCancelClearWorldCache = useCallback(() => {
    setPendingCacheReset(null)
  }, [])

  const handleClearWorldCache = useCallback((worldCode: number) => {
    if (!worldCode || !hasWorldGeneratedCache(worldCode)) return
    setRotatingWorldCode(worldCode)
    clearWorldGeneratedCache(worldCode)
    window.setTimeout(() => {
      setRotatingWorldCode(null)
      refreshWorldCodesWithCache()
    }, 500)
  }, [refreshWorldCodesWithCache])

  const handleConfirmClearWorldCache = useCallback(() => {
    if (!pendingCacheReset) return
    const { worldCode } = pendingCacheReset
    setPendingCacheReset(null)
    handleClearWorldCache(worldCode)
  }, [handleClearWorldCache, pendingCacheReset])

  return {
    worldCodesWithCache,
    rotatingWorldCode,
    pendingCacheReset,
    handleRequestClearWorldCache,
    handleCancelClearWorldCache,
    handleConfirmClearWorldCache,
    handleClearWorldCache,
    refreshWorldCodesWithCache,
  }
}
