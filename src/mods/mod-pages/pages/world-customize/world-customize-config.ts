/**
 * Purpose: Translate world-customization fields into the public world configuration contract.
 * Owner: mod-pages/world-customize
 * Responsibility: Pure draft normalization and WorldConfig assembly only.
 */

import {
  buildCoherenceLocksFromUi,
  COHERENCE_LOCK_FIELD_MAP,
  createDefaultPowerFramework,
  mapPowerSystemZhToTag,
  mapWorldviewEssenceZhToTag,
  SPATIAL_FORM_ZH_MAP,
} from '@/mods/mod-world'
import type { WorldConfig } from '@/mods/mod-world'

import type { EditableField, FieldMode } from './world-customize.types'

const DIMENSION_FIELD_KEYS = [
  'universeScale',
  'worldviewEssence',
  'powerSystem',
  'powerFramework',
] as const

const COHERENCE_LOCKABLE_KEYS = new Set(Object.keys(COHERENCE_LOCK_FIELD_MAP))

export interface SavedFieldsState {
  worldCode?: number
  worldName?: string
  fieldModes: Record<string, FieldMode>
  fieldValues: Record<string, string>
  customValues: Record<string, string>
  worldDescription?: string
  coherenceLocks?: Record<string, boolean>
}

export function normalizeFieldMode(mode: unknown): FieldMode {
  if (mode === 'custom') return 'custom'
  if (mode === 'adaptive') return 'adaptive'
  return 'ai'
}

export function buildDimensionModes(fieldModes: Record<string, FieldMode>): Record<string, FieldMode> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((key) => [key, normalizeFieldMode(fieldModes[key])]),
  )
}

export function buildDimensionValues(
  fieldModes: Record<string, FieldMode>,
  fieldValues: Record<string, string>,
  customValues: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((key) => {
      const mode = normalizeFieldMode(fieldModes[key])
      if (mode === 'custom') return [key, customValues[key] || '']
      if (mode === 'adaptive') return [key, fieldValues[key] || '']
      return [key, '']
    }),
  )
}

export function isCoherenceLockable(fieldKey: string): boolean {
  return COHERENCE_LOCKABLE_KEYS.has(fieldKey)
}

function buildActiveCoherenceLocks(coherenceLocks: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(
    DIMENSION_FIELD_KEYS.map((key) => [key, coherenceLocks[key] === true]),
  )
}

export function resolveWorldConfig(
  baseFields: EditableField[],
  worldDescription: string,
  coherenceLocks: Record<string, boolean>,
  existingConfig?: WorldConfig | null,
): WorldConfig {
  const getEffectiveValue = (key: string): string => {
    const field = baseFields.find((candidate) => candidate.key === key)
    if (!field) return ''
    if (field.mode === 'custom' && field.customValue) return field.customValue
    if (field.mode === 'adaptive' && field.playerValue) return field.playerValue
    return ''
  }

  const powerSystemValue = getEffectiveValue('powerSystem')
  const worldviewValue = getEffectiveValue('worldviewEssence')
  const powerSystemTag = powerSystemValue
    ? mapPowerSystemZhToTag(powerSystemValue)
    : existingConfig?.powerSystemTag ?? 'none'
  const essenceTag = worldviewValue
    ? mapWorldviewEssenceZhToTag(worldviewValue)
    : existingConfig?.essenceTag ?? 'modern'
  const powerFrameworkValue = getEffectiveValue('powerFramework')
  const progression = powerFrameworkValue.includes('开放')
    ? 'open' as const
    : existingConfig?.powerFramework?.progression ?? 'bounded'
  const spatialValue = getEffectiveValue('universeScale')
  const spatialForm = spatialValue
    ? SPATIAL_FORM_ZH_MAP[spatialValue] ?? 'plane'
    : existingConfig?.spatialForm ?? 'plane'
  const trimmedDescription = worldDescription.trim()
  const hasExistingDescription = existingConfig?.description
    && !/^.+世界观 · .+空间形态$/.test(existingConfig.description)
  const description = trimmedDescription
    || (hasExistingDescription ? existingConfig.description : '')
    || `${powerSystemValue || powerSystemTag} 世界观 · ${spatialValue || spatialForm} 空间形态`
  const hasExistingName = existingConfig?.name && existingConfig.name !== '自定义世界'

  return {
    name: hasExistingName ? existingConfig.name : '自定义世界',
    spatialForm,
    essenceTag,
    powerSystemTag,
    powerFramework: createDefaultPowerFramework(powerSystemTag, {
      progression,
      source: 'world-custom',
      label: baseFields.find((field) => field.key === 'powerFramework')?.mode === 'custom' && powerFrameworkValue
        ? powerFrameworkValue
        : undefined,
    }),
    civilizationStage: existingConfig?.civilizationStage ?? 'medieval',
    difficulty: existingConfig?.difficulty ?? 'normal',
    worldType: existingConfig?.worldType,
    description,
    _aiFlags: Object.fromEntries(
      DIMENSION_FIELD_KEYS.map((key) => [key, baseFields.find((field) => field.key === key)?.mode === 'ai']),
    ),
    _coherenceLocks: buildCoherenceLocksFromUi(buildActiveCoherenceLocks(coherenceLocks)),
  }
}
