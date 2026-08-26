/**
 * Purpose: Coordinate per-world candidate-cache discovery and reset controls.
 * Owner: mod-pages/world-select
 * Responsibility: Call cache owners and expose presentation state; storage keys stay in owner modules.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  deleteDestinyPatternPool,
  hasDestinyPatternPool,
} from '@/mods/mod-character/destiny-pattern-access'

import {
  clearTalentDrawState,
  hasTalentDrawState,
} from '../talent-draw/talent-draw-storage'

interface PendingCacheReset {
  worldCode: number
  worldName: string
}

function normalizeWorldCodes(worldCodes: readonly number[]): number[] {
  return [...new Set(worldCodes.filter((worldCode) => Number.isSafeInteger(worldCode) && worldCode > 0))]
}

function hasWorldCache(worldCode: number): boolean {
  return hasDestinyPatternPool(worldCode) || hasTalentDrawState(worldCode)
}

export function useWorldSelectCache(worldCodes: readonly number[]) {
  const normalizedWorldCodes = useMemo(() => normalizeWorldCodes(worldCodes), [worldCodes])
  const [worldCodesWithCache, setWorldCodesWithCache] = useState<Set<number>>(() => new Set<number>())
  const [rotatingWorldCode, setRotatingWorldCode] = useState<number | null>(null)
  const [pendingCacheReset, setPendingCacheReset] = useState<PendingCacheReset | null>(null)

  const refreshWorldCodesWithCache = useCallback(() => {
    const next = new Set<number>()
    for (const worldCode of normalizedWorldCodes) {
      if (hasWorldCache(worldCode)) next.add(worldCode)
    }
    setWorldCodesWithCache(next)
  }, [normalizedWorldCodes])

  useEffect(() => {
    const refreshId = window.setTimeout(refreshWorldCodesWithCache, 0)
    window.addEventListener('focus', refreshWorldCodesWithCache)
    window.addEventListener('pageshow', refreshWorldCodesWithCache)
    window.addEventListener('storage', refreshWorldCodesWithCache)
    return () => {
      window.clearTimeout(refreshId)
      window.removeEventListener('focus', refreshWorldCodesWithCache)
      window.removeEventListener('pageshow', refreshWorldCodesWithCache)
      window.removeEventListener('storage', refreshWorldCodesWithCache)
    }
  }, [refreshWorldCodesWithCache])

  const handleRequestClearWorldCache = useCallback((worldCode: number, worldName: string) => {
    if (!worldCode || !hasWorldCache(worldCode)) {
      refreshWorldCodesWithCache()
      return
    }
    setPendingCacheReset({ worldCode, worldName })
  }, [refreshWorldCodesWithCache])

  const handleCancelClearWorldCache = useCallback(() => {
    setPendingCacheReset(null)
  }, [])

  const handleClearWorldCache = useCallback((worldCode: number) => {
    if (!worldCode) return
    setRotatingWorldCode(worldCode)
    deleteDestinyPatternPool(worldCode)
    clearTalentDrawState(worldCode)
    setWorldCodesWithCache((current) => {
      const next = new Set(current)
      next.delete(worldCode)
      return next
    })
    window.setTimeout(() => setRotatingWorldCode((current) => current === worldCode ? null : current), 400)
  }, [])

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
