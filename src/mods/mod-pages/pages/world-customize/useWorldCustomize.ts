'use client'

/**
 * @file useWorldCustomize.ts
 * @description 世界自定义页面核心 Hook —— 宏观维度编辑 + 描述 + 锁定 + 一致性确认
 * @mod mod-pages
 */

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { useGlobalStore, configStore } from '@/core'
import { buildOrchestratorWorldSetting, orchestrator } from '@/mods/mod-engine/engine-api'
import { useCharacterStore } from '@/mods/mod-character'
import {
  useWorldStore,
  buildCoherenceLocksFromUi,
  mapPowerSystemZhToTag,
  mapWorldviewEssenceZhToTag,
  SPATIAL_FORM_ZH_MAP,
  COHERENCE_LOCK_FIELD_MAP,
  formatCalibrationSummary,
} from '@/mods/mod-world'
import { commitWorldInitialization } from '@/mods/mod-world/world-init-api'
import type { WorldConfig } from '@/mods/mod-world'

import { useWorldCoherenceConfirm } from '../../hooks/useWorldCoherenceConfirm'
import { WORLD_CUSTOMIZE_DRAFT_KEY } from '../../helpers/creation-draft-storage'
import { buildFieldDefs, type EditableField, type FieldMode } from './world-customize.types'

const DIMENSION_FIELD_KEYS = [
  'universeScale',
  'worldviewEssence',
  'powerSystem',
  'powerCeiling',
] as const

const COHERENCE_LOCKABLE_KEYS = new Set(Object.keys(COHERENCE_LOCK_FIELD_MAP))

function buildDimensionModes(fieldModes: Record<string, FieldMode>): Record<string, FieldMode> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((k) => [k, normalizeFieldMode(fieldModes[k])]),
  )
}

function buildDimensionValues(
  fieldModes: Record<string, FieldMode>,
  fieldValues: Record<string, string>,
  customValues: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((k) => {
      const mode = normalizeFieldMode(fieldModes[k])
      if (mode === 'custom') return [k, customValues[k] || '']
      if (mode === 'adaptive') return [k, fieldValues[k] || '']
      return [k, '']
    }),
  )
}

function buildActiveCoherenceLocks(coherenceLocks: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((k) => [k, coherenceLocks[k] === true]),
  )
}

function normalizeFieldMode(mode: unknown): FieldMode {
  if (mode === 'custom') return 'custom'
  if (mode === 'adaptive') return 'adaptive'
  return 'ai'
}

interface SavedFieldsState {
  worldCode?: number
  worldName?: string
  fieldModes: Record<string, FieldMode>
  fieldValues: Record<string, string>
  customValues: Record<string, string>
  worldDescription?: string
  coherenceLocks?: Record<string, boolean>
}

const SPATIAL_FORM_CEILING: Record<string, number> = {
  位面: 8,
  宇宙: 12,
  位面晶壁群系: 18,
  多元宇宙群系: 21,
  诸天万界: 23,
}

function resolveWorldConfig(
  baseFields: EditableField[],
  worldDescription: string,
  coherenceLocks: Record<string, boolean>,
  existingConfig?: WorldConfig | null,
  aiDecision?: {
    universeScale: string
    worldviewEssence: string
    powerSystem: string
    powerCeiling: number
  },
): WorldConfig {
  const getEffectiveValue = (key: string): string => {
    const field = baseFields.find((f) => f.key === key)
    if (!field) return ''
    if (field.mode === 'ai' && aiDecision) {
      if (key === 'powerCeiling') return `${aiDecision.powerCeiling}阶`
      if (key === 'universeScale') return aiDecision.universeScale
      if (key === 'worldviewEssence') return aiDecision.worldviewEssence
      if (key === 'powerSystem') return aiDecision.powerSystem
      return ''
    }
    if (field.mode === 'custom' && field.customValue) return field.customValue
    if (field.mode === 'adaptive' && field.playerValue) return field.playerValue
    return ''
  }

  const powerSystemVal = getEffectiveValue('powerSystem')
  const worldviewVal = getEffectiveValue('worldviewEssence')
  const powerSystemTag = powerSystemVal
    ? mapPowerSystemZhToTag(powerSystemVal)
    : existingConfig?.powerSystemTag ?? 'none'
  const essenceTag = worldviewVal
    ? mapWorldviewEssenceZhToTag(worldviewVal)
    : existingConfig?.essenceTag ?? 'modern'

  const powerCeilingVal = getEffectiveValue('powerCeiling')
  const powerCeilingNum = powerCeilingVal
    ? parseInt(powerCeilingVal.match(/^(\d+)/)?.[1] ?? '8') || 8
    : existingConfig?.powerCeiling ?? 8

  const spatialVal = getEffectiveValue('universeScale')
  const spatialForm = spatialVal
    ? SPATIAL_FORM_ZH_MAP[spatialVal] ?? 'plane'
    : existingConfig?.spatialForm ?? 'plane'

  const civilizationStage = existingConfig?.civilizationStage ?? 'medieval'

  const templateDescriptionPattern = /^.+世界观 · .+空间形态$/
  const trimmedDesc = worldDescription.trim()
  const hasCustomDescription = trimmedDesc.length > 0
  const hasExistingDescription = existingConfig?.description
    && !templateDescriptionPattern.test(existingConfig.description)

  const description = hasCustomDescription
    ? trimmedDesc
    : hasExistingDescription
      ? existingConfig!.description
      : `${powerSystemVal || powerSystemTag} 世界观 · ${spatialVal || spatialForm} 空间形态`

  const hasExistingName = existingConfig?.name && existingConfig.name !== '自定义世界'

  return {
    name: hasExistingName ? existingConfig!.name : '自定义世界',
    spatialForm,
    essenceTag,
    powerSystemTag,
    powerCeiling: powerCeilingNum,
    civilizationStage,
    difficulty: existingConfig?.difficulty ?? 'normal',
    worldType: existingConfig?.worldType,
    description,
    _aiFlags: Object.fromEntries(
      DIMENSION_FIELD_KEYS.map((k) => [k, baseFields.find((f) => f.key === k)?.mode === 'ai']),
    ),
    _coherenceLocks: buildCoherenceLocksFromUi(buildActiveCoherenceLocks(coherenceLocks)),
  }
}

export interface UseWorldCustomizeReturn {
  fields: EditableField[]
  groupedFields: Record<string, EditableField[]>
  worldDescription: string
  coherenceLocks: Record<string, boolean>
  setFieldMode: (key: string, mode: FieldMode) => void
  setFieldValue: (key: string, value: string) => void
  setCustomValue: (key: string, value: string) => void
  setWorldDescription: (value: string) => void
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
      })
    } catch { /* ignore */ }
  }, [])

  const baseFields = useMemo(() => {
    return buildFieldDefs(24).map((def) => ({
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
      persist(next, fieldValues, customValues, worldDescription, coherenceLocks)
      return next
    })
  }, [fieldValues, customValues, worldDescription, coherenceLocks, persist])

  const setFieldValue = useCallback((key: string, value: string) => {
    setFieldValues((prev) => {
      const next = { ...prev, [key]: value }
      persist(fieldModes, next, customValues, worldDescription, coherenceLocks)
      if (key === 'universeScale') {
        const maxCeiling = SPATIAL_FORM_CEILING[value] ?? 24
        const currentCeilingMatch = fieldValues['powerCeiling']?.match(/^(\d+)/)
        if (currentCeilingMatch) {
          const currentCeiling = parseInt(currentCeilingMatch[1])
          if (currentCeiling > maxCeiling) {
            setTimeout(() => {
              setFieldValues((fv) => {
                const updated = { ...fv, powerCeiling: '' }
                persist(fieldModes, updated, customValues, worldDescription, coherenceLocks)
                return updated
              })
            }, 0)
          }
        }
      }
      return next
    })
  }, [fieldModes, fieldValues, customValues, worldDescription, coherenceLocks, persist])

  const setCustomValue = useCallback((key: string, value: string) => {
    setCustomValues((prev) => {
      const next = { ...prev, [key]: value }
      persist(fieldModes, fieldValues, next, worldDescription, coherenceLocks)
      return next
    })
  }, [fieldModes, fieldValues, worldDescription, coherenceLocks, persist])

  const setWorldDescription = useCallback((value: string) => {
    setWorldDescriptionState(value)
    persist(fieldModes, fieldValues, customValues, value, coherenceLocks)
  }, [fieldModes, fieldValues, customValues, coherenceLocks, persist])

  const toggleCoherenceLock = useCallback((fieldKey: string) => {
    setCoherenceLocks((prev) => {
      const next = { ...prev, [fieldKey]: !prev[fieldKey] }
      persist(fieldModes, fieldValues, customValues, worldDescription, next)
      return next
    })
  }, [fieldModes, fieldValues, customValues, worldDescription, persist])

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
    try {
      configStore.set('mod-power-system', 'power-ceiling', String(activeConfig.powerCeiling))
    } catch { /* 存储不可用 */ }

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
      const draft = resolveWorldConfig(baseFields, worldDescription, coherenceLocks, existing)
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
    isSaving, saveBlockReason, baseFields, worldDescription, coherenceLocks, requestCoherenceResolve, commitWorld,
  ])

  const skip = useCallback(() => {
    if (isSaving) return
    router.push('/new-game/world-select')
  }, [isSaving, router])

  return {
    fields: baseFields,
    groupedFields,
    worldDescription,
    coherenceLocks,
    setFieldMode,
    setFieldValue,
    setCustomValue,
    setWorldDescription,
    toggleCoherenceLock,
    isCoherenceLockable: (key) => COHERENCE_LOCKABLE_KEYS.has(key),
    save,
    skip,
    isSaving,
    canSave,
    saveBlockReason,
    saveError,
    conflictModal,
  }
}
