/**
 * Purpose: Run the four-category destiny draw and start silent background filling after handoff.
 * Owner: mod-pages/talent-draw
 * Responsibility: Generation command lifecycle only; parsing and pool ownership remain in mod-character.
 */

import { useCallback, useEffect } from 'react'

import { isAiCredentialError } from '@/core/ai-service'
import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  useCharacterStore,
} from '@/mods/mod-character'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { DestinyPattern } from '@/mods/mod-character'
import type { TalentDrawPhase, TalentDrawSlots } from './talent-draw.types'
import { buildDestinyPatternContext, configureDestinyPatternAIService } from './talent-draw-ai-service'
import { drawSlotsFromPool, uniquePatternsByIdentity } from './talent-draw-patterns'

interface UseTalentDrawGenerationOptions {
  abortRef: RefObject<boolean>
  clearCompletionTimer: () => void
  completeFullDraw: (patterns: DestinyPattern[]) => boolean
  completionScheduledRef: RefObject<boolean>
  fullPoolRef: RefObject<DestinyPattern[]>
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
    if (destinySystem.getPoolFillStatus().phase === 'initial') destinySystem.abortPoolFill()
  }, [abortRef])

  const doGenerate = useCallback(async () => {
    const { aiTalentGeneration } = useSettingsStore.getState()
    abortRef.current = false
    completionScheduledRef.current = false
    resetSelectionForGeneration()
    clearCompletionTimer()
    setErrorMsg('')
    setPhase('generating')
    setRevealCountSynced(0)
    setSlots(Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null))
    fullPoolRef.current = []
    setLocalPoolSize(0)

    if (!aiTalentGeneration) {
      const destinySystem = getDestinyPatternSystem()
      const patterns = uniquePatternsByIdentity(
        destinySystem.generateFromPresets(DESTINY_PATTERN_DISPLAY_COUNT),
      )
      destinySystem.hydratePool(patterns)
      fullPoolRef.current = patterns
      useCharacterStore.getState().setDestinyPatterns({ candidates: patterns })
      setLocalPoolSize(patterns.length)
      setSlots(drawSlotsFromPool(patterns))
      completeFullDraw(patterns)
      return
    }

    configureDestinyPatternAIService()
    try {
      const destinySystem = getDestinyPatternSystem()
      const context = buildDestinyPatternContext()
      const patterns = await destinySystem.generateWithAI(context)
      if (abortRef.current) return
      const complete = uniquePatternsByIdentity(patterns)
      fullPoolRef.current = complete
      useCharacterStore.getState().setDestinyPatterns({ candidates: complete })
      setLocalPoolSize(complete.length)
      if (!completeFullDraw(complete)) throw new Error('命格首批候选未形成完整四类候选集')
    } catch (error) {
      if (abortRef.current) return
      setErrorMsg(isAiCredentialError(error)
        ? '当前 API Key 无效、已过期或权限不足。请在设置中检查自己的 Key、接口网址和模型名称。'
        : error instanceof Error ? error.message : 'AI 命格生成失败，请检查网络与模型设置。')
      setPhase('idle')
    }
  }, [
    abortRef,
    clearCompletionTimer,
    completeFullDraw,
    completionScheduledRef,
    fullPoolRef,
    resetSelectionForGeneration,
    setErrorMsg,
    setLocalPoolSize,
    setPhase,
    setRevealCountSynced,
    setSlots,
  ])

  const startBackgroundFill = useCallback(() => {
    const { aiTalentGeneration } = useSettingsStore.getState()
    if (!aiTalentGeneration) return
    const destinySystem = getDestinyPatternSystem()
    configureDestinyPatternAIService()
    void destinySystem.startBackgroundFill(buildDestinyPatternContext(), fullPoolRef.current).then((patterns) => {
      if (abortRef.current) return
      const complete = uniquePatternsByIdentity(patterns)
      fullPoolRef.current = complete
      useCharacterStore.getState().setDestinyPatterns({ candidates: complete })
      setLocalPoolSize(complete.length)
      setSlots((current) => {
        const next = [...current]
        const visibleIds = new Set(next.flatMap((pattern) => pattern ? [pattern.id] : []))
        for (const pattern of complete) {
          if (visibleIds.has(pattern.id)) continue
          const index = next.findIndex((slot) => slot === null)
          if (index < 0) break
          next[index] = pattern
          visibleIds.add(pattern.id)
        }
        return next
      })
    }).catch(() => {
      /* Background fill is optional after the four-category handoff is ready. */
    })
  }, [abortRef, fullPoolRef, setLocalPoolSize, setSlots])

  return { doGenerate, startBackgroundFill }
}
