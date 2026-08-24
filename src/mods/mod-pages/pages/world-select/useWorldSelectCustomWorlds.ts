/**
 * Purpose: Manage saved custom worlds, their editor form, search, and deletion flow.
 * Owner: mod-pages/world-select
 * Responsibility: Custom-world UI state and persistence only; preset selection and confirmation remain in the parent hook.
 */

import { useCallback, useMemo, useState } from 'react'

import { saveStore } from '@/core'
import { allocateWorldCode, type PresetWorld } from '@/mods/mod-world'

import { LABELS } from './world-select-labels'
import {
  loadSavedWorlds,
  savedCustomWorldToPreset,
} from './world-select-worlds'
import type { EraEntry, SavedCustomWorld } from './useWorldSelectForm'

interface UseWorldSelectCustomWorldsOptions {
  onClearConfirmError: () => void
  onDeleteSelectedWorld: (worldId: string) => void
  onSelectWorld: (world: PresetWorld) => void
}

export function useWorldSelectCustomWorlds({
  onClearConfirmError,
  onDeleteSelectedWorld,
  onSelectWorld,
}: UseWorldSelectCustomWorldsOptions) {
  const [savedWorlds, setSavedWorlds] = useState<SavedCustomWorld[]>(loadSavedWorlds)
  const [showCustom, setShowCustom] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [savedSearch, setSavedSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customEraName, setCustomEraName] = useState('')
  const [customEraYear, setCustomEraYear] = useState('')
  const [isBC, setIsBC] = useState(false)
  const [autoEraEnabled, setAutoEraEnabled] = useState(false)
  const [eraTimelineEntries, setEraTimelineEntries] = useState<EraEntry[]>([])
  const [newEraEntryName, setNewEraEntryName] = useState('')
  const [newEraEntryYear, setNewEraEntryYear] = useState('')
  const [worldview, setWorldview] = useState('auto')
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null)
  const [pendingDeleteWorldId, setPendingDeleteWorldId] = useState<string | null>(null)
  const [customFeedback, setCustomFeedback] = useState<{ type: 'success' | 'warning'; text: string } | null>(null)

  const persistSaved = useCallback((worlds: SavedCustomWorld[]) => {
    setSavedWorlds(worlds)
    saveStore.set('mod-pages', 0, 'custom-worlds', worlds)
  }, [])
  const filteredSavedWorlds = useMemo(() => {
    const keyword = savedSearch.trim().toLocaleLowerCase('zh-CN')
    if (!keyword) return savedWorlds
    return savedWorlds.filter((world) =>
      [world.name, world.description, world.eraName].some((value) =>
        value.toLocaleLowerCase('zh-CN').includes(keyword),
      ),
    )
  }, [savedSearch, savedWorlds])

  const clearCustomTransientState = useCallback(() => {
    setEditingWorldId(null)
    setPendingDeleteWorldId(null)
  }, [])
  const resetCustomForm = useCallback(() => {
    clearCustomTransientState()
    setCustomName('')
    setCustomDesc('')
    setCustomEraName('')
    setCustomEraYear('')
    setIsBC(false)
    setAutoEraEnabled(false)
    setEraTimelineEntries([])
    setNewEraEntryName('')
    setNewEraEntryYear('')
    setWorldview('auto')
  }, [clearCustomTransientState])

  const handleSelectCustomWorld = useCallback((world: SavedCustomWorld) => {
    onSelectWorld(savedCustomWorldToPreset(world))
    clearCustomTransientState()
  }, [clearCustomTransientState, onSelectWorld])

  const handleAddCustom = useCallback(() => {
    if (!customName.trim() || !customDesc.trim()) {
      setCustomFeedback({ type: 'warning', text: '请先填写世界名称和详细介绍。' })
      return
    }
    const worldCode = allocateWorldCode()
    const signedYear = (parseInt(customEraYear) || 1) * (isBC ? -1 : 1)
    const world: SavedCustomWorld = {
      id: `custom-${worldCode}`,
      name: customName.trim(),
      description: customDesc.trim(),
      eraName: customEraName.trim() || LABELS.defaultEraName,
      eraStartYear: signedYear,
      currentEraYear: signedYear,
      eraTimeline: autoEraEnabled ? [...eraTimelineEntries] : undefined,
      worldview,
      dynamicAttrTags: ['wealth', 'fame', 'power', 'ability', 'connections'],
      worldCode,
    }
    persistSaved([...savedWorlds, world])
    resetCustomForm()
    setCustomFeedback({ type: 'success', text: `已保存自定义世界「${world.name}」。` })
    onClearConfirmError()
    onSelectWorld(savedCustomWorldToPreset(world))
  }, [
    autoEraEnabled,
    customDesc,
    customEraName,
    customEraYear,
    customName,
    eraTimelineEntries,
    isBC,
    onClearConfirmError,
    onSelectWorld,
    persistSaved,
    resetCustomForm,
    savedWorlds,
    worldview,
  ])

  const handleStartEdit = useCallback((world: SavedCustomWorld) => {
    setEditingWorldId(world.id)
    setPendingDeleteWorldId(null)
    setCustomFeedback(null)
    setCustomName(world.name)
    setCustomDesc(world.description)
    setCustomEraName(world.eraName)
    setCustomEraYear(String(Math.abs(world.eraStartYear)))
    setIsBC(world.eraStartYear < 0)
    setAutoEraEnabled(Boolean(world.eraTimeline))
    setEraTimelineEntries(world.eraTimeline || [])
    setWorldview(world.worldview)
    setShowCustomForm(true)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!customName.trim() || !customDesc.trim() || !editingWorldId) {
      setCustomFeedback({ type: 'warning', text: '请先填写世界名称和详细介绍。' })
      return
    }
    const signedYear = (parseInt(customEraYear) || 1) * (isBC ? -1 : 1)
    const updated = savedWorlds.map((world) => world.id === editingWorldId
      ? {
          ...world,
          name: customName.trim(),
          description: customDesc.trim(),
          eraName: customEraName.trim() || LABELS.defaultEraName,
          eraStartYear: signedYear,
          currentEraYear: signedYear,
          eraTimeline: autoEraEnabled ? [...eraTimelineEntries] : undefined,
          worldview,
        }
      : world)
    persistSaved(updated)
    resetCustomForm()
    const edited = updated.find((world) => world.id === editingWorldId)
    if (edited) {
      setCustomFeedback({ type: 'success', text: `已保存「${edited.name}」的修改。` })
      onClearConfirmError()
      onSelectWorld(savedCustomWorldToPreset(edited))
    }
  }, [
    autoEraEnabled,
    customDesc,
    customEraName,
    customEraYear,
    customName,
    editingWorldId,
    eraTimelineEntries,
    isBC,
    onClearConfirmError,
    onSelectWorld,
    persistSaved,
    resetCustomForm,
    savedWorlds,
    worldview,
  ])

  const handleCancelEdit = useCallback(() => {
    resetCustomForm()
    setCustomFeedback(null)
  }, [resetCustomForm])
  const handleDeleteCustom = useCallback((world: SavedCustomWorld) => {
    setPendingDeleteWorldId(world.id)
    setCustomFeedback({ type: 'warning', text: `再次确认后将删除「${world.name}」。` })
  }, [])
  const handleCancelDeleteCustom = useCallback(() => {
    setPendingDeleteWorldId(null)
    setCustomFeedback(null)
  }, [])
  const handleConfirmDeleteCustom = useCallback((world: SavedCustomWorld) => {
    persistSaved(savedWorlds.filter((item) => item.id !== world.id))
    onDeleteSelectedWorld(world.id)
    setPendingDeleteWorldId(null)
    onClearConfirmError()
    setCustomFeedback({ type: 'success', text: `已删除自定义世界「${world.name}」。` })
  }, [onClearConfirmError, onDeleteSelectedWorld, persistSaved, savedWorlds])

  return {
    autoEraEnabled,
    clearCustomTransientState,
    customDesc,
    customEraName,
    customEraYear,
    customFeedback,
    customName,
    editingWorldId,
    eraTimelineEntries,
    filteredSavedWorlds,
    handleAddCustom,
    handleCancelDeleteCustom,
    handleCancelEdit,
    handleConfirmDeleteCustom,
    handleDeleteCustom,
    handleSaveEdit,
    handleSelectCustomWorld,
    handleStartEdit,
    isBC,
    newEraEntryName,
    newEraEntryYear,
    pendingDeleteWorldId,
    savedSearch,
    savedWorlds,
    setAutoEraEnabled,
    setCustomDesc,
    setCustomEraName,
    setCustomEraYear,
    setCustomName,
    setEraTimelineEntries,
    setIsBC,
    setNewEraEntryName,
    setNewEraEntryYear,
    setSavedSearch,
    setShowCustom,
    setShowCustomForm,
    showCustom,
    showCustomForm,
  }
}
