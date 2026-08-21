/**
 * Purpose: Manage the shared four-slot destiny and mythic loadout, redraw, and final commit.
 * Owner: mod-pages/talent-draw
 * Responsibility: Selection commands and navigation handoff only; character systems own committed state.
 */

import { useCallback, useMemo, useRef, useState } from 'react'

import {
  PATTERN_LOADOUT_SLOT_COUNT,
  assertPatternLoadout,
  useCharacterStore,
  useReincarnationLibraryStore,
} from '@/mods/mod-character'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'

import type { RefObject } from 'react'
import type { DestinyPattern, ReincarnationTalent } from '@/mods/mod-character'
import type {
  ResolvedTalentLoadoutEntry,
  TalentDrawSlots,
  TalentLoadoutEntry,
  TalentLoadoutSlots,
} from './talent-draw.types'
import { createLoadoutSlots } from './talent-draw-patterns'

interface UseTalentDrawSelectionOptions {
  abortRef: RefObject<boolean>
  candidatePool: DestinyPattern[]
  fullPoolRef: RefObject<DestinyPattern[]>
  initialLoadoutSlots: TalentLoadoutSlots
  navigate: (path: string) => void
  regenerateAll: () => void
  notify: (message: string) => void
  setErrorMsg: (message: string) => void
  slots: TalentDrawSlots
}

function entryKey(entry: TalentLoadoutEntry): string {
  return `${entry.kind}:${entry.patternId}`
}

export function useTalentDrawSelection({
  abortRef,
  candidatePool,
  fullPoolRef,
  initialLoadoutSlots,
  navigate,
  regenerateAll,
  notify,
  setErrorMsg,
  slots,
}: UseTalentDrawSelectionOptions) {
  const mythicLibrary = useReincarnationLibraryStore((state) => state.talents)
  const [loadoutSlots, setLoadoutSlots] = useState<TalentLoadoutSlots>(
    () => createLoadoutSlots(initialLoadoutSlots.filter((entry): entry is TalentLoadoutEntry => entry !== null)),
  )
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const confirmationRef = useRef(false)

  const destinyById = useMemo(() => new Map(
    candidatePool.map((pattern) => [pattern.id, pattern] as const),
  ), [candidatePool])
  const mythicById = useMemo(() => new Map(
    mythicLibrary.map((pattern) => [pattern.id, pattern] as const),
  ), [mythicLibrary])
  const resolvedLoadoutSlots = useMemo(
    () => loadoutSlots.map((entry): ResolvedTalentLoadoutEntry | null => {
      if (!entry) return null
      if (entry.kind === 'destiny') {
        const pattern = destinyById.get(entry.patternId)
        return pattern ? { kind: 'destiny', pattern } : null
      }
      const pattern = mythicById.get(entry.patternId)
      return pattern ? { kind: 'mythic', pattern } : null
    }),
    [destinyById, loadoutSlots, mythicById],
  )
  const selectedData = useMemo(
    () => resolvedLoadoutSlots.filter((entry): entry is ResolvedTalentLoadoutEntry => entry !== null),
    [resolvedLoadoutSlots],
  )
  const selectedDestinyIds = useMemo(() => new Set(
    loadoutSlots.flatMap((entry) => entry?.kind === 'destiny' ? [entry.patternId] : []),
  ), [loadoutSlots])
  const selectedMythicIds = useMemo(() => new Set(
    loadoutSlots.flatMap((entry) => entry?.kind === 'mythic' ? [entry.patternId] : []),
  ), [loadoutSlots])

  const resetSelectionForGeneration = useCallback(() => {
    confirmationRef.current = false
    setIsConfirming(false)
    setLoadoutSlots(Array(PATTERN_LOADOUT_SLOT_COUNT).fill(null))
  }, [])

  const toggleEntry = useCallback((entry: TalentLoadoutEntry, label: string) => {
    setLoadoutSlots((current) => {
      const currentIndex = current.findIndex((item) => item && entryKey(item) === entryKey(entry))
      if (currentIndex >= 0) {
        notify(`已移除${label}`)
        return current.map((item, index) => index === currentIndex ? null : item)
      }
      const targetIndex = current.findIndex((item) => item === null)
      if (targetIndex < 0) {
        notify(`四个携带槽已满`)
        return current
      }
      return current.map((item, index) => index === targetIndex ? entry : item)
    })
  }, [notify])

  const handleCandidateClick = useCallback((patternId: string) => {
    const pattern = candidatePool.find((item) => item.id === patternId)
    if (!pattern) return
    toggleEntry({ kind: 'destiny', patternId: pattern.id }, pattern.name)
  }, [candidatePool, toggleEntry])

  const handleMythicClick = useCallback((pattern: ReincarnationTalent) => {
    toggleEntry({ kind: 'mythic', patternId: pattern.id }, pattern.name)
  }, [toggleEntry])

  const handleDeselect = useCallback((slotIndex: number) => {
    const entry = resolvedLoadoutSlots[slotIndex]
    if (!entry) return
    setLoadoutSlots((current) => current.map((item, index) => index === slotIndex ? null : item))
    notify(`已移除${entry.pattern.name}`)
  }, [notify, resolvedLoadoutSlots])

  const handleConfirm = useCallback(() => {
    if (confirmationRef.current || selectedData.length !== PATTERN_LOADOUT_SLOT_COUNT) return
    confirmationRef.current = true
    setIsConfirming(true)
    setErrorMsg('')

    try {
      const poolById = new Map<string, DestinyPattern>()
      for (const pattern of fullPoolRef.current) poolById.set(pattern.id, pattern)
      for (const pattern of slots) if (pattern) poolById.set(pattern.id, pattern)
      const committedPool = [...poolById.values()]
      const selectedPatterns = loadoutSlots.flatMap((entry) => {
        if (entry?.kind !== 'destiny') return []
        const pattern = poolById.get(entry.patternId)
        if (!pattern) throw new Error(`普通命格已失效：${entry.patternId}`)
        return [pattern]
      })
      const selectedMythicPatterns = loadoutSlots.flatMap((entry) => {
        if (entry?.kind !== 'mythic') return []
        const pattern = mythicById.get(entry.patternId)
        if (!pattern) throw new Error(`轮回天赋已失效：${entry.patternId}`)
        return [pattern]
      })
      assertPatternLoadout(selectedPatterns, selectedMythicPatterns, true)

      const destinySystem = getDestinyPatternSystem()
      destinySystem.selectPatterns(selectedPatterns.map((pattern) => pattern.id), committedPool)
      useCharacterStore.getState().setPatternLoadout(
        destinySystem.getPatterns(),
        selectedMythicPatterns,
        committedPool,
      )

      abortRef.current = true
      navigate('/attribute-alloc')
    } catch (error) {
      abortRef.current = false
      confirmationRef.current = false
      setIsConfirming(false)
      setErrorMsg(error instanceof Error ? error.message : '选择无效，请重新确认')
    }
  }, [
    abortRef,
    fullPoolRef,
    loadoutSlots,
    mythicById,
    navigate,
    selectedData.length,
    setErrorMsg,
    slots,
  ])

  const handleRedraw = useCallback(() => {
    if (isRegenerating) return
    setIsRegenerating(true)
    regenerateAll()
    window.requestAnimationFrame(() => setIsRegenerating(false))
  }, [isRegenerating, regenerateAll])

  return {
    handleCandidateClick,
    handleConfirm,
    handleDeselect,
    handleMythicClick,
    handleRedraw,
    isConfirming,
    isRegenerating,
    loadoutSlots,
    mythicLibrary,
    reDrawDisabled: isRegenerating,
    resetSelectionForGeneration,
    resolvedLoadoutSlots,
    selectedData,
    selectedDestinyIds,
    selectedMythicIds,
  }
}
