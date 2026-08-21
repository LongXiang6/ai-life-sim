/**
 * Purpose: Define the W02 detailed-world-parameter contract and output Schema.
 * Owner: mod-world / world-init.
 * Responsibility: Detailed parameter semantics only; dimension inference and simulation calibration live elsewhere.
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

const finiteNumber = z.coerce.number().finite()

/** 世界配置生成输出 Schema */
export const worldConfigOutputSchema = z.object({
  climate: z.string(),
  averageTemperature: finiteNumber,
  seaLevel: finiteNumber,
  magicDensity: finiteNumber,
  naturalDisasterFrequency: finiteNumber,
  resourceAbundance: finiteNumber,
  landmassRatio: finiteNumber,
  biomeDiversity: finiteNumber,
  techLevel: finiteNumber,
  populationScale: finiteNumber,
  urbanizationRate: finiteNumber,
  literacyRate: finiteNumber,
  lifespan: finiteNumber,
  socialMobility: finiteNumber,
  culturalDiversity: finiteNumber,
  religiousInfluence: finiteNumber,
  governmentType: z.string(),
  centralization: finiteNumber,
  lawStrictness: finiteNumber,
  corruptionLevel: finiteNumber,
  diplomaticRelations: finiteNumber,
  warProbability: finiteNumber,
  economicSystem: z.string(),
  wealthInequality: finiteNumber,
  tradeActivity: finiteNumber,
  currencyType: z.string(),
  taxRate: finiteNumber,
  inflationRate: finiteNumber,
  powerSource: z.string(),
  powerAccessibility: finiteNumber,
  powerHierarchyComplexity: finiteNumber,
  breakthroughDifficulty: finiteNumber,
  powerImbalance: finiteNumber,
  forbiddenTechniques: finiteNumber,
  languageCount: finiteNumber,
  artTradition: finiteNumber,
  philosophicalSchools: finiteNumber,
  superstitionLevel: finiteNumber,
  hospitalityCulture: finiteNumber,
  honorCulture: finiteNumber,
  overallMood: z.string(),
  adventureAppeal: finiteNumber,
  mysteryLevel: finiteNumber,
})

export type WorldAIDetailedParameters = z.infer<typeof worldConfigOutputSchema>

/** W02 aiDetailedParameters 字段目录（供合并 Prompt 列举，保持扁平结构） */
export const WORLD_CONFIG_AI_FIELD_KEYS = Object.keys(
  worldConfigOutputSchema.shape,
) as (keyof WorldAIDetailedParameters)[]

export const WORLD_CONFIG_PROMPT_CONTRACT = {
  responsibility: 'aiDetailedParameters 的详细世界参数由本专项填写；维度、标签与模拟公式分别沿用各自专项结果。',
  output: '纯 JSON 对象，按字段目录填写全部字段。',
  valueRules: [
    '字符串字段使用符合当前世界的简短名称或描述。',
    '数值字段使用字段目录声明的单位和范围，并保持同一世界内部一致。',
    '输入事实能够确定的数值按其真实尺度表达；信息不足时，目录下限为 0 的数值使用 0，目录下限大于 0 的数值使用其目录下限。',
    '字段保持扁平结构和既定 camelCase 名称。',
  ],
} as const

export const WORLD_CONFIG_PARAMETER_CATALOG = {
  geography: {
    label: '地理参数（8 个）',
    fields: {
      climate: { label: '气候类型', values: ['热带', '温带', '寒带', '干旱', '混合'] },
      averageTemperature: { label: '平均温度(℃)', range: [-30, 50] },
      seaLevel: { label: '海平面高度', range: [0, 100], description: '影响沿海区域比例' },
      magicDensity: { label: '魔力/灵气浓度', range: [0, 100] },
      naturalDisasterFrequency: { label: '自然灾害频率', range: [0, 100] },
      resourceAbundance: { label: '自然资源丰富度', range: [0, 100] },
      landmassRatio: { label: '陆地占比', range: [0.1, 0.9] },
      biomeDiversity: { label: '生态系统多样性', range: [0, 100] },
    },
  },
  civilization: {
    label: '文明参数（8 个）',
    fields: {
      techLevel: { label: '科技/工艺成熟度', range: [0, 100] },
      populationScale: {
        label: '人口规模',
        unit: '人',
        minimum: 0,
        referenceValues: [100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000],
      },
      urbanizationRate: { label: '城市化率', range: [0, 100] },
      literacyRate: { label: '教育普及度', range: [0, 100] },
      lifespan: { label: '平均寿命', range: [20, 1000], description: '取决于种族和力量体系' },
      socialMobility: { label: '社会流动性', range: [0, 100] },
      culturalDiversity: { label: '文化多样性', range: [0, 100] },
      religiousInfluence: { label: '宗教/信仰影响力', range: [0, 100] },
    },
  },
  politics: {
    label: '政治参数（6 个）',
    fields: {
      governmentType: { label: '政体', values: ['帝国', '王国', '共和国', '部落', '宗门', '议会'] },
      centralization: { label: '中央集权度', range: [0, 100] },
      lawStrictness: { label: '法律严明度', range: [0, 100] },
      corruptionLevel: { label: '腐败程度', range: [0, 100] },
      diplomaticRelations: { label: '外交关系', range: [0, 100], description: '影响跨势力互动频率' },
      warProbability: { label: '战争概率', range: [0, 100] },
    },
  },
  economy: {
    label: '经济参数（6 个）',
    fields: {
      economicSystem: { label: '经济体系', values: ['农业', '商业', '工业', '信息', '灵气经济'] },
      wealthInequality: { label: '贫富差距', range: [0, 100] },
      tradeActivity: { label: '贸易活跃度', range: [0, 100] },
      currencyType: { label: '货币类型', values: ['贵金属', '信用', '魔力结晶', '无'] },
      taxRate: { label: '税率', range: [0, 50] },
      inflationRate: { label: '通胀率', range: [0, 30] },
    },
  },
  powerSystem: {
    label: '力量体系参数（6 个）',
    fields: {
      powerSource: { label: '力量来源', values: ['灵气', '魔力', '科技', '肉体', '信仰', '血脉'] },
      powerAccessibility: { label: '力量获取难度', range: [0, 100], description: '越低越难' },
      powerHierarchyComplexity: { label: '力量层次复杂度', range: [0, 100], description: '当前世界力量层次的细分程度' },
      breakthroughDifficulty: { label: '突破难度', range: [0, 100] },
      powerImbalance: { label: '力量不均衡度', range: [0, 100], description: '强者与弱者差距' },
      forbiddenTechniques: { label: '禁术/禁忌力量数量', range: [0, 50] },
    },
  },
  culture: {
    label: '文化参数（6 个）',
    fields: {
      languageCount: { label: '语言数量', range: [1, 20] },
      artTradition: { label: '艺术传统', range: [0, 100] },
      philosophicalSchools: { label: '哲学/修炼流派数量', range: [0, 30] },
      superstitionLevel: { label: '迷信程度', range: [0, 100] },
      hospitalityCulture: { label: '好客文化', range: [0, 100] },
      honorCulture: { label: '荣誉/信用文化', range: [0, 100] },
    },
  },
  atmosphere: {
    label: '世界氛围（3 个）',
    fields: {
      overallMood: { label: '世界整体氛围', values: ['和平', '动荡', '神秘', '压抑', '繁荣', '衰退'] },
      adventureAppeal: { label: '冒险吸引力', range: [0, 100] },
      mysteryLevel: { label: '未知/神秘度', range: [0, 100] },
    },
  },
} as const

export const worldConfigPrompt: PromptTemplate = {
  name: 'world-config',
  version: '1.2.0',
  mod: 'mod-world',

  systemPrompt: stringifyPrompt({
    role: '世界详细参数专员',
    ...WORLD_CONFIG_PROMPT_CONTRACT,
    parameters: WORLD_CONFIG_PARAMETER_CATALOG,
  }),

  userPromptTemplate: stringifyPrompt({
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    powerSystemTag: '{{powerSystemTag}}',
    spatialForm: '{{spatialForm}}',
    civilizationStage: '{{civilizationStage}}',
    powerFramework: '{{powerFramework}}',
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldType: '{{worldType}}',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'spatialForm', 'civilizationStage',
    'powerFramework', 'worldDescription', 'coherenceHint', 'coherenceNote', 'worldType',
  ],

  outputFormat: 'json',
  outputSchema: worldConfigOutputSchema,
}
