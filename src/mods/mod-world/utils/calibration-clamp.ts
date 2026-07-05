/**
 * @module calibration-clamp.ts
 * @description 世界校准校验 —— Zod parse 后 clamp + 规则默认 + 摘要格式化
 * @mod mod-world
 */

// 统一使用 shared/ 的 clamp 替代内联 Math.max/Math.min
import { clamp } from '@/core/shared'
import type {
  WorldConfig,
  WorldCalibration,
  WorldCalibrationFormulas,
  EventDistributionStrategy,
  MapTemplateId,
  EntityCountRange,
} from '../types'

import { ENTITY_GENERATION_COUNTS, WORLDVIEW_STYLE_HINTS } from '../constants'
import { shouldUseGenericSimulationPools } from './world-pool-selectors'

export const MODIFIER_MIN = 0.01
export const MODIFIER_MAX = 100

export const DEFAULT_ECONOMY_TIER_RATIOS: [number, number, number, number, number] = [
  0.25, 0.45, 0.65, 0.85, 1.0,
]

const VALID_STRATEGIES: EventDistributionStrategy[] = [
  'balanced', 'prehistoric', 'political', 'cosmic_epic', 'apocalyptic', 'mystical',
]

const VALID_MAP_TEMPLATES: MapTemplateId[] = [
  'continent', 'archipelago', 'pangaea', 'multiContinent', 'oceanWorld',
  'plane', 'starSystems', 'flatDiscWorld', 'void',
]

const CIV_POPULATION_BASE: Record<string, number> = {
  primitive: 50,
  ancient: 200,
  medieval: 1000,
  renaissance: 3000,
  industrial: 10000,
  modern: 50000,
  information: 100000,
  space: 500000,
}

/** L2 公式字段全集（审计 / 文档用） */
export const FORMULA_KEYS: (keyof WorldCalibrationFormulas)[] = [
  'populationModifier', 'developmentModifier', 'impactRangeModifier',
  'birthRateModifier', 'fertilityModifier', 'deathRateModifier', 'inflationModifier', 'tradeMultiplierModifier',
  'hpRecoveryModifier', 'staminaRecoveryModifier', 'lifespanModifier', 'attributeDecayModifier',
  'breakthroughChanceModifier', 'cultivationSpeedModifier', 'bottleneckModifier',
  'monsterThreatModifier', 'monsterSpawnModifier', 'luckPointModifier',
  'socialMobilityModifier', 'factionEmergenceModifier', 'warFrequencyModifier',
  'warDamageModifier', 'legalEnforcementModifier', 'ecologyRecoveryModifier',
  'pollutionDecayModifier', 'resourceConsumptionModifier', 'disasterFrequencyModifier',
  'techProgressModifier', 'techBreakthroughModifier', 'industryProductivityModifier',
  'economyModifier', 'crossDomainEffectModifier', 'eventDistributionStrategy',
  'migrationRateModifier', 'literacyGrowthModifier', 'incomeModifier',
  'conflictEscalationModifier', 'devotionGainModifier', 'causalCaptureRate',
]



export function clampModifier(value: number): number {
  if (!Number.isFinite(value)) return 1.0
  return Math.min(MODIFIER_MAX, Math.max(MODIFIER_MIN, value))
}

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

function normalizeEconomyTierRatios(
  ratios: unknown,
): [number, number, number, number, number] | undefined {
  if (!Array.isArray(ratios) || ratios.length !== 5) return undefined
  const nums = ratios.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN))
  if (nums.some((n) => Number.isNaN(n))) return undefined
  const sorted = [...nums].sort((a, b) => a - b)
  if (sorted[4]! > 1.0 + 0.001) return undefined
  for (let i = 1; i < 5; i++) {
    if (sorted[i]! <= sorted[i - 1]!) return undefined
  }
  return sorted as [number, number, number, number, number]
}

function clampFormulas(raw: WorldCalibrationFormulas | undefined): WorldCalibrationFormulas | undefined {
  if (!raw || typeof raw !== 'object') return undefined

  // AI 有时将 modifier 嵌套在 formulas.modifiers 下，先展平
  const nested = raw as WorldCalibrationFormulas & { modifiers?: WorldCalibrationFormulas }
  const flat: WorldCalibrationFormulas = nested.modifiers && typeof nested.modifiers === 'object'
    ? { ...raw, ...nested.modifiers }
    : { ...raw }
  delete (flat as Record<string, unknown>).modifiers

  const out: WorldCalibrationFormulas = {}

  for (const key of FORMULA_KEYS) {
    if (key === 'eventDistributionStrategy') {
      if (flat.eventDistributionStrategy) {
        out.eventDistributionStrategy = normalizeStrategy(flat.eventDistributionStrategy)
      }
      continue
    }
    const val = flat[key]
    if (typeof val === 'number' && Number.isFinite(val)) {
      (out as Record<string, number>)[key] = clampModifier(val)
    }
  }

  const ratios = normalizeEconomyTierRatios(flat.economyTierRatios)
  if (ratios) out.economyTierRatios = ratios

  return Object.keys(out).length > 0 ? out : undefined
}

/** 根据 WorldConfig 生成规则默认校准（无 AI 时使用） */
export function buildDefaultCalibration(config: WorldConfig): WorldCalibration {
  const strategy = inferStrategy(config)
  const formulas: WorldCalibrationFormulas = {
    eventDistributionStrategy: strategy,
  }

  if (config.civilizationStage === 'primitive') {
    formulas.populationModifier = 0.6
    formulas.techProgressModifier = 0.3
    formulas.birthRateModifier = 0.75
    formulas.socialMobilityModifier = 1.2
    formulas.migrationRateModifier = 0.6
    formulas.literacyGrowthModifier = 0.5
    formulas.conflictEscalationModifier = 0.5
  } else if (config.civilizationStage === 'space') {
    formulas.populationModifier = 1.5
    formulas.techProgressModifier = 2.5
    formulas.industryProductivityModifier = 2.0
    formulas.migrationRateModifier = 1.4
  } else if (
    config.civilizationStage === 'industrial'
    || config.civilizationStage === 'modern'
    || config.civilizationStage === 'information'
  ) {
    formulas.literacyGrowthModifier = 1.2
    formulas.migrationRateModifier = 1.2
    formulas.incomeModifier = 1.15
  }

  if (config.essenceTag === 'postApocalyptic' || config.essenceTag === 'survivalHorror') {
    formulas.eventDistributionStrategy = 'apocalyptic'
    formulas.birthRateModifier = 0.65
    formulas.deathRateModifier = 1.8
    formulas.monsterThreatModifier = 2.5
    formulas.hpRecoveryModifier = 0.5
    formulas.disasterFrequencyModifier = 2.0
    formulas.resourceConsumptionModifier = 1.5
    formulas.incomeModifier = 0.6
  }
  if (config.essenceTag === 'postApocalyptic') {
    formulas.fertilityModifier = 0.7
  } else if (config.essenceTag === 'cultivation' || config.essenceTag === 'easternFantasy') {
    formulas.eventDistributionStrategy = 'mystical'
    formulas.cultivationSpeedModifier = 2.0
    formulas.bottleneckModifier = 1.3
    formulas.lifespanModifier = 1.5
    formulas.socialMobilityModifier = 0.7
  } else if (config.essenceTag === 'scifi') {
    formulas.techProgressModifier = Math.max(formulas.techProgressModifier ?? 1, 2.0)
    formulas.techBreakthroughModifier = 1.5
  } else if (config.essenceTag === 'historical' || config.essenceTag === 'materialist') {
    if (strategy !== 'prehistoric') {
      formulas.eventDistributionStrategy = 'political'
      formulas.conflictEscalationModifier = 1.25
    }
    formulas.cultivationSpeedModifier = 0.2
  } else if (config.essenceTag === 'wuxia') {
    formulas.conflictEscalationModifier = 1.4
  }

  if (config.powerSystemTag === 'faith') {
    formulas.devotionGainModifier = 1.4
  }
  if (config.essenceTag === 'mythological' || config.essenceTag === 'lovecraftian') {
    formulas.devotionGainModifier = clampModifier((formulas.devotionGainModifier ?? 1) * 1.2)
    formulas.causalCaptureRate = 1.35
  } else if (strategy === 'prehistoric') {
    formulas.causalCaptureRate = 0.6
  } else if (config.essenceTag === 'historical' || config.essenceTag === 'materialist') {
    formulas.causalCaptureRate = 1.2
  }

  if (config.difficulty === 'hard') {
    formulas.disasterFrequencyModifier = clampModifier((formulas.disasterFrequencyModifier ?? 1) * 1.2)
  } else if (config.difficulty === 'nightmare') {
    formulas.hpRecoveryModifier = clampModifier((formulas.hpRecoveryModifier ?? 1) * 0.7)
    formulas.monsterThreatModifier = clampModifier((formulas.monsterThreatModifier ?? 1) * 1.4)
  } else if (config.difficulty === 'hell') {
    formulas.hpRecoveryModifier = 0.4
    formulas.deathRateModifier = clampModifier((formulas.deathRateModifier ?? 1) * 1.5)
    formulas.monsterThreatModifier = 2.0
  }

  let populationBase = CIV_POPULATION_BASE[config.civilizationStage]
  if (config.essenceTag === 'postApocalyptic' || config.essenceTag === 'survivalHorror') {
    populationBase = Math.min(populationBase ?? 500, 500)
  }

  return {
    metadata: {
      essenceTag: config.essenceTag,
      civilizationStage: config.civilizationStage,
      powerSystemTag: config.powerSystemTag,
      spatialForm: config.spatialForm,
      difficulty: config.difficulty,
    },
    styleGuide: {
      worldviewStyleHint: shouldUseGenericSimulationPools()
        ? undefined
        : (WORLDVIEW_STYLE_HINTS[config.essenceTag] ?? undefined),
    },
    world: {
      populationBase,
      mapTemplate: inferMapTemplate(config),
    },
    formulas,
  }
}

function inferStrategy(config: WorldConfig): EventDistributionStrategy {
  if (config.civilizationStage === 'primitive' || config.civilizationStage === 'ancient') {
    return 'prehistoric'
  }
  if (config.essenceTag === 'postApocalyptic' || config.essenceTag === 'survivalHorror') {
    return 'apocalyptic'
  }
  if (config.essenceTag === 'cultivation' || config.essenceTag === 'easternFantasy') {
    return 'mystical'
  }
  if (config.essenceTag === 'historical' || config.essenceTag === 'materialist') {
    return 'political'
  }
  if (config.civilizationStage === 'space') {
    return 'cosmic_epic'
  }
  return 'balanced'
}

export function inferMapTemplate(config: WorldConfig): MapTemplateId {
  if (config.civilizationStage === 'space') return 'starSystems'
  if (config.spatialForm === 'plane') return 'plane'
  if (config.essenceTag === 'cultivation' || config.essenceTag === 'easternFantasy' || config.essenceTag === 'wuxia') {
    return 'flatDiscWorld'
  }
  if (config.essenceTag === 'lovecraftian' || config.essenceTag === 'survivalHorror') {
    return 'void'
  }
  return 'continent'
}

/** AI / 原始 JSON 校验并 clamp */
export function clampCalibration(
  raw: unknown,
  config: WorldConfig,
): WorldCalibration {
  const base = buildDefaultCalibration(config)
  if (!raw || typeof raw !== 'object') return base

  const input = raw as WorldCalibration
  const merged: WorldCalibration = {
    metadata: {
      ...base.metadata,
      ...(input.metadata ?? {}),
    },
    styleGuide: input.styleGuide ? { ...base.styleGuide, ...input.styleGuide } : base.styleGuide,
    entities: input.entities,
    world: input.world ? { ...base.world, ...input.world } : base.world,
    formulas: {
      ...base.formulas,
      ...clampFormulas(input.formulas),
    },
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
  if (merged.world?.populationBase !== undefined) {
    merged.world.populationBase = Math.max(1, Math.round(merged.world.populationBase))
  }
  if (merged.world?.regionCount !== undefined) {
    merged.world.regionCount = Math.max(1, Math.min(30, Math.round(merged.world.regionCount)))
  }
  if (merged.world?.developmentRange) {
    const { min, max } = merged.world.developmentRange
    merged.world.developmentRange = {
      // 校准值四舍五入后限制在 [0, 100]
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

/** 优先 calibration.styleGuide，fallback essence 常量 */
export function getWorldviewStyleHint(
  cal: WorldCalibration | null | undefined,
  essenceTag: string,
): string {
  const fromCal = cal?.styleGuide?.worldviewStyleHint?.trim()
  if (fromCal) return fromCal
  if (shouldUseGenericSimulationPools()) return ''
  return WORLDVIEW_STYLE_HINTS[essenceTag] ?? ''
}

const SUMMARY_DEVIATION_RATIO = 0.2
const SUMMARY_MAX_LEN = 150

/** 高感知 modifier 摘要标签（顺序优先，超长时截断保留前列） */
const SUMMARY_MODIFIER_LABELS: Partial<Record<keyof WorldCalibrationFormulas, string>> = {
  eventDistributionStrategy: '事件策略',
  cultivationSpeedModifier: '修炼速度',
  bottleneckModifier: '修炼瓶颈',
  techProgressModifier: '科技进度',
  monsterThreatModifier: '怪物威胁',
  birthRateModifier: '人口生育',
  fertilityModifier: '家族生育',
  deathRateModifier: '死亡率',
  warFrequencyModifier: '战争频率',
  hpRecoveryModifier: '生命恢复',
  incomeModifier: '职业收入',
  disasterFrequencyModifier: '灾难频率',
  inflationModifier: '通胀',
  socialMobilityModifier: '阶层流动',
  luckPointModifier: '气运',
  devotionGainModifier: '信仰虔诚',
  conflictEscalationModifier: '冲突节奏',
  migrationRateModifier: '人口迁移',
  literacyGrowthModifier: '识字增长',
  economyModifier: '宏观经济',
  resourceConsumptionModifier: '资源消耗',
}

function modifierDeviatesFromDefault(value: number, defaultValue = 1): boolean {
  if (!Number.isFinite(value)) return false
  return Math.abs(value - defaultValue) / defaultValue >= SUMMARY_DEVIATION_RATIO
}

function formatModifierForSummary(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

/** 供后续 AI Prompt 注入的简短摘要（稀疏：仅偏离默认 ±20% 的项，≤150 字） */
export function formatCalibrationSummary(cal: WorldCalibration): string {
  const parts: string[] = []
  const f = cal.formulas

  const strategy = f?.eventDistributionStrategy
  if (strategy && strategy !== 'balanced') {
    parts.push(`事件策略=${strategy}`)
  }
  if (cal.world?.populationBase) {
    parts.push(`人口基数=${cal.world.populationBase}`)
  }

  if (f) {
    for (const key of FORMULA_KEYS) {
      if (key === 'eventDistributionStrategy' || key === 'economyTierRatios') continue
      const label = SUMMARY_MODIFIER_LABELS[key]
      if (!label) continue
      const val = f[key]
      if (typeof val === 'number' && modifierDeviatesFromDefault(val)) {
        parts.push(`${label}×${formatModifierForSummary(val)}`)
      }
    }
  }

  if (parts.length === 0) return '默认校准'
  const joined = parts.join('；')
  if (joined.length <= SUMMARY_MAX_LEN) return joined
  return `${joined.slice(0, SUMMARY_MAX_LEN - 1)}…`
}
