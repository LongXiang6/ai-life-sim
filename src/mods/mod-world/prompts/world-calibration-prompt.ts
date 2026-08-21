/**
 * Purpose: Define the simulation-calibration contract used by the combined world-init Prompt.
 * Owner: mod-world / world-init.
 * Responsibility: Calibration semantics and Schema only; transport and coordination stay outside.
 */

import { z } from 'zod'

const modifierSchema = z.coerce.number().min(0.01).max(100).optional()
const decimalQuantitySchema = z.string().regex(/^(0|[1-9]\d*)$/).optional()

const rangeSchema = z.object({
  min: z.coerce.number().int().min(0),
  max: z.coerce.number().int().min(0),
}).refine((value) => value.min <= value.max)

const eventDistributionStrategySchema = z.enum([
  'balanced', 'prehistoric', 'political', 'cosmic_epic', 'apocalyptic', 'mystical',
])

const mapTemplateSchema = z.enum([
  'continent', 'archipelago', 'pangaea', 'multiContinent', 'oceanWorld',
  'plane', 'starSystems', 'flatDiscWorld', 'void',
])

export const worldCalibrationOutputSchema = z.object({
  metadata: z.object({
    essenceTag: z.string(),
    civilizationStage: z.string(),
    powerSystemTag: z.string(),
    spatialForm: z.string(),
    difficulty: z.enum(['normal', 'hard', 'nightmare', 'hell']).optional(),
  }).optional(),
  styleGuide: z.object({
    worldviewStyleHint: z.string().optional(),
    narrativeTone: z.string().optional(),
    eventTypeWeights: z.record(z.string(), z.coerce.number().min(0)).optional(),
  }).optional(),
  timeline: z.object({
    eraStartYear: z.coerce.number().int().optional(),
    stageSpan: z.coerce.number().int().positive().optional(),
  }).optional(),
  entities: z.object({
    nationCount: rangeSchema.optional(),
    factionCount: rangeSchema.optional(),
    nobleHouseCount: rangeSchema.optional(),
    settlementCount: rangeSchema.optional(),
    tradeRouteCount: rangeSchema.optional(),
  }).optional(),
  world: z.object({
    developmentRange: z.object({ min: z.coerce.number(), max: z.coerce.number() }).optional(),
    mapTemplate: mapTemplateSchema.optional(),
    regionCount: z.coerce.number().int().min(1).max(30).optional(),
  }).optional(),
  scale: z.object({
    populationTotal: decimalQuantitySchema,
    populationCarryingCapacity: decimalQuantitySchema,
    annualBirthsPerMillion: z.coerce.number().int().min(0).max(1_000_000).optional(),
    annualDeathsPerMillion: z.coerce.number().int().min(0).max(1_000_000).optional(),
    annualNetMigrationPerMillion: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional(),
    urbanizationBasisPoints: z.coerce.number().int().min(0).max(10_000).optional(),
    literacyBasisPoints: z.coerce.number().int().min(0).max(10_000).optional(),
    monetaryMode: z.enum(['none', 'reciprocity', 'barter', 'commodity', 'currency', 'post-scarcity']).optional(),
    annualEconomicOutput: decimalQuantitySchema,
    moneySupply: decimalQuantitySchema,
    subsistenceIncomePerCapita: decimalQuantitySchema,
    priceIndexBasisPoints: z.coerce.number().int().min(1).max(1_000_000).optional(),
    annualInflationPerMillion: z.coerce.number().int().min(-900_000).max(1_000_000).optional(),
    industrialProductivityBasisPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),
    resourceDemandBasisPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),
    pollutionPressureBasisPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),
  }).optional(),
  formulas: z.object({
    populationModifier: modifierSchema,
    developmentModifier: modifierSchema,
    impactRangeModifier: modifierSchema,
    birthRateModifier: modifierSchema,
    fertilityModifier: modifierSchema,
    deathRateModifier: modifierSchema,
    inflationModifier: modifierSchema,
    tradeMultiplierModifier: modifierSchema,
    vitalityRecoveryModifier: modifierSchema,
    staminaRecoveryModifier: modifierSchema,
    spiritRecoveryModifier: modifierSchema,
    conditionProgressionModifier: modifierSchema,
    lifespanModifier: modifierSchema,
    cultivationSpeedModifier: modifierSchema,
    bottleneckModifier: modifierSchema,
    monsterThreatModifier: modifierSchema,
    monsterSpawnModifier: modifierSchema,
    luckPointModifier: modifierSchema,
    socialMobilityModifier: modifierSchema,
    factionEmergenceModifier: modifierSchema,
    warFrequencyModifier: modifierSchema,
    warDamageModifier: modifierSchema,
    legalEnforcementModifier: modifierSchema,
    ecologyRecoveryModifier: modifierSchema,
    pollutionDecayModifier: modifierSchema,
    resourceConsumptionModifier: modifierSchema,
    disasterFrequencyModifier: modifierSchema,
    techProgressModifier: modifierSchema,
    techBreakthroughModifier: modifierSchema,
    industryProductivityModifier: modifierSchema,
    economyModifier: modifierSchema,
    eventDistributionStrategy: eventDistributionStrategySchema.optional(),
    migrationRateModifier: modifierSchema,
    literacyGrowthModifier: modifierSchema,
    incomeModifier: modifierSchema,
    conflictEscalationModifier: modifierSchema,
    devotionGainModifier: modifierSchema,
    causalCaptureRate: modifierSchema,
  }).optional(),
}).passthrough()

export const WORLD_CALIBRATION_PROMPT_CONTRACT = {
  responsibility: '只把已确定的世界维度与描述投影为模拟校准参数。',
  sections: {
    metadata: '原样投影当前维度标识与难度。',
    styleGuide: '概括当前世界的叙事语域与事件权重。',
    timeline: '确定年代锚点与阶段跨度。',
    entities: '给出当前世界实际存在的宏观实体数量范围。',
    world: '给出地图模板、区域数量与开发度范围。',
    scale: '用字段声明的单位表达人口、经济、教育、城市化、产业、资源与污染数量级。',
    formulas: '只表达相对于 1.0 默认值的显著模拟倾向，并唯一承载事件分布策略。',
  },
  rules: [
    '世界描述与输入中已确定的维度共同构成校准事实。',
    'calibration 使用稀疏对象，只填写当前世界需要的字段和相对默认值偏离至少 20% 的 modifier。',
    '人口与经济大整数使用不含分隔符的十进制字符串，比例和年率使用字段声明的基点或每百万单位。',
    '当前世界没有对应模拟层时，该层实体数量范围写为 0；其余层按完整上下文确定规模。',
    '角色状态倾向、世界区域背景和叙事冲突倾向各自写入所属 modifier，一项事实只映射到最直接的字段。',
  ],
  output: 'calibration 为符合既定 Schema 的稀疏 JSON 对象。',
} as const
