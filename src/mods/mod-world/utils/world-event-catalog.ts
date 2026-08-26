/**
 * Purpose: Own the deterministic world-event catalog and eligibility rules.
 * Owner: mod-world / world-event catalog.
 * Responsibility: Define event entries, labels, strategy weights, and local qualification only.
 */

import type { RegionNarrativeProfile } from '@/foundation'
import type {
  WorldCalibration,
  WorldConfig,
  WorldEventCategory,
  WorldEventCooldownState,
  WorldEventIntensity,
  WorldEventTriggerKind,
  WorldTagsV2,
} from '../types'

export interface WorldEventCatalogInput {
  contextId: string
  regionId?: string
  worldConfig?: WorldConfig | null
  worldTags?: WorldTagsV2 | null
  legacyWorldTags: readonly string[]
  calibration?: WorldCalibration | null
  regionProfile?: RegionNarrativeProfile | null
  roundSequence: number
  storySeed: string
  cooldownState?: WorldEventCooldownState
}
export interface WorldEventCatalogEntry {
  key: string
  category: WorldEventCategory
  title: string
  intensity: WorldEventIntensity
  cooldownRounds: number
  triggerKind: WorldEventTriggerKind
  triggerLabel: string
  isEligible: (input: WorldEventCatalogInput) => boolean
  weight: (input: WorldEventCatalogInput) => number
  buildFact: (input: WorldEventCatalogInput) => string
}
export const CATEGORY_ORDER: readonly WorldEventCategory[] = [
  'environment',
  'social',
  'economic',
  'political',
  'ecological',
  'technology',
  'migration',
  'discovery',
  'hazard',
  'opportunity',
]
export const CATEGORY_LABELS: Record<WorldEventCategory, string> = {
  environment: '环境',
  social: '社会',
  economic: '经济',
  political: '政治',
  ecological: '生态',
  technology: '技术',
  migration: '迁徙',
  discovery: '发现',
  hazard: '风险',
  opportunity: '机遇',
}
export const INTENSITY_LABELS: Record<WorldEventIntensity, string> = {
  minor: '轻微',
  moderate: '中等',
  major: '重大',
}
function normalizeText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().toLocaleLowerCase()
    : ''
}

function signalSet(input: WorldEventCatalogInput): Set<string> {
  const signals = new Set<string>()
  const add = (value: unknown): void => {
    const normalized = normalizeText(value)
    if (normalized) signals.add(normalized)
  }

  add(input.worldTags?.worldview)
  add(input.worldConfig?.essenceTag)
  add(input.worldConfig?.powerSystemTag)
  add(input.worldConfig?.civilizationStage)
  for (const tag of input.legacyWorldTags) add(tag)

  if (input.worldTags) {
    for (const domain of [
      input.worldTags.society,
      input.worldTags.environment,
      input.worldTags.economy,
      input.worldTags.supernatural,
      input.worldTags.demographics,
      input.worldTags.culturalFabric,
    ]) {
      if (domain && typeof domain === 'object') {
        for (const value of Object.values(domain)) add(value)
      }
    }
    const constraints = input.worldTags.constraints
    if (constraints && typeof constraints === 'object') {
      for (const value of constraints.hardForbidden ?? []) add(value)
      for (const value of constraints.softForbidden ?? []) add(value)
    }
  }

  const profile = input.regionProfile
  if (profile) {
    for (const value of [
      profile.summary,
      profile.climate,
      profile.ecology,
      profile.pollution,
      profile.economy,
      profile.population,
      profile.settlement,
      profile.culture,
      profile.education,
      profile.socialStructure,
      profile.factions,
      profile.law,
      ...(Array.isArray(profile.resources) ? profile.resources : []),
    ]) add(value)
  }
  return signals
}

function hasSignal(input: WorldEventCatalogInput, ...needles: string[]): boolean {
  const signals = signalSet(input)
  return needles.some((needle) => {
    const normalized = normalizeText(needle)
    return [...signals].some((signal) => signal.includes(normalized) || normalized.includes(signal))
  })
}

export function getWorldEventModifier(
  input: WorldEventCatalogInput,
  key: keyof NonNullable<WorldCalibration['formulas']>,
): number {
  const value = input.calibration?.formulas?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 1
}

function strategy(input: WorldEventCatalogInput): Exclude<
  NonNullable<WorldCalibration['formulas']>['eventDistributionStrategy'],
  undefined
> {
  return input.calibration?.formulas?.eventDistributionStrategy
    ?? (input.worldConfig?.civilizationStage === 'primitive' || input.worldConfig?.civilizationStage === 'ancient'
      ? 'prehistoric'
      : input.worldConfig?.civilizationStage === 'space'
        ? 'cosmic_epic'
        : input.worldConfig?.essenceTag === 'postApocalyptic' || input.worldConfig?.essenceTag === 'survivalHorror'
          ? 'apocalyptic'
          : input.worldConfig?.essenceTag === 'cultivation' || input.worldConfig?.essenceTag === 'easternFantasy'
            ? 'mystical'
            : input.worldConfig?.essenceTag === 'historical' || input.worldConfig?.essenceTag === 'materialist'
              ? 'political'
              : 'balanced')
}

function strategyWeight(input: WorldEventCatalogInput, category: WorldEventCategory): number {
  const balanced: Record<WorldEventCategory, number> = {
    environment: 1,
    social: 1,
    economic: 1,
    political: 1,
    ecological: 1,
    technology: 1,
    migration: 0.9,
    discovery: 1.1,
    hazard: 0.8,
    opportunity: 1,
  }
  const overrides: Record<string, Partial<Record<WorldEventCategory, number>>> = {
    prehistoric: { environment: 1.5, ecological: 1.5, migration: 1.2, technology: 0.5 },
    political: { political: 1.5, social: 1.3, economic: 1.3, hazard: 0.8 },
    cosmic_epic: { discovery: 1.5, technology: 1.4, migration: 1.3, hazard: 1.2 },
    apocalyptic: { hazard: 1.7, ecological: 1.4, migration: 1.3, economic: 1.2 },
    mystical: { discovery: 1.5, ecological: 1.3, opportunity: 1.3, political: 1.1 },
  }
  return balanced[category] * (overrides[strategy(input)]?.[category] ?? 1)
}

function regionName(input: WorldEventCatalogInput): string {
  return input.regionProfile?.name?.trim() || '当前区域'
}

function currentRegionHasContext(input: WorldEventCatalogInput): boolean {
  return Boolean(input.regionProfile || input.regionId || input.worldTags || input.worldConfig)
}

function hazardEligible(input: WorldEventCatalogInput): boolean {
  const disaster = normalizeText(input.worldTags?.environment.disasterFrequency)
  return getWorldEventModifier(input, 'disasterFrequencyModifier') >= 0.9
    || !['rare', 'none', 'absent'].includes(disaster)
    || hasSignal(input, '灾害', '危险', '荒原', 'hostile', 'wasteland', 'toxic')
}

function migrationEligible(input: WorldEventCatalogInput): boolean {
  const population = normalizeText(input.worldTags?.demographics.populationDensity)
  return getWorldEventModifier(input, 'migrationRateModifier') >= 0.8
    || !['desolate', 'none', 'empty'].includes(population)
    || hasSignal(input, '迁徙', '贸易', 'route', 'global', 'regional', 'dense', 'moderate')
}

function technologyEligible(input: WorldEventCatalogInput): boolean {
  const stage = normalizeText(input.worldConfig?.civilizationStage)
  return getWorldEventModifier(input, 'techProgressModifier') >= 0.8
    || !['primitive', 'ancient'].includes(stage)
    || hasSignal(input, 'technology', 'tech', 'craft', '工艺', '技术', '信息')
}

function ecologicalEligible(input: WorldEventCatalogInput): boolean {
  return currentRegionHasContext(input)
    && (getWorldEventModifier(input, 'ecologyRecoveryModifier') !== 0 || Boolean(input.regionProfile?.ecology))
}

function politicalEligible(input: WorldEventCatalogInput): boolean {
  return currentRegionHasContext(input)
    && (Boolean(input.regionProfile?.factions || input.regionProfile?.law)
      || getWorldEventModifier(input, 'warFrequencyModifier') >= 0.8
      || getWorldEventModifier(input, 'conflictEscalationModifier') >= 0.8)
}

export function isWorldEventEconomicEligible(input: WorldEventCatalogInput): boolean {
  return currentRegionHasContext(input)
    && (Boolean(input.regionProfile?.economy || input.regionProfile?.resources?.length)
      || getWorldEventModifier(input, 'economyModifier') !== 0
      || getWorldEventModifier(input, 'tradeMultiplierModifier') !== 0)
}

export const getWorldEventStrategyWeight = strategyWeight
export const getWorldEventRegionName = regionName
export const isWorldEventContextEligible = currentRegionHasContext
export const isWorldEventHazardEligible = hazardEligible
export const isWorldEventMigrationEligible = migrationEligible
export const isWorldEventTechnologyEligible = technologyEligible
export const isWorldEventEcologicalEligible = ecologicalEligible
export const isWorldEventPoliticalEligible = politicalEligible
