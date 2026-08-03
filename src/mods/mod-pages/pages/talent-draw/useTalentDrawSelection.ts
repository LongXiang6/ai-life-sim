/**
 * Purpose: Manage ordinary destiny-pattern selection, redraw, and final commit.
 * Owner: mod-pages/talent-draw
 * Responsibility: Selection commands and navigation handoff only; generation and mythic selection live elsewhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  DESTINY_PATTERN_SELECT_COUNT,
  aggregatePatternSystemModifiers,
  useCharacterStore,
} from '@/mods/mod-character'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { DestinyPattern } from '@/mods/mod-character'
import type { TalentDrawSlots } from './talent-draw.types'
import {
  createSelectedUiSlots,
  patternNameKey,
} from './talent-draw-patterns'
import { loadCachedPool, persistTalentDrawState } from './talent-draw-storage'

interface UseTalentDrawSelectionOptions {
  abortRef: RefObject<boolean>
  fullPoolRef: RefObject<DestinyPattern[]>
  initialSelectedSlotIndices: number[]
  localPoolSize: number
  navigate: (path: string) => void
  notify: (message: string) => void
  setErrorMsg: Dispatch<SetStateAction<string>>
  setSlots: Dispatch<SetStateAction<TalentDrawSlots>>
  slots: TalentDrawSlots
}

export function useTalentDrawSelection({
  abortRef,
  fullPoolRef,
  initialSelectedSlotIndices,
  localPoolSize,
  navigate,
  notify,
  setErrorMsg,
  setSlots,
  slots,
}: UseTalentDrawSelectionOptions) {
  const [selectedUiSlots, setSelectedUiSlots] = useState<Array<number | null>>(
    () => createSelectedUiSlots(initialSelectedSlotIndices),
  )
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const navigationFallbackTimerRef = useRef<number | null>(null)
  const confirmationRef = useRef(false)
  const selectedSlotIndices = useMemo(
    () => selectedUiSlots.filter((index): index is number => index !== null),
    [selectedUiSlots],
  )
  const selectedData = useMemo(
    () => selectedSlotIndices.map((index) => slots[index]).filter((pattern): pattern is DestinyPattern => pattern !== null),
    [selectedSlotIndices, slots],
  )

  const resetSelectionForGeneration = useCallback(() => {
    confirmationRef.current = false
    setIsConfirming(false)
    setSelectedUiSlots(createSelectedUiSlots([]))
  }, [])

  const handleSlotClick = useCallback((index: number) => {
    if (selectedSlotIndices.includes(index)) {
      const pattern = slots[index]
      if (pattern) notify(`${pattern.name}已在星契中`)
      return
    }
    const targetSlot = selectedUiSlots.findIndex((slotIndex) => slotIndex === null)
    if (targetSlot < 0) {
      notify('三个普通命格槽已满')
      return
    }
    setSelectedUiSlots((current) => current.map((value, slotIndex) => (
      slotIndex === targetSlot ? index : value
    )))
  }, [notify, selectedSlotIndices, selectedUiSlots, slots])

  const handleCandidateClick = useCallback((index: number) => {
    if (!slots[index] || selectedSlotIndices.includes(index)) return
    handleSlotClick(index)
  }, [handleSlotClick, selectedSlotIndices, slots])

  const handleDeselect = useCallback((uiSlotIndex: number) => {
    const patternIndex = selectedUiSlots[uiSlotIndex]
    const pattern = patternIndex === null ? null : slots[patternIndex]
    if (patternIndex === null || !pattern) return
    setSelectedUiSlots((current) => current.map((value, index) => (
      index === uiSlotIndex ? null : value
    )))
    notify(`已移除${pattern.name}`)
  }, [notify, selectedUiSlots, slots])

  const handleConfirm = useCallback(() => {
    if (confirmationRef.current || selectedData.length !== DESTINY_PATTERN_SELECT_COUNT) return
    confirmationRef.current = true
    setIsConfirming(true)
    setErrorMsg('')

    try {
      const destinySystem = getDestinyPatternSystem()
      const selectedIds = selectedSlotIndices
        .map((index) => slots[index])
        .filter((pattern): pattern is DestinyPattern => pattern !== null)
        .map((pattern) => pattern.id)
      const poolById = new Map<string, DestinyPattern>()
      for (const pattern of fullPoolRef.current) poolById.set(pattern.id, pattern)
      for (const pattern of slots) {
        if (pattern) poolById.set(pattern.id, pattern)
      }
      const committedPool = [...poolById.values()]
      destinySystem.selectPatterns(selectedIds, committedPool)

      const selectedPatterns = destinySystem.getPatterns()
      useWorldStore.getState().setDestinyPatternModifiers(
        aggregatePatternSystemModifiers(selectedPatterns),
      )
      const store = useCharacterStore.getState()
      store.setDestinyPatterns({
        candidates: committedPool,
        patterns: selectedPatterns,
        rarityCount: destinySystem.getRarityCount(),
      })
      if (useCharacterStore.getState().destinyPatterns.patterns.length !== DESTINY_PATTERN_SELECT_COUNT) {
        throw new Error('命格状态提交失败，请重试')
      }

      persistTalentDrawState('selecting', slots, selectedSlotIndices)
      abortRef.current = true
      navigate('/attribute-alloc')
      navigationFallbackTimerRef.current = window.setTimeout(() => {
        navigationFallbackTimerRef.current = null
        const stillOnTalentFlow = window.location.pathname.endsWith('/talent-draw')
          || window.location.pathname.endsWith('/mythic-inheritance')
        if (!stillOnTalentFlow) return
        if (useCharacterStore.getState().destinyPatterns.patterns.length === DESTINY_PATTERN_SELECT_COUNT) {
          window.location.assign('/attribute-alloc')
          return
        }
        abortRef.current = false
        confirmationRef.current = false
        setIsConfirming(false)
        setErrorMsg('命格状态未能保存，请重新确认')
      }, 450)
    } catch (error) {
      if (navigationFallbackTimerRef.current !== null) {
        window.clearTimeout(navigationFallbackTimerRef.current)
        navigationFallbackTimerRef.current = null
      }
      abortRef.current = false
      confirmationRef.current = false
      setIsConfirming(false)
      setErrorMsg(error instanceof Error ? error.message : '选择无效，请重试')
    }
  }, [abortRef, fullPoolRef, navigate, selectedData.length, selectedSlotIndices, setErrorMsg, slots])

  const handleRedraw = useCallback(() => {
    const { aiTalentGeneration } = useSettingsStore.getState()
    const cached = aiTalentGeneration ? loadCachedPool() : []
    const pool = cached.length > 0 ? cached : fullPoolRef.current
    if (pool.length < DESTINY_PATTERN_DISPLAY_COUNT) return

    setIsRegenerating(true)
    const nextSlots = [...slots]
    const currentSelected = [...selectedSlotIndices]
    const usedIds = new Set<string>()
    const usedNames = new Set<string>()
    for (const index of currentSelected) {
      const pattern = nextSlots[index]
      if (!pattern) continue
      usedIds.add(pattern.id)
      usedNames.add(patternNameKey(pattern))
    }
    for (let index = 0; index < DESTINY_PATTERN_DISPLAY_COUNT; index++) {
      if (currentSelected.includes(index)) continue
      nextSlots[index] = null
      const available = pool.filter((pattern) => (
        !usedIds.has(pattern.id) && !usedNames.has(patternNameKey(pattern))
      ))
      if (available.length === 0) continue
      const pattern = available[Math.floor(Math.random() * available.length)]
      usedIds.add(pattern.id)
      usedNames.add(patternNameKey(pattern))
      nextSlots[index] = pattern
    }
    setSlots(nextSlots)
    notify(currentSelected.length > 0
      ? `已保留${currentSelected.length}条星契，重新抽取其余命格`
      : '十二条普通命格已重新抽取')
    window.requestAnimationFrame(() => setIsRegenerating(false))
  }, [fullPoolRef, notify, selectedSlotIndices, setSlots, slots])

  useEffect(() => () => {
    if (navigationFallbackTimerRef.current !== null) {
      window.clearTimeout(navigationFallbackTimerRef.current)
    }
  }, [])

  return {
    handleCandidateClick,
    handleConfirm,
    handleDeselect,
    handleRedraw,
    isConfirming,
    isRegenerating,
    reDrawDisabled: isRegenerating || localPoolSize <= DESTINY_PATTERN_DISPLAY_COUNT,
    resetSelectionForGeneration,
    selectedData,
    selectedSlotIndices,
    selectedUiSlots,
  }
}
