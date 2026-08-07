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
const decimalQuantitySchema = z.string().regex(/^(0|[1-9]\d*)$/).optional()

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
    worldviewStyleHint: z.string().optional(),
    narrativeTone: z.string().optional(),
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

/** 校准 + W02 详细参数合并输出 */
export const worldCalibrationBundleOutputSchema = z.object({
  calibration: worldCalibrationOutputSchema,
  aiDetailedParameters: worldConfigOutputSchema.optional(),
  worldTags: z.array(z.string()).min(1).optional(),
})

export type WorldCalibrationBundleOutput = z.infer<typeof worldCalibrationBundleOutputSchema>

export const worldCalibrationPrompt: PromptTemplate = {
  name: 'world-calibration',
  version: '2.0.0',
  mod: 'mod-world',

  systemPrompt: stringifyPrompt({
    role: '世界模拟校准 AI',
    task: '根据 WorldConfig、世界描述与用户维度选择，输出合并 JSON：calibration（稀疏）+ aiDetailedParameters（W02 全字段）+ 覆盖世界真实氛围所需的 worldTags。AI决定模式的维度可自行判定最适值',
    outputFormat: '纯 JSON 对象 { calibration, aiDetailedParameters, worldTags }；calibration 稀疏，aiDetailedParameters 全字段必填，worldTags 为字符串数组',
    constraints: [
      '顶层必须含 calibration 与 aiDetailedParameters 两个字段',
      '同时输出 worldTags：完整覆盖 worldDescription 中实际成立的描述性标签，去重但不得因固定条数省略，禁止与描述矛盾',
      '严格使用 camelCase 字段名，禁止自造字段',
      '禁止 markdown 代码块、禁止解释文字、禁止占位符',
      '先阅读 dimensionChoices，了解用户对每个维度的决定权：AI决定模式下可自由调整该维度的值',
      'AI决定模式的 powerFramework：根据 worldDescription 定义当前世界的具名力量层次，不引用固定阶位表',
      '用户选定（adaptive）或自定义（custom）的维度值不得修改，仅作为校准参考',
      'formulas 中各 modifier 直接作为 calibration.formulas 的 camelCase 字段（如 cultivationSpeedModifier），禁止嵌套 modifiers 对象',
      'formulas modifier 默认值 1.0，仅输出偏离 ±20% 以上的项',
      'scale 是现实数量级校准；人口、经济产出、货币供应等大整数必须输出不含逗号的十进制字符串，禁止科学计数法与浮点数',
      'warFrequencyModifier 越大 → 战争越频繁（阈值 = 80/modifier）',
      'aiDetailedParameters 含 W02 全部 43 个叙事参数字段（climate/techLevel/inflationRate 等），全部必填',
      'aiDetailedParameters 所有数值字段必须为有效数字，不确定的填 0，严禁输出 NaN 或 "NaN" 字符串',
      'worldTags 与 worldDescription 共同决定校准方向；tags 不得与描述矛盾',
      'worldDescription 优先于 essenceTag 决定校准方向',
      'metadata 必须与输入 WorldConfig 一致，原样回写（仅 essenceTag/civilizationStage/powerSystemTag/spatialForm/difficulty）',
      '禁止在 JSON 中输出 worldDescription 字段或回写 user 中的描述全文；user 已含完整描述',
      '先分析 worldDescription 判断各模拟层是否成立；不成立的层在 entities 中设 { min: 0, max: 0 }，相关 modifier 可省略或置 1.0',
    ],
    fieldDictionary: {
      metadata: 'essenceTag/civilizationStage/powerSystemTag/spatialForm/difficulty',
      world: {
        mapTemplate: 'continent|archipelago|pangaea|multiContinent|oceanWorld|plane|starSystems|flatDiscWorld|void',
        regionCount: '1-30',
        developmentRange: '{ min, max } 开发度 0-100',
      },
      scale: {
        populationTotal: '整个上下文人口总量，十进制字符串；现实基线约为史前100万、古代1.7亿、中世纪4亿、现代82亿，架空设定按描述显式调整',
        populationCarryingCapacity: '当前资源和技术条件下人口承载量，十进制字符串且不低于合理长期人口',
        demographicRates: 'annualBirthsPerMillion/annualDeathsPerMillion/annualNetMigrationPerMillion 均为每百万人每年人数',
        shares: 'urbanizationBasisPoints/literacyBasisPoints 为万分比，10000=100%',
        economy: 'annualEconomicOutput/moneySupply/subsistenceIncomePerCapita 均为十进制整数字符串；monetaryMode 明确无货币、互惠、物物交换、实物货币、通货或后稀缺',
        indices: 'priceIndexBasisPoints 以10000为基期；annualInflationPerMillion 为每百万年率；产业、资源、污染字段均为基点指数',
      },
      entities: 'nationCount/factionCount/nobleHouseCount/settlementCount/tradeRouteCount 各 { min, max }',
      formulas: {
        modifiers: '各 modifier 直接作为 formulas 的 camelCase 字段，禁止嵌套 modifiers 对象',
        confusedPairs: {
          cultivationSpeedModifier: '力量框架中的训练速度；bottleneckModifier 管修炼瓶颈概率，勿混',
          incomeModifier: '角色收益叙事倾向，不创建职业状态；economyModifier 管世界区域的宏观交换背景',
          luckPointModifier: '角色状态的气运倾向；勿新增平行机缘数值',
          vitalityRecoveryModifier: '角色状态的生命恢复；staminaRecoveryModifier 与 spiritRecoveryModifier 分别管体力和精神恢复',
          conditionProgressionModifier: '角色状态的健康问题进展；数值越高，恢复越慢',
          lifespanModifier: '角色状态的叙事寿命上限；只影响临近上限的终局风险，不制造确定死亡或随机突破',
          birthRateModifier: '世界区域的人口变化背景；勿与 fertilityModifier 混淆',
          fertilityModifier: '角色与家庭生育的叙事倾向，不创建关系或人口状态；勿与 birthRateModifier 双输出',
          warFrequencyModifier: '世界区域的冲突背景频率；conflictEscalationModifier 管剧情冲突升级倾向，两者都不创建冲突周期状态',
          techProgressModifier: '知识与技术进度；literacyGrowthModifier 管世界区域的教育背景',
          migrationRateModifier: '世界区域之间的迁移背景；socialMobilityModifier 管区域社会流动背景',
        },
        eventDistributionStrategy: 'balanced|prehistoric|political|cosmic_epic|apocalyptic|mystical',
      },
    },
    decisionRules: [
      'primitive → strategy=prehistoric，人口总量现实默认约100万且以部落/游群分散；ancient 现实默认约1.7亿；不要把聚落规模误当世界总人口',
      'postApocalyptic/survivalHorror → apocalyptic, deathRate↑ monsterThreat↑ hpRecovery↓',
      'cultivation/easternFantasy → mystical, cultivationSpeed↑ bottleneck↑',
      'scifi+space → 人口总量通常至少百亿级，跨多元世界可到亿亿级以上；必须用 scale.populationTotal 十进制字符串表达，techProgressModifier>2.0，mapTemplate=starSystems',
      'historical/materialist → political, cultivationSpeedModifier<0.5',
      'migrationRateModifier 管世界区域之间的迁移背景；socialMobilityModifier 管区域社会流动背景，勿混淆',
      'incomeModifier 只表达角色收益叙事倾向；economyModifier 管世界区域宏观交换背景，二者都不创建职业或经济状态',
      'conflictEscalationModifier 管剧情冲突升级倾向；warFrequencyModifier 管世界区域冲突背景频率，二者都不创建冲突周期状态',
      'vitalityRecoveryModifier、staminaRecoveryModifier、spiritRecoveryModifier 与 conditionProgressionModifier 只管角色状态；lifespanModifier 只管叙事寿命上限与临近上限风险',
      'causalCaptureRate 管因果链捕获（匹配后概率 + 频率上限缩放）；非叙事 token 结构校准',
      'literacyGrowthModifier 管世界区域教育背景；techProgressModifier 管知识与技术进度，勿混淆',
      'birthRateModifier 仅管世界区域人口背景；fertilityModifier 仅管角色家庭生育叙事倾向；低生育世界观可只降 birthRateModifier',
      '人口少但玩家家族多子：birthRateModifier<1 + fertilityModifier>1',
      '现实基线优先，架空差异写入 scale 明确字段或 modifier；不得用固定50人、100万人等同所有时代和空间尺度',
    ],
    formulaPrinciples: [
      'L2 modifier 乘法注入已有公式，不改算法结构',
      'L1 替换时代规模默认值（scale/entities 范围/mapTemplate）',
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
    powerFramework: '{{powerFramework}}',
    difficulty: '{{difficulty}}',
    dimensionChoices: '{{dimensionChoices}}',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'spatialForm',
    'civilizationStage', 'powerFramework', 'difficulty', 'worldDescription',
    'worldTags', 'dimensionChoices',
    'coherenceHint', 'coherenceNote', 'worldType',
  ],

  outputFormat: 'json',
  outputSchema: worldCalibrationBundleOutputSchema,
}
