/**
 * Purpose: Reveal generated destiny-pattern seals and complete the visual handoff to selection.
 * Owner: mod-pages/talent-draw
 * Responsibility: Seal timing and full-draw completion only.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  useCharacterStore,
} from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { DestinyPattern } from '@/mods/mod-character'
import type { TalentDrawPhase, TalentDrawSlots } from './talent-draw.types'
import { revealSlotsInOrder, uniquePatternsByIdentity } from './talent-draw-patterns'
import { saveCachedPool } from './talent-draw-storage'

const SEAL_REVEAL_INTERVAL_MS = 220

function prefersReducedMotion(): boolean {
  return useSettingsStore.getState().reduceMotion
    || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

interface UseTalentDrawRevealOptions {
  abortRef: RefObject<boolean>
  completionScheduledRef: RefObject<boolean>
  fullPoolRef: RefObject<DestinyPattern[]>
  initialPhase: TalentDrawPhase
  initialSlots: TalentDrawSlots
  setLocalPoolSize: Dispatch<SetStateAction<number>>
  setPhase: Dispatch<SetStateAction<TalentDrawPhase>>
  setSlots: Dispatch<SetStateAction<TalentDrawSlots>>
}

export function useTalentDrawReveal({
  abortRef,
  completionScheduledRef,
  fullPoolRef,
  initialPhase,
  initialSlots,
  setLocalPoolSize,
  setPhase,
  setSlots,
}: UseTalentDrawRevealOptions) {
  const [revealCount, setRevealCount] = useState(() => {
    const revealed = Math.min(initialSlots.filter(Boolean).length, DESTINY_PATTERN_DISPLAY_COUNT)
    return initialPhase === 'ready' ? 0 : revealed
  })
  const [completionReplay, setCompletionReplay] = useState(() => initialPhase === 'ready')
  const revealTimerRef = useRef<number | null>(null)
  const revealCountRef = useRef(revealCount)
  const completionTimerRef = useRef<number | null>(null)

  const setRevealCountSynced = useCallback((value: number): void => {
    revealCountRef.current = value
    setRevealCount(value)
  }, [])

  const getRevealCount = useCallback(() => revealCountRef.current, [])

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current === null) return
    window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = null
  }, [])

  const startSealReveal = useCallback((startCount: number, onAllRevealed: () => void): void => {
    if (revealTimerRef.current !== null) window.clearInterval(revealTimerRef.current)
    const clampedStart = Math.max(0, Math.min(startCount, DESTINY_PATTERN_DISPLAY_COUNT))
    if (prefersReducedMotion()) {
      setRevealCountSynced(DESTINY_PATTERN_DISPLAY_COUNT)
      onAllRevealed()
      return
    }
    setRevealCountSynced(clampedStart)
    if (clampedStart >= DESTINY_PATTERN_DISPLAY_COUNT) {
      onAllRevealed()
      return
    }
    let current = clampedStart
    revealTimerRef.current = window.setInterval(() => {
      current += 1
      setRevealCountSynced(current)
      if (current >= DESTINY_PATTERN_DISPLAY_COUNT) {
        if (revealTimerRef.current !== null) window.clearInterval(revealTimerRef.current)
        revealTimerRef.current = null
        onAllRevealed()
      }
    }, SEAL_REVEAL_INTERVAL_MS)
  }, [setRevealCountSynced])

  const completeFullDraw = useCallback((patterns: DestinyPattern[]): boolean => {
    const visiblePatterns = uniquePatternsByIdentity(patterns)
    if (
      visiblePatterns.length < DESTINY_PATTERN_DISPLAY_COUNT
      || abortRef.current
      || completionScheduledRef.current
    ) return false

    completionScheduledRef.current = true
    fullPoolRef.current = visiblePatterns
    saveCachedPool(visiblePatterns)
    useCharacterStore.getState().setDestinyPatterns({ candidates: visiblePatterns })
    setSlots(revealSlotsInOrder(visiblePatterns))
    setLocalPoolSize(visiblePatterns.length)
    setCompletionReplay(true)
    if (prefersReducedMotion()) {
      setRevealCountSynced(DESTINY_PATTERN_DISPLAY_COUNT)
      setCompletionReplay(false)
      setPhase('ready')
      return true
    }
    startSealReveal(Math.min(revealCountRef.current, DESTINY_PATTERN_DISPLAY_COUNT), () => {
      clearCompletionTimer()
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null
        if (abortRef.current) return
        setCompletionReplay(false)
        setPhase('ready')
      }, 1000)
    })
    return true
  }, [
    abortRef,
    clearCompletionTimer,
    completionScheduledRef,
    fullPoolRef,
    setLocalPoolSize,
    setPhase,
    setRevealCountSynced,
    setSlots,
    startSealReveal,
  ])

  useEffect(() => {
    if (initialPhase !== 'ready') return
    abortRef.current = false
    const frame = window.requestAnimationFrame(() => {
      startSealReveal(0, () => setCompletionReplay(false))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [abortRef, initialPhase, startSealReveal])

  useEffect(() => () => {
    if (revealTimerRef.current !== null) window.clearInterval(revealTimerRef.current)
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current)
  }, [])

  return {
    clearCompletionTimer,
    completeFullDraw,
    completionReplay,
    getRevealCount,
    revealCount,
    setRevealCountSynced,
  }
}
