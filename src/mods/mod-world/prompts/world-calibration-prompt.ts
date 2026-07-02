/**
 * @module world-calibration-prompt.ts
 * @description 世界模拟校准 Prompt（稀疏 calibration + W02 + worldTags）
 *
 * Pipeline 主路径已并入 world-dimension-calibration-prompt（维度+校准单次调用）。
 * 本 Prompt 仅用于：缓存命中但缺 aiDetailedParameters 时的 calibration-fallback。
 * 勿恢复为与维度推断并列的独立主路径步骤。
 * @mod mod-world
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import { worldConfigOutputSchema } from './world-config-prompt'

const modifierSchema = z.coerce.number().min(0.01).max(100).optional()

const rangeSchema = z.object({
  min: z.coerce.number().int().min(0),
  max: z.coerce.number().int().min(0),
}).refine((d) => d.min <= d.max)

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
    worldviewStyleHint: z.string().max(200).optional(),
    narrativeTone: z.string().max(50).optional(),
    eventTypeWeights: z.record(z.string(), z.coerce.number().min(0)).optional(),
  }).optional(),
  timeline: z.object({
    eraStartYear: z.coerce.number().int().optional(),
    stageSpan: z.coerce.number().int().positive().optional(),
    impactDistribution: eventDistributionStrategySchema.optional(),
  }).optional(),
  entities: z.object({
    nationCount: rangeSchema.optional(),
    factionCount: rangeSchema.optional(),
    nobleHouseCount: rangeSchema.optional(),
    settlementCount: rangeSchema.optional(),
    tradeRouteCount: rangeSchema.optional(),
  }).optional(),
  world: z.object({
    populationBase: z.coerce.number().int().positive().optional(),
    developmentRange: z.object({ min: z.coerce.number(), max: z.coerce.number() }).optional(),
    mapTemplate: mapTemplateSchema.optional(),
    regionCount: z.coerce.number().int().min(1).max(30).optional(),
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
    hpRecoveryModifier: modifierSchema,
    staminaRecoveryModifier: modifierSchema,
    lifespanModifier: modifierSchema,
    attributeDecayModifier: modifierSchema,
    breakthroughChanceModifier: modifierSchema,
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
    economyTierRatios: z.tuple([
      z.coerce.number().min(0).max(1),
      z.coerce.number().min(0).max(1),
      z.coerce.number().min(0).max(1),
      z.coerce.number().min(0).max(1),
      z.coerce.number().min(0).max(1),
    ]).optional(),
    crossDomainEffectModifier: modifierSchema,
    eventDistributionStrategy: eventDistributionStrategySchema.optional(),
    migrationRateModifier: modifierSchema,
    literacyGrowthModifier: modifierSchema,
    incomeModifier: modifierSchema,
    conflictEscalationModifier: modifierSchema,
    devotionGainModifier: modifierSchema,
    causalCaptureRate: modifierSchema,
  }).optional(),
}).passthrough()

/** 校准 + W02 详细参数合并输出 */
export const worldCalibrationBundleOutputSchema = z.object({
  calibration: worldCalibrationOutputSchema,
  aiDetailedParameters: worldConfigOutputSchema.optional(),
  worldTags: z.array(z.string()).min(3).max(12).optional(),
})

export type WorldCalibrationBundleOutput = z.infer<typeof worldCalibrationBundleOutputSchema>

export const worldCalibrationPrompt: PromptTemplate = {
  name: 'world-calibration',
  version: '1.0.0',
  mod: 'mod-world',

  systemPrompt: stringifyPrompt({
    role: '世界模拟校准 AI',
    task: '根据 WorldConfig、世界描述与用户维度选择，输出合并 JSON：calibration（稀疏）+ aiDetailedParameters（W02 全字段）+ worldTags（5-8 个氛围标签）。AI决定模式的维度可自行判定最适值',
    outputFormat: '纯 JSON 对象 { calibration, aiDetailedParameters, worldTags }；calibration 稀疏，aiDetailedParameters 全字段必填，worldTags 为字符串数组',
    constraints: [
      '顶层必须含 calibration 与 aiDetailedParameters 两个字段',
      '同时输出 worldTags：5-8 个描述性标签字符串数组，须与 worldDescription 一致，禁止与描述矛盾',
      '严格使用 camelCase 字段名，禁止自造字段',
      '禁止 markdown 代码块、禁止解释文字、禁止占位符',
      '先阅读 dimensionChoices，了解用户对每个维度的决定权：AI决定模式下可自由调整该维度的值',
      'AI决定模式的 powerCeiling：根据 powerCeilingPresets 表，分析 worldDescription 中的战力层级，映射到最匹配的阶位（1-24）',
      '用户选定（adaptive）或自定义（custom）的维度值不得修改，仅作为校准参考',
      'formulas 中各 modifier 直接作为 calibration.formulas 的 camelCase 字段（如 cultivationSpeedModifier），禁止嵌套 modifiers 对象',
      'formulas modifier 默认值 1.0，仅输出偏离 ±20% 以上的项',
      'warFrequencyModifier 越大 → 战争越频繁（阈值 = 80/modifier）',
      'aiDetailedParameters 含 W02 全部 43 个叙事参数字段（climate/techLevel/inflationRate 等），全部必填',
      'aiDetailedParameters 所有数值字段必须为有效数字，不确定的填 0，严禁输出 NaN 或 "NaN" 字符串',
      'aiDetailedParameters.powerCeiling 须与最终判定的 powerCeiling 一致（AI决定模式下即为 AI 判定的值）',
      'worldTags 与 worldDescription 共同决定校准方向；tags 不得与描述矛盾',
      'worldDescription 优先于 essenceTag 决定校准方向',
      'metadata 必须与输入 WorldConfig 一致，原样回写（仅 essenceTag/civilizationStage/powerSystemTag/spatialForm/difficulty）',
      '禁止在 JSON 中输出 worldDescription 字段或回写 user 中的描述全文；user 已含完整描述',
      '先分析 worldDescription 判断各模拟层是否成立；不成立的层在 entities 中设 { min: 0, max: 0 }，相关 modifier 可省略或置 1.0',
    ],
    fieldDictionary: {
      metadata: 'essenceTag/civilizationStage/powerSystemTag/spatialForm/difficulty',
      world: {
        populationBase: '区域人口基数（primitive≈50, space≈500000）',
        mapTemplate: 'continent|archipelago|pangaea|multiContinent|oceanWorld|plane|starSystems|flatDiscWorld|void',
        regionCount: '1-30',
        developmentRange: '{ min, max } 开发度 0-100',
      },
      entities: 'nationCount/factionCount/nobleHouseCount/settlementCount/tradeRouteCount 各 { min, max }',
      formulas: {
        modifiers: '各 modifier 直接作为 formulas 的 camelCase 字段，禁止嵌套 modifiers 对象',
        confusedPairs: {
          cultivationSpeedModifier: 'combat-power 战力增益；bottleneckModifier 修炼瓶颈概率，勿混',
          incomeModifier: 'work-system 玩家职业收入；economyModifier 宏观叙事/跨域',
          luckPointModifier: 'luck + fortune-encounter；勿新增 fortuneEncounterModifier',
          breakthroughChanceModifier: 'lifespan 寿命突破；devotionGainModifier 管 faith（含 faithBonus）',
          birthRateModifier: 'population-system 宏观人口出生；勿与 fertilityModifier 混淆',
          fertilityModifier: 'family-system 玩家家族生育；勿与 birthRateModifier 双输出',
          warFrequencyModifier: 'nation-relation 外交战争；conflictEscalationModifier 管 conflict-cycle',
          techProgressModifier: 'culture-tech 进度；literacyGrowthModifier 管 education 识字',
          migrationRateModifier: 'population 迁移；socialMobilityModifier 管阶层流动',
        },
        eventDistributionStrategy: 'balanced|prehistoric|political|cosmic_epic|apocalyptic|mystical',
        economyTierRatios: '5 元素单调递增至 1.0，相对 powerCeiling 的经济层级切分',
      },
    },
    decisionRules: [
      'primitive/ancient → strategy=prehistoric, populationBase 50-2000, techProgressModifier<0.8',
      'postApocalyptic/survivalHorror → apocalyptic, deathRate↑ monsterThreat↑ hpRecovery↓',
      'cultivation/easternFantasy → mystical, cultivationSpeed↑ bottleneck↑',
      'scifi+space → populationBase≥500000, techProgressModifier>2.0, mapTemplate=starSystems',
      'historical/materialist → political, cultivationSpeedModifier<0.5',
      'migrationRateModifier 管人口区域迁移概率（mobilityIndex×0.3）；socialMobilityModifier 管阶层流动，勿混淆',
      'incomeModifier 仅管 work-system 玩家职业收入；economyModifier 管叙事/跨域宏观，勿叠加到 incomeModifier',
      'conflictEscalationModifier 管 conflict-cycle 阶段事件概率（子系统 enabled 时）；warFrequencyModifier 管国家外交战争，勿混淆',
      'devotionGainModifier 管 faith 虔诚获取/衰减与突破加成；breakthroughChanceModifier 管 lifespan 寿命突破，勿混淆',
      'causalCaptureRate 管因果链捕获（匹配后概率 + 频率上限缩放）；非叙事 token 结构校准',
      'literacyGrowthModifier 管 education 识字；techProgressModifier 管 culture-tech 科技进度，勿混淆',
      'birthRateModifier 仅管 macro 人口；fertilityModifier 仅管玩家家族生育；低生育世界观可只降 birthRateModifier',
      '人口少但玩家家族多子：birthRateModifier<1 + fertilityModifier>1',
      '数量级优先：史前用 populationBase=50，而非 populationModifier=0.001',
    ],
    formulaPrinciples: [
      'L2 modifier 乘法注入已有公式，不改算法结构',
      'L1 替换查表默认值（populationBase/entities 范围/mapTemplate）',
      'L3 strategy 驱动时间线影响级别权重分布',
    ],
  }),

  userPromptTemplate: stringifyPrompt({
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldType: '{{worldType}}',
    worldTags: '{{worldTags}}',
    instruction: '校准以下世界的模拟参数，输出 WorldCalibration JSON',
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    powerSystemTag: '{{powerSystemTag}}',
    spatialForm: '{{spatialForm}}',
    civilizationStage: '{{civilizationStage}}',
    powerCeiling: '{{powerCeiling}}',
    difficulty: '{{difficulty}}',
    dimensionChoices: '{{dimensionChoices}}',
    powerCeilingPresets: '{{powerCeilingPresets}}',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'spatialForm',
    'civilizationStage', 'powerCeiling', 'difficulty', 'worldDescription',
    'worldTags', 'dimensionChoices', 'powerCeilingPresets',
    'coherenceHint', 'coherenceNote', 'worldType',
  ],

  outputFormat: 'json',
  outputSchema: worldCalibrationBundleOutputSchema,
}
