/**
 * @module calibration-clamp.ts
 * @description 世界校准校验 —— Zod parse 后 clamp + 规则默认 + 摘要格式化
 * @mod mod-world
 */

// 统一使用 shared/ 的 clamp 替代内联 Math.max/Math.min
import { clamp } from '@/core/shared'
import {
  formatChineseMagnitude,
} from '@/foundation'
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
import { buildDefaultWorldScale, clampWorldScale } from './world-scale-calibration'

export const MODIFIER_MIN = 0.01
export const MODIFIER_MAX = 100

const VALID_STRATEGIES: EventDistributionStrategy[] = [
  'balanced', 'prehistoric', 'political', 'cosmic_epic', 'apocalyptic', 'mystical',
]

const VALID_MAP_TEMPLATES: MapTemplateId[] = [
  'continent', 'archipelago', 'pangaea', 'multiContinent', 'oceanWorld',
  'plane', 'starSystems', 'flatDiscWorld', 'void',
]

/** L2 公式字段全集（审计 / 文档用） */
export const FORMULA_KEYS: (keyof WorldCalibrationFormulas)[] = [
  'populationModifier', 'developmentModifier', 'impactRangeModifier',
  'birthRateModifier', 'fertilityModifier', 'deathRateModifier', 'inflationModifier', 'tradeMultiplierModifier',
  'vitalityRecoveryModifier', 'staminaRecoveryModifier', 'spiritRecoveryModifier',
  'conditionProgressionModifier', 'lifespanModifier',
  'cultivationSpeedModifier', 'bottleneckModifier',
  'monsterThreatModifier', 'monsterSpawnModifier', 'luckPointModifier',
  'socialMobilityModifier', 'factionEmergenceModifier', 'warFrequencyModifier',
  'warDamageModifier', 'legalEnforcementModifier', 'ecologyRecoveryModifier',
  'pollutionDecayModifier', 'resourceConsumptionModifier', 'disasterFrequencyModifier',
  'techProgressModifier', 'techBreakthroughModifier', 'industryProductivityModifier',
  'economyModifier', 'eventDistributionStrategy',
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

  return Object.keys(out).length > 0 ? out : undefined
}

/** 根据 WorldConfig 生成规则默认校准（无 AI 时使用） */
export function buildDefaultCalibration(config: WorldConfig): WorldCalibration {
  const strategy = inferStrategy(config)
  const formulas: WorldCalibrationFormulas = {
    eventDistributionStrategy: strategy,
  }

  if (config.civilizationStage === 'primitive') {
    formulas.techProgressModifier = 0.3
    formulas.birthRateModifier = 0.75
    formulas.socialMobilityModifier = 1.2
    formulas.migrationRateModifier = 0.6
    formulas.literacyGrowthModifier = 0.5
    formulas.conflictEscalationModifier = 0.5
  } else if (config.civilizationStage === 'space') {
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
    formulas.vitalityRecoveryModifier = 0.5
    formulas.conditionProgressionModifier = 1.5
    formulas.disasterFrequencyModifier = 2.0
    formulas.resourceConsumptionModifier = 1.5
    formulas.incomeModifier = 0.6
    formulas.populationModifier = 0.01
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
    formulas.vitalityRecoveryModifier = clampModifier((formulas.vitalityRecoveryModifier ?? 1) * 0.7)
    formulas.spiritRecoveryModifier = clampModifier((formulas.spiritRecoveryModifier ?? 1) * 0.8)
    formulas.conditionProgressionModifier = clampModifier((formulas.conditionProgressionModifier ?? 1) * 1.2)
    formulas.monsterThreatModifier = clampModifier((formulas.monsterThreatModifier ?? 1) * 1.4)
  } else if (config.difficulty === 'hell') {
    formulas.vitalityRecoveryModifier = 0.4
    formulas.staminaRecoveryModifier = 0.7
    formulas.spiritRecoveryModifier = 0.6
    formulas.conditionProgressionModifier = 1.5
    formulas.deathRateModifier = clampModifier((formulas.deathRateModifier ?? 1) * 1.5)
    formulas.monsterThreatModifier = 2.0
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
      mapTemplate: inferMapTemplate(config),
    },
    scale: buildDefaultWorldScale(config),
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
    scale: clampWorldScale(input.scale, base.scale),
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

/** 高感知 modifier 摘要标签。 */
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
  vitalityRecoveryModifier: '生命恢复',
  staminaRecoveryModifier: '体力恢复',
  spiritRecoveryModifier: '精神恢复',
  conditionProgressionModifier: '伤病进展',
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

/** 供后续 AI Prompt 注入的语义摘要（稀疏：仅偏离默认 ±20% 的项）。 */
export function formatCalibrationSummary(cal: WorldCalibration): string {
  const parts: string[] = []
  const f = cal.formulas

  const strategy = f?.eventDistributionStrategy
  if (strategy && strategy !== 'balanced') {
    const strategyLabels: Record<string, string> = {
      prehistoric: '史前生存',
      political: '政治博弈',
      cosmic_epic: '宇宙史诗',
      apocalyptic: '灾变求生',
      mystical: '神秘演进',
    }
    parts.push(`事件策略=${strategyLabels[strategy] ?? '按世界设定分布'}`)
  }
  parts.push(`人口=${formatChineseMagnitude(cal.scale.populationTotal)}`)

  if (f) {
    for (const key of FORMULA_KEYS) {
      if (key === 'eventDistributionStrategy') continue
      const label = SUMMARY_MODIFIER_LABELS[key]
      if (!label) continue
      const val = f[key]
      if (typeof val === 'number' && modifierDeviatesFromDefault(val)) {
        parts.push(`${label}×${formatModifierForSummary(val)}`)
      }
    }
  }

  if (parts.length === 0) return '默认校准'
  return parts.join('；')
}
