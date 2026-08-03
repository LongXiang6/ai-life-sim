/**
 * Purpose: Run talent-draw pool generation and synchronize its background fill lifecycle.
 * Owner: mod-pages/talent-draw
 * Responsibility: Generation commands and pool polling only; reveal timing and selection commits live elsewhere.
 */

import { useCallback, useEffect } from 'react'

import { isAiCredentialError } from '@/core/ai-service'
import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  DESTINY_PATTERN_FAST_DRAW_THRESHOLD,
  useCharacterStore,
} from '@/mods/mod-character'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { DestinyPattern } from '@/mods/mod-character'
import type { TalentDrawPhase, TalentDrawSlots } from './talent-draw.types'
import { buildDestinyPatternContext, configureDestinyPatternAIService } from './talent-draw-ai-service'
import {
  drawSlotsFromPool,
  isAIGeneratedPattern,
  mergeSlotsWithPatterns,
  revealSlotsInOrder,
  uniquePatternsByIdentity,
} from './talent-draw-patterns'
import { loadCachedPool, saveCachedPool } from './talent-draw-storage'

interface UseTalentDrawGenerationOptions {
  abortRef: RefObject<boolean>
  clearCompletionTimer: () => void
  completeFullDraw: (patterns: DestinyPattern[]) => boolean
  completionScheduledRef: RefObject<boolean>
  fullPoolRef: RefObject<DestinyPattern[]>
  getRevealCount: () => number
  phase: TalentDrawPhase
  resetSelectionForGeneration: () => void
  setErrorMsg: Dispatch<SetStateAction<string>>
  setLocalPoolSize: Dispatch<SetStateAction<number>>
  setPhase: Dispatch<SetStateAction<TalentDrawPhase>>
  setRevealCountSynced: (value: number) => void
  setSlots: Dispatch<SetStateAction<TalentDrawSlots>>
}

export function useTalentDrawGeneration({
  abortRef,
  clearCompletionTimer,
  completeFullDraw,
  completionScheduledRef,
  fullPoolRef,
  getRevealCount,
  phase,
  resetSelectionForGeneration,
  setErrorMsg,
  setLocalPoolSize,
  setPhase,
  setRevealCountSynced,
  setSlots,
}: UseTalentDrawGenerationOptions) {
  useEffect(() => () => {
    abortRef.current = true
    const destinySystem = getDestinyPatternSystem()
    if (destinySystem.getPoolFillStatus().inProgress) destinySystem.abortPoolFill()
  }, [abortRef])

  useEffect(() => {
    const syncPoolSize = () => {
      const candidates = useCharacterStore.getState().destinyPatterns.candidates
      const { aiTalentGeneration } = useSettingsStore.getState()
      const cached = aiTalentGeneration ? loadCachedPool() : []
      const usableCandidates = aiTalentGeneration
        ? candidates.filter(isAIGeneratedPattern)
        : candidates
      const uniqueCandidates = uniquePatternsByIdentity(usableCandidates)
      const best = cached.length >= uniqueCandidates.length ? cached : uniqueCandidates
      if (best.length === 0) return
      fullPoolRef.current = best
      setLocalPoolSize(best.length)
      if (phase !== 'idle') setSlots((current) => mergeSlotsWithPatterns(current, best))
      if (phase === 'generating' && best.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
        completeFullDraw(best)
      }
    }
    syncPoolSize()
    const interval = setInterval(syncPoolSize, phase === 'selecting' ? 1000 : 3000)
    return () => clearInterval(interval)
  }, [completeFullDraw, fullPoolRef, phase, setLocalPoolSize, setSlots])

  useEffect(() => {
    if (phase !== 'generating') return
    const startedAt = performance.now()
    const interval = window.setInterval(() => {
      const status = getDestinyPatternSystem().getPoolFillStatus()
      const current = uniquePatternsByIdentity([
        ...fullPoolRef.current,
        ...useCharacterStore.getState().destinyPatterns.candidates,
        ...loadCachedPool(),
      ])
      if (current.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
        completeFullDraw(current)
      } else if (!status.inProgress && status.count > 0 && performance.now() - startedAt >= 3000) {
        setErrorMsg(`命格池当前只有 ${current.length} 条，需完整生成 ${DESTINY_PATTERN_DISPLAY_COUNT} 条后才能继续。`)
        setPhase('idle')
      }
    }, 1000)
    return () => window.clearInterval(interval)
  }, [completeFullDraw, fullPoolRef, phase, setErrorMsg, setPhase])

  useEffect(() => {
    if (phase !== 'selecting') return
    const { aiTalentGeneration } = useSettingsStore.getState()
    const destinySystem = getDestinyPatternSystem()
    const cachedPoolSize = loadCachedPool().length
    const runtimePoolSize = destinySystem.getPoolFillStatus().count
    if (!aiTalentGeneration || Math.max(cachedPoolSize, runtimePoolSize) >= DESTINY_PATTERN_FAST_DRAW_THRESHOLD) return

    const cached = loadCachedPool()
    if (
      cached.length < DESTINY_PATTERN_DISPLAY_COUNT
      || cached.length >= DESTINY_PATTERN_FAST_DRAW_THRESHOLD
      || destinySystem.getPoolFillStatus().inProgress
    ) return

    let cancelled = false
    configureDestinyPatternAIService()
    void destinySystem.generateWithAI(
      buildDestinyPatternContext(),
      (_count, patterns) => {
        const uniquePatterns = uniquePatternsByIdentity(patterns)
        if (uniquePatterns.length > 0) {
          fullPoolRef.current = uniquePatterns
          saveCachedPool(uniquePatterns)
          useCharacterStore.getState().setDestinyPatterns({ candidates: uniquePatterns })
        }
        if (!cancelled) setLocalPoolSize(uniquePatterns.length)
      },
      undefined,
      undefined,
      { initialPatterns: cached },
    ).then((patterns) => {
      const uniquePatterns = uniquePatternsByIdentity(patterns)
      if (uniquePatterns.length > 0) {
        fullPoolRef.current = uniquePatterns
        saveCachedPool(uniquePatterns)
        useCharacterStore.getState().setDestinyPatterns({ candidates: uniquePatterns })
      }
      if (!cancelled) setLocalPoolSize(uniquePatterns.length)
    }).catch(() => {
      /* Background pool fill is optional after the twelve visible candidates are ready. */
    })

    return () => {
      cancelled = true
      if (destinySystem.getPoolFillStatus().inProgress) destinySystem.abortPoolFill()
    }
  }, [fullPoolRef, phase, setLocalPoolSize])

  const doGenerate = useCallback(async () => {
    const { aiTalentGeneration } = useSettingsStore.getState()
    abortRef.current = false
    completionScheduledRef.current = false
    resetSelectionForGeneration()
    setPhase('generating')
    setErrorMsg('')
    clearCompletionTimer()

    if (!aiTalentGeneration) {
      const patterns = uniquePatternsByIdentity(getDestinyPatternSystem().generateFromPresets(100))
      fullPoolRef.current = patterns
      useCharacterStore.getState().setDestinyPatterns({ candidates: patterns })
      setSlots(drawSlotsFromPool(patterns))
      setLocalPoolSize(patterns.length)
      setRevealCountSynced(0)
      completeFullDraw(patterns)
      return
    }

    const initialPatterns = loadCachedPool()
    const initialRevealed = Math.min(initialPatterns.length, DESTINY_PATTERN_DISPLAY_COUNT)
    setRevealCountSynced(initialRevealed)
    setSlots(revealSlotsInOrder(initialPatterns))
    fullPoolRef.current = initialPatterns
    if (initialPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
      setRevealCountSynced(0)
      completeFullDraw(initialPatterns)
      return
    }

    if (!useWorldStore.getState().worldConfig) {
      setErrorMsg('世界配置未就绪，请返回选择世界')
      setPhase('idle')
      return
    }
    configureDestinyPatternAIService()

    const revealPatterns = (patterns: DestinyPattern[], persist = true): void => {
      const visiblePatterns = uniquePatternsByIdentity(patterns)
      if (abortRef.current || visiblePatterns.length === 0) return
      const previousRevealCount = Math.min(getRevealCount(), DESTINY_PATTERN_DISPLAY_COUNT)
      fullPoolRef.current = visiblePatterns
      if (persist) saveCachedPool(visiblePatterns)
      useCharacterStore.getState().setDestinyPatterns({ candidates: visiblePatterns })
      setLocalPoolSize(visiblePatterns.length)
      setSlots(revealSlotsInOrder(visiblePatterns))
      if (visiblePatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
        setRevealCountSynced(previousRevealCount)
        completeFullDraw(visiblePatterns)
      } else {
        setRevealCountSynced(visiblePatterns.length)
      }
    }

    try {
      const result = await getDestinyPatternSystem().generateWithAI(
        buildDestinyPatternContext(),
        (_count, patterns) => {
          if (!abortRef.current) revealPatterns(uniquePatternsByIdentity(patterns))
        },
        revealPatterns,
        undefined,
        { initialPatterns },
      )
      if (result.length > 0) revealPatterns(uniquePatternsByIdentity(result))
    } catch (error) {
      if (completionScheduledRef.current) return
      setErrorMsg(isAiCredentialError(error)
        ? '当前 API Key 无效、已过期或权限不足。请在设置中检查自己的 Key、接口网址和模型名称后重试。'
        : 'AI 命格生成失败，请检查网络后重试')
      setPhase('idle')
    }
  }, [
    abortRef,
    clearCompletionTimer,
    completeFullDraw,
    completionScheduledRef,
    fullPoolRef,
    getRevealCount,
    resetSelectionForGeneration,
    setErrorMsg,
    setLocalPoolSize,
    setPhase,
    setRevealCountSynced,
    setSlots,
  ])

  return { doGenerate }
}
