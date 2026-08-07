/**
 * Purpose: Coordinate the world-customization draft, confirmation, and navigation flow.
 * Owner: mod-pages/world-customize
 * Responsibility: Hook state orchestration only; configuration translation lives in world-customize-config.
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { useGlobalStore, configStore } from '@/core'
import { buildOrchestratorWorldSetting, orchestrator } from '@/mods/mod-engine/engine-api'
import { useCharacterStore } from '@/mods/mod-character'
import {
  useWorldStore,
  formatCalibrationSummary,
} from '@/mods/mod-world'
import { commitWorldInitialization } from '@/mods/mod-world/world-init-api'
import type { WorldConfig } from '@/mods/mod-world'

import { useWorldCoherenceConfirm } from '../../hooks/useWorldCoherenceConfirm'
import { WORLD_CUSTOMIZE_DRAFT_KEY } from '../../helpers/creation-draft-storage'
import { buildFieldDefs, type EditableField, type FieldMode } from './world-customize.types'
import {
  buildDimensionModes,
  buildDimensionValues,
  isCoherenceLockable,
  normalizeFieldMode,
  resolveWorldConfig,
  type SavedFieldsState,
} from './world-customize-config'

export interface UseWorldCustomizeReturn {
  fields: EditableField[]
  groupedFields: Record<string, EditableField[]>
  worldDescription: string
  festivalScope: WorldConfig['festivalScope']
  coherenceLocks: Record<string, boolean>
  setFieldMode: (key: string, mode: FieldMode) => void
  setFieldValue: (key: string, value: string) => void
  setCustomValue: (key: string, value: string) => void
  setWorldDescription: (value: string) => void
  setFestivalScope: (value: WorldConfig['festivalScope']) => void
  toggleCoherenceLock: (fieldKey: string) => void
  isCoherenceLockable: (fieldKey: string) => boolean
  save: () => void
  skip: () => void
  isSaving: boolean
  canSave: boolean
  saveBlockReason: string | null
  saveError: string
  conflictModal: React.ReactNode
}

export function useWorldCustomize(): UseWorldCustomizeReturn {
  const router = useRouter()
  const setGamePhase = useGlobalStore((s) => s.setGamePhase)
  const setWorldName = useGlobalStore((s) => s.setWorldName)
  const setWorldConfig = useWorldStore((s) => s.setWorldConfig)
  const setInitialized = useWorldStore((s) => s.setInitialized)
  const { requestCoherenceResolve, conflictModal } = useWorldCoherenceConfirm()

  const loadSavedState = (): SavedFieldsState => {
    try {
      const raw = configStore.get<SavedFieldsState>('mod-pages', WORLD_CUSTOMIZE_DRAFT_KEY)
      const currentWorldCode = useWorldStore.getState().worldCode
      const currentWorldName = useWorldStore.getState().worldConfig?.name ?? ''
      if (
        raw
        && raw.worldCode === currentWorldCode
        && raw.worldName === currentWorldName
      ) return raw
    } catch { /* ignore */ }
    return { fieldModes: {}, fieldValues: {}, customValues: {} }
  }

  const saved = loadSavedState()
  const existingConfig = useWorldStore.getState().worldConfig

  const [fieldModes, setFieldModes] = useState<Record<string, FieldMode>>(saved.fieldModes)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(saved.fieldValues)
  const [customValues, setCustomValues] = useState<Record<string, string>>(saved.customValues)
  const [worldDescription, setWorldDescriptionState] = useState(
    saved.worldDescription ?? existingConfig?.description ?? '',
  )
  const [festivalScope, setFestivalScopeState] = useState<WorldConfig['festivalScope']>(
    saved.festivalScope ?? existingConfig?.festivalScope ?? 'china',
  )
  const [coherenceLocks, setCoherenceLocks] = useState<Record<string, boolean>>(
    saved.coherenceLocks ?? {},
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const persist = useCallback((
    modes: Record<string, FieldMode>,
    values: Record<string, string>,
    customs: Record<string, string>,
    desc: string,
    locks: Record<string, boolean>,
    nextFestivalScope: WorldConfig['festivalScope'],
  ) => {
    try {
      configStore.set('mod-pages', WORLD_CUSTOMIZE_DRAFT_KEY, {
        worldCode: useWorldStore.getState().worldCode,
        worldName: useWorldStore.getState().worldConfig?.name ?? '',
        fieldModes: modes,
        fieldValues: values,
        customValues: customs,
        worldDescription: desc,
        coherenceLocks: locks,
        festivalScope: nextFestivalScope,
      })
    } catch { /* ignore */ }
  }, [])

  const baseFields = useMemo(() => {
    return buildFieldDefs().map((def) => ({
      ...def,
      playerValue: fieldValues[def.key] ?? '',
      mode: normalizeFieldMode(fieldModes[def.key]),
      customValue: customValues[def.key] ?? '',
    }))
  }, [fieldModes, fieldValues, customValues])

  const groupedFields = useMemo(() => {
    const groups: Record<string, EditableField[]> = {}
    for (const field of baseFields) {
      if (!groups[field.category]) groups[field.category] = []
      groups[field.category].push(field)
    }
    return groups
  }, [baseFields])

  // AI 模式会在初始化时生成结果；“选择”和“自定”则必须由玩家先给出值。
  // 不允许空值落入 resolveWorldConfig 的历史默认值，否则 UI 显示“待选择”却仍能进入下一步。
  const incompleteFields = useMemo(() => baseFields.filter((field) => (
    (field.mode === 'adaptive' && !field.playerValue.trim())
      || (field.mode === 'custom' && !field.customValue.trim())
  )), [baseFields])
  const saveBlockReason = incompleteFields.length > 0
    ? `请先完成${incompleteFields.map((field) => `「${field.label}」`).join('、')}`
    : null
  const canSave = !isSaving && saveBlockReason === null

  const setFieldMode = useCallback((key: string, mode: FieldMode) => {
    setFieldModes((prev) => {
      const next = { ...prev, [key]: mode }
      persist(next, fieldValues, customValues, worldDescription, coherenceLocks, festivalScope)
      return next
    })
  }, [fieldValues, customValues, worldDescription, coherenceLocks, festivalScope, persist])

  const setFieldValue = useCallback((key: string, value: string) => {
    setFieldValues((prev) => {
      const next = { ...prev, [key]: value }
      persist(fieldModes, next, customValues, worldDescription, coherenceLocks, festivalScope)
      return next
    })
  }, [fieldModes, customValues, worldDescription, coherenceLocks, festivalScope, persist])

  const setCustomValue = useCallback((key: string, value: string) => {
    setCustomValues((prev) => {
      const next = { ...prev, [key]: value }
      persist(fieldModes, fieldValues, next, worldDescription, coherenceLocks, festivalScope)
      return next
    })
  }, [fieldModes, fieldValues, worldDescription, coherenceLocks, festivalScope, persist])

  const setWorldDescription = useCallback((value: string) => {
    setWorldDescriptionState(value)
    persist(fieldModes, fieldValues, customValues, value, coherenceLocks, festivalScope)
  }, [fieldModes, fieldValues, customValues, coherenceLocks, festivalScope, persist])

  const setFestivalScope = useCallback((value: WorldConfig['festivalScope']) => {
    setFestivalScopeState(value)
    persist(fieldModes, fieldValues, customValues, worldDescription, coherenceLocks, value)
  }, [fieldModes, fieldValues, customValues, worldDescription, coherenceLocks, persist])

  const toggleCoherenceLock = useCallback((fieldKey: string) => {
    setCoherenceLocks((prev) => {
      const next = { ...prev, [fieldKey]: !prev[fieldKey] }
      persist(fieldModes, fieldValues, customValues, worldDescription, next, festivalScope)
      return next
    })
  }, [fieldModes, fieldValues, customValues, worldDescription, festivalScope, persist])

  const commitWorld = useCallback(async (config: WorldConfig) => {
    setGamePhase('world_build')
    setWorldName(config.name)

    const configWithModes: WorldConfig = {
      ...config,
      _dimensionModes: buildDimensionModes(fieldModes),
      _dimensionValues: buildDimensionValues(fieldModes, fieldValues, customValues),
    }

    const worldCode = useWorldStore.getState().worldCode
      || useWorldStore.getState().generateAndSetWorldCode()
    const hasExistingContext = Object.keys(useWorldStore.getState().contexts).length > 0

    const result = await commitWorldInitialization(
      configWithModes,
      worldCode,
      undefined,
      hasExistingContext
        ? { globalTotalDays: orchestrator.getState().round.totalDays }
        : undefined,
    )
    const activeConfig = result.config

    setWorldConfig(activeConfig)
    setInitialized(true)
    const { calibration } = useWorldStore.getState()

    orchestrator.setContext(
      buildOrchestratorWorldSetting(activeConfig, {
        extraConfig: {
          _worldTagsText: result.formattedTags,
          _calibration: calibration,
          _calibrationSummary: calibration ? formatCalibrationSummary(calibration) : '',
          _economyModifier: calibration?.formulas?.economyModifier ?? 1.0,
        },
      }),
      {
        characterId: useCharacterStore.getState().ensureCharacterId(),
        name: '', age: 0, gender: '未设定', background: '', attributes: {},
      },
    )

    router.push('/new-game/character-create')
  }, [router, setGamePhase, setWorldName, setWorldConfig, setInitialized, fieldModes, fieldValues, customValues])

  const save = useCallback(() => {
    if (isSaving) return
    setSaveError('')
    if (saveBlockReason) {
      setSaveError(saveBlockReason)
      return
    }
    setIsSaving(true)
    try {
      const existing = useWorldStore.getState().worldConfig
      const draft = resolveWorldConfig(
        baseFields,
        worldDescription,
        coherenceLocks,
        existing,
        festivalScope,
      )
      requestCoherenceResolve(
        draft,
        (config) => {
          void commitWorld(config)
            .catch((error) => {
              setSaveError(`世界初始化失败：${error instanceof Error ? error.message : '未知错误'}`)
            })
            .finally(() => setIsSaving(false))
        },
        () => setIsSaving(false),
      )
    } catch (error) {
      setSaveError(`世界配置失败：${error instanceof Error ? error.message : '未知错误'}`)
      setIsSaving(false)
    }
  }, [
    isSaving, saveBlockReason, baseFields, worldDescription, coherenceLocks, festivalScope,
    requestCoherenceResolve, commitWorld,
  ])

  const skip = useCallback(() => {
    if (isSaving) return
    router.push('/new-game/world-select')
  }, [isSaving, router])

  return {
    fields: baseFields,
    groupedFields,
    worldDescription,
    festivalScope,
    coherenceLocks,
    setFieldMode,
    setFieldValue,
    setCustomValue,
    setWorldDescription,
    setFestivalScope,
    toggleCoherenceLock,
    isCoherenceLockable,
    save,
    skip,
    isSaving,
    canSave,
    saveBlockReason,
    saveError,
    conflictModal,
  }
}
