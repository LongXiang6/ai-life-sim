/**
 * Purpose: Clamp raw world-calibration payloads to the canonical runtime contract.
 * Owner: mod-world / world calibration.
 * Responsibility: Input normalization and range enforcement; defaults and summaries are delegated.
 */

import { clamp } from '@/core/shared'
import type {
  EntityCountRange,
  EventDistributionStrategy,
  MapTemplateId,
  WorldCalibration,
  WorldCalibrationFormulas,
  WorldConfig,
} from '../types'
import { ENTITY_GENERATION_COUNTS } from '../constants'
import { clampWorldScale } from './world-scale-calibration'
import {
  buildDefaultCalibration,
  inferMapTemplate,
} from './calibration-clamp/default-calibration'
import {
  FORMULA_KEYS,
  MODIFIER_MAX,
  MODIFIER_MIN,
  clampModifier,
} from './calibration-clamp/modifier-contract'

export {
  buildDefaultCalibration,
  clampModifier,
  FORMULA_KEYS,
  inferMapTemplate,
  MODIFIER_MAX,
  MODIFIER_MIN,
}
export {
  formatCalibrationSummary,
  getWorldviewStyleHint,
} from './calibration-clamp/calibration-summary'

const VALID_STRATEGIES: EventDistributionStrategy[] = [
  'balanced',
  'prehistoric',
  'political',
  'cosmic_epic',
  'apocalyptic',
  'mystical',
]
const VALID_MAP_TEMPLATES: MapTemplateId[] = [
  'continent',
  'archipelago',
  'pangaea',
  'multiContinent',
  'oceanWorld',
  'plane',
  'starSystems',
  'flatDiscWorld',
  'void',
]

function clampEntityRange(
  range: EntityCountRange | undefined,
  defaults: { min: number; max: number },
): EntityCountRange | undefined {
  if (!range) return undefined
  const min = clamp(Math.round(range.min), 0, Infinity)
  const max = Math.max(min, Math.round(range.max))
  return {
    min: Math.min(min, defaults.max),
    max: Math.min(max, defaults.max),
  }
}

function normalizeStrategy(value: unknown): EventDistributionStrategy {
  if (typeof value === 'string' && VALID_STRATEGIES.includes(value as EventDistributionStrategy)) {
    return value as EventDistributionStrategy
  }
  return 'balanced'
}

function normalizeMapTemplate(value: unknown): MapTemplateId | undefined {
  if (typeof value === 'string' && VALID_MAP_TEMPLATES.includes(value as MapTemplateId)) {
    return value as MapTemplateId
  }
  return undefined
}

function clampFormulas(raw: WorldCalibrationFormulas | undefined): WorldCalibrationFormulas | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const nested = raw as WorldCalibrationFormulas & { modifiers?: WorldCalibrationFormulas }
  const flat: WorldCalibrationFormulas = nested.modifiers && typeof nested.modifiers === 'object'
    ? { ...raw, ...nested.modifiers }
    : { ...raw }
  delete (flat as Record<string, unknown>).modifiers

  const result: WorldCalibrationFormulas = {}
  for (const key of FORMULA_KEYS) {
    if (key === 'eventDistributionStrategy') {
      if (flat.eventDistributionStrategy) {
        result.eventDistributionStrategy = normalizeStrategy(flat.eventDistributionStrategy)
      }
      continue
    }
    const value = flat[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      (result as Record<string, number>)[key] = clampModifier(value)
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function clampCalibration(raw: unknown, config: WorldConfig): WorldCalibration {
  const base = buildDefaultCalibration(config)
  if (!raw || typeof raw !== 'object') return base

  const input = raw as WorldCalibration
  const merged: WorldCalibration = {
    metadata: { ...base.metadata, ...(input.metadata ?? {}) },
    styleGuide: input.styleGuide ? { ...base.styleGuide, ...input.styleGuide } : base.styleGuide,
    entities: input.entities,
    world: input.world ? { ...base.world, ...input.world } : base.world,
    scale: clampWorldScale(input.scale, base.scale),
    formulas: { ...base.formulas, ...clampFormulas(input.formulas) },
  }

  const aiFormulaStrategy = input.formulas?.eventDistributionStrategy
  if (aiFormulaStrategy != null) {
    merged.formulas = {
      ...merged.formulas,
      eventDistributionStrategy: normalizeStrategy(aiFormulaStrategy),
    }
  } else if (merged.formulas?.eventDistributionStrategy) {
    merged.formulas.eventDistributionStrategy = normalizeStrategy(merged.formulas.eventDistributionStrategy)
  }
  if (merged.world?.mapTemplate) {
    merged.world.mapTemplate = normalizeMapTemplate(merged.world.mapTemplate) ?? base.world?.mapTemplate
  }
  if (merged.world?.regionCount !== undefined) {
    merged.world.regionCount = Math.max(1, Math.min(30, Math.round(merged.world.regionCount)))
  }
  if (merged.world?.developmentRange) {
    const { min, max } = merged.world.developmentRange
    merged.world.developmentRange = {
      min: clamp(Math.round(min), 0, 100),
      max: clamp(Math.round(max), 0, 100),
    }
    if (merged.world.developmentRange.min > merged.world.developmentRange.max) {
      merged.world.developmentRange.max = merged.world.developmentRange.min
    }
  }
  if (merged.entities) {
    merged.entities = {
      nationCount: clampEntityRange(merged.entities.nationCount, ENTITY_GENERATION_COUNTS.nations),
      factionCount: clampEntityRange(merged.entities.factionCount, ENTITY_GENERATION_COUNTS.factions),
      nobleHouseCount: clampEntityRange(merged.entities.nobleHouseCount, ENTITY_GENERATION_COUNTS.nobleHouses),
      settlementCount: clampEntityRange(merged.entities.settlementCount, ENTITY_GENERATION_COUNTS.settlements),
      tradeRouteCount: clampEntityRange(merged.entities.tradeRouteCount, ENTITY_GENERATION_COUNTS.tradeRoutes),
    }
  }
  return merged
}
