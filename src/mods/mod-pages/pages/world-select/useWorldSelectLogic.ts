/**
 * Purpose: Coordinate preset selection, difficulty, and world confirmation.
 * Owner: mod-pages/world-select
 * Responsibility: Page hook orchestration; custom-world CRUD, labels, and projections live in sibling modules.
 */

'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  PRESET_WORLDS,
  resolvePresetWorldCode,
  useWorldStore,
  type PresetWorld,
} from '@/mods/mod-world'

import { LABELS } from './world-select-labels'
import { resolveRestoredWorld } from './world-select-worlds'
import { useWorldConfirm } from './useWorldConfirm'
import { useWorldSelectCache } from './useWorldSelectCache'
import { useWorldSelectCustomWorlds } from './useWorldSelectCustomWorlds'
import {
  DIFFICULTY_CONFIG,
  DIFFICULTY_ORDER,
  DIFFICULTY_TITLES,
  useWorldSelectForm,
} from './useWorldSelectForm'

export { LABELS } from './world-select-labels'

export function useWorldSelectLogic() {
  const router = useRouter()
  const existingWorldConfig = useWorldStore((state) => state.worldConfig)
  const existingWorldCode = useWorldStore((state) => state.worldCode)
  const { handleConfirm: confirmWorld } = useWorldConfirm()
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [selectedWorldOverride, setSelectedWorld] = useState<PresetWorld | null>(null)
  const [showMore, setShowMore] = useState(false)

  const handleCustomWorldSelection = useCallback((world: PresetWorld) => {
    setSelectedWorld(world)
    setConfirmError('')
  }, [])
  const handleDeletedSelectedWorld = useCallback((worldId: string) => {
    setSelectedWorld((current) => current?.id === worldId ? null : current)
  }, [])
  const clearConfirmError = useCallback(() => setConfirmError(''), [])
  const custom = useWorldSelectCustomWorlds({
    onClearConfirmError: clearConfirmError,
    onDeleteSelectedWorld: handleDeletedSelectedWorld,
    onSelectWorld: handleCustomWorldSelection,
  })
  const clearCustomTransientState = custom.clearCustomTransientState
  const restoredWorld = useMemo(
    () => resolveRestoredWorld(existingWorldConfig, existingWorldCode, custom.savedWorlds),
    [custom.savedWorlds, existingWorldCode, existingWorldConfig],
  )
  const selectedWorld = selectedWorldOverride ?? restoredWorld ?? PRESET_WORLDS[0] ?? null
  const { difficulty, setDifficulty } = useWorldSelectForm(existingWorldConfig?.difficulty ?? 'normal')
  const { presetMain, presetMore } = useMemo(() => ({
    presetMain: PRESET_WORLDS.slice(0, 6),
    presetMore: PRESET_WORLDS.slice(6),
  }), [])
  const worldCodes = useMemo(
    () => [
      ...presetMain.map(resolvePresetWorldCode),
      ...presetMore.map(resolvePresetWorldCode),
      ...custom.savedWorlds.map((world) => world.worldCode),
    ],
    [custom.savedWorlds, presetMain, presetMore],
  )
  const cache = useWorldSelectCache(worldCodes)
  const difficultyItems = useMemo(
    () => DIFFICULTY_ORDER.map((item) => ({
      label: DIFFICULTY_CONFIG[item].label,
      icon: difficulty === item ? ('✔' as const) : undefined,
      title: DIFFICULTY_TITLES[item],
      onClick: () => {
        setDifficulty(item)
        setConfirmError('')
      },
    })),
    [difficulty, setDifficulty],
  )
  const confirmTitle = useMemo(
    () => selectedWorld
      ? `${LABELS.confirmTitlePrefix}${selectedWorld.name}`
      : LABELS.confirmDisabledTitle,
    [selectedWorld],
  )

  const handleCycleDifficulty = useCallback(() => {
    const currentIndex = DIFFICULTY_ORDER.indexOf(difficulty)
    const nextDifficulty = DIFFICULTY_ORDER[(currentIndex + 1) % DIFFICULTY_ORDER.length] ?? 'normal'
    setDifficulty(nextDifficulty)
    setConfirmError('')
  }, [difficulty, setDifficulty])
  const handleSelectPreset = useCallback((world: PresetWorld) => {
    setSelectedWorld(world)
    clearCustomTransientState()
    setConfirmError('')
  }, [clearCustomTransientState])
  const handleConfirm = useCallback(async () => {
    if (!selectedWorld || isConfirming) return
    setConfirmError('')
    setIsConfirming(true)
    try {
      const worldCode = typeof selectedWorld.config.worldCode === 'number'
        ? selectedWorld.config.worldCode
        : undefined
      const customWorldview = typeof selectedWorld.config.worldview === 'string'
        ? selectedWorld.config.worldview
        : undefined
      await confirmWorld(selectedWorld, difficulty, { worldCode, customWorldview })
    } catch (error) {
      setConfirmError(`世界初始化失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsConfirming(false)
    }
  }, [confirmWorld, difficulty, isConfirming, selectedWorld])
  const handleBack = useCallback(() => router.push('/'), [router])

  return {
    selectedWorld,
    showMore,
    showCustom: custom.showCustom,
    showCustomForm: custom.showCustomForm,
    difficulty,
    customName: custom.customName,
    customDesc: custom.customDesc,
    customEraName: custom.customEraName,
    customEraYear: custom.customEraYear,
    isBC: custom.isBC,
    autoEraEnabled: custom.autoEraEnabled,
    eraTimelineEntries: custom.eraTimelineEntries,
    newEraEntryName: custom.newEraEntryName,
    newEraEntryYear: custom.newEraEntryYear,
    savedWorlds: custom.savedWorlds,
    filteredSavedWorlds: custom.filteredSavedWorlds,
    savedSearch: custom.savedSearch,
    editingWorldId: custom.editingWorldId,
    pendingDeleteWorldId: custom.pendingDeleteWorldId,
    customFeedback: custom.customFeedback,
    isConfirming,
    confirmError,
    setShowMore,
    setShowCustom: custom.setShowCustom,
    setShowCustomForm: custom.setShowCustomForm,
    setCustomName: custom.setCustomName,
    setCustomDesc: custom.setCustomDesc,
    setCustomEraName: custom.setCustomEraName,
    setCustomEraYear: custom.setCustomEraYear,
    setIsBC: custom.setIsBC,
    setAutoEraEnabled: custom.setAutoEraEnabled,
    setEraTimelineEntries: custom.setEraTimelineEntries,
    setNewEraEntryName: custom.setNewEraEntryName,
    setNewEraEntryYear: custom.setNewEraEntryYear,
    setSavedSearch: custom.setSavedSearch,
    handleSelectPreset,
    handleSelectCustomWorld: custom.handleSelectCustomWorld,
    handleAddCustom: custom.handleAddCustom,
    handleStartEdit: custom.handleStartEdit,
    handleSaveEdit: custom.handleSaveEdit,
    handleCancelEdit: custom.handleCancelEdit,
    handleDeleteCustom: custom.handleDeleteCustom,
    handleConfirmDeleteCustom: custom.handleConfirmDeleteCustom,
    handleCancelDeleteCustom: custom.handleCancelDeleteCustom,
    handleConfirm,
    handleBack,
    handleCycleDifficulty,
    presetMain,
    presetMore,
    difficultyItems,
    selectedDifficultyLabel: LABELS.difficultyItems[difficulty].label,
    confirmTitle,
    worldCodesWithCache: cache.worldCodesWithCache,
    rotatingWorldCode: cache.rotatingWorldCode,
    pendingCacheReset: cache.pendingCacheReset,
    handleRequestClearWorldCache: cache.handleRequestClearWorldCache,
    handleCancelClearWorldCache: cache.handleCancelClearWorldCache,
    handleConfirmClearWorldCache: cache.handleConfirmClearWorldCache,
    handleClearWorldCache: cache.handleClearWorldCache,
    LABELS,
  }
}
