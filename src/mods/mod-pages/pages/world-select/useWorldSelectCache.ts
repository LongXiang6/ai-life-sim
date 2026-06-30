'use client'

/**
 * @module useWorldSelectCache.ts
 * @description 世界选择页 —— 检测 / 清空按 worldCode 隔离的 AI 生成缓存
 * @mod mod-pages
 */

import { useState, useCallback } from 'react'

import {
  scanWorldCodesWithGeneratedCache,
  clearWorldGeneratedCache,
  hasWorldGeneratedCache,
} from '@/mods/mod-world/world-init-api'

export function useWorldSelectCache() {
  const [worldCodesWithCache, setWorldCodesWithCache] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set<number>()
    return scanWorldCodesWithGeneratedCache()
  })
  const [rotatingWorldCode, setRotatingWorldCode] = useState<number | null>(null)

  const refreshWorldCodesWithCache = useCallback(() => {
    setWorldCodesWithCache(scanWorldCodesWithGeneratedCache())
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

  return {
    worldCodesWithCache,
    rotatingWorldCode,
    handleClearWorldCache,
    refreshWorldCodesWithCache,
  }
}
