'use client'

/**
 * @file useWorldCustomize.ts
 * @description 世界自定义页面核心 Hook —— 宏观维度编辑 + 描述 + 锁定 + 一致性确认
 * @mod mod-pages
 */

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { useGlobalStore, configStore } from '@/core'
import { orchestrator } from '@/mods/mod-engine/engine-api'
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
import { buildFieldDefs, type EditableField, type FieldMode } from './world-customize.types'

const STORAGE_KEY = 'mod-pages:world-customize-fields'

const DIMENSION_FIELD_KEYS = [
  'powerSystem',
  'worldviewEssence',
  'powerCeiling',
  'universeScale',
] as const

const COHERENCE_LOCKABLE_KEYS = new Set(Object.keys(COHERENCE_LOCK_FIELD_MAP))

function buildDimensionModes(fieldModes: Record<string, FieldMode>): Record<string, FieldMode> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((k) => [k, normalizeFieldMode(fieldModes[k])]),
  )
}

function buildDimensionValues(
  fieldValues: Record<string, string>,
  customValues: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((k) => [k, customValues[k] || fieldValues[k] || '']),
  )
}

function buildActiveCoherenceLocks(coherenceLocks: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((k) => [k, coherenceLocks[k] === true]),
  )
}

function normalizeFieldMode(mode: unknown): FieldMode {
  return mode === 'custom' ? 'custom' : 'adaptive'
}

interface SavedFieldsState {
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
): WorldConfig {
  const getEffectiveValue = (key: string): string => {
    const field = baseFields.find((f) => f.key === key)
    if (!field) return ''
    if (field.mode === 'custom' && field.customValue) return field.customValue
    if (field.mode === 'adaptive' && field.playerValue) return field.playerValue
    return ''
  }

  const powerSystemVal = getEffectiveValue('powerSystem') || '修仙'
  const worldviewVal = getEffectiveValue('worldviewEssence') || '唯心主义'
  const powerSystemTag = mapPowerSystemZhToTag(powerSystemVal)
  const essenceTag = mapWorldviewEssenceZhToTag(worldviewVal)

  const powerCeilingVal = getEffectiveValue('powerCeiling')
  const powerCeilingNum = parseInt(powerCeilingVal?.match(/^(\d+)/)?.[1] ?? '8') || 8

  const spatialVal = getEffectiveValue('universeScale') || '宇宙'
  const spatialForm = SPATIAL_FORM_ZH_MAP[spatialVal] ?? 'plane'

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
      : `${powerSystemVal} 世界观 · ${spatialVal} 空间形态`

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
      const raw = configStore.get<SavedFieldsState>('mod-pages', STORAGE_KEY)
      if (raw) return raw
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

  const persist = useCallback((
    modes: Record<string, FieldMode>,
    values: Record<string, string>,
    customs: Record<string, string>,
    desc: string,
    locks: Record<string, boolean>,
  ) => {
    try {
      configStore.set('mod-pages', STORAGE_KEY, {
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

  const commitWorld = useCallback((config: WorldConfig) => {
    void (async () => {
      setGamePhase('world_build')
      setWorldName(config.name)

      const configWithModes: WorldConfig = {
        ...config,
        _dimensionModes: buildDimensionModes(fieldModes),
        _dimensionValues: buildDimensionValues(fieldValues, customValues),
      }

      const worldCode = useWorldStore.getState().worldCode
        || useWorldStore.getState().generateAndSetWorldCode()

      const result = await commitWorldInitialization(configWithModes, worldCode)
      const activeConfig = result.config

      setWorldConfig(activeConfig)
      setInitialized(true)

      const { calibration } = useWorldStore.getState()

      orchestrator.setContext(
        {
          name: activeConfig.name,
          description: activeConfig.description,
          era: activeConfig.civilizationStage,
          config: {
            spatialForm: activeConfig.spatialForm,
            essenceTag: activeConfig.essenceTag,
            powerSystemTag: activeConfig.powerSystemTag,
            powerCeiling: activeConfig.powerCeiling,
            civilizationStage: activeConfig.civilizationStage,
            _worldTagsText: result.formattedTags,
            _calibration: calibration,
            _calibrationSummary: calibration ? formatCalibrationSummary(calibration) : '',
            _economyModifier: calibration?.formulas?.economyModifier ?? 1.0,
          },
        },
        { name: '', age: 0, gender: '未设定', background: '', attributes: {} },
      )

      router.push('/new-game/character-create')
    })()
  }, [router, setGamePhase, setWorldName, setWorldConfig, setInitialized, fieldModes, fieldValues, customValues])

  const save = useCallback(() => {
    const draft = resolveWorldConfig(
      baseFields,
      worldDescription,
      coherenceLocks,
      useWorldStore.getState().worldConfig,
    )
    requestCoherenceResolve(draft, commitWorld)
  }, [baseFields, worldDescription, coherenceLocks, requestCoherenceResolve, commitWorld])

  const skip = useCallback(() => {
    router.push('/new-game/world-select')
  }, [router])

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
    conflictModal,
  }
}
