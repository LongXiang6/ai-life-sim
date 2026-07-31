/**
 * @module world-config-prompt.ts
 * @description W02 世界自定义 Prompt —— AI 生成世界高级配置（40+ 字段）
 * @mod mod-world
 *
 * 设计理念：由 AI 根据世界观赋予合适数据，玩家可在此基础上调整。
 * 参考旧案 world-evolution-engine.ts 的 25+ 参数。
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

/**
 * NaN 安全的数字强制转换 —— AI 在 JSON 模式下可能输出字符串 "NaN"，
 * Number("NaN") → NaN，而 Zod 的 z.number() 不接受 NaN。
 * 这里在 coerce 之前先拦截：非数字字符串和 NaN 统一兜底为 0。
 */
const nanSafeNumber = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return 0
    if (typeof v === 'number') return Number.isNaN(v) ? 0 : v
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isNaN(n) ? 0 : n
    }
    return 0
  },
  z.number(),
)

/** 世界配置生成输出 Schema */
export const worldConfigOutputSchema = z.object({
  climate: z.string(),
  averageTemperature: nanSafeNumber,
  seaLevel: nanSafeNumber,
  magicDensity: nanSafeNumber,
  naturalDisasterFrequency: nanSafeNumber,
  resourceAbundance: nanSafeNumber,
  landmassRatio: nanSafeNumber,
  biomeDiversity: nanSafeNumber,
  techLevel: nanSafeNumber,
  populationScale: nanSafeNumber, // AI 输出为 number，语义上人口规模应是数值而非字符串
  urbanizationRate: nanSafeNumber,
  literacyRate: nanSafeNumber,
  lifespan: nanSafeNumber,
  socialMobility: nanSafeNumber,
  culturalDiversity: nanSafeNumber,
  religiousInfluence: nanSafeNumber,
  governmentType: z.string(),
  centralization: nanSafeNumber,
  lawStrictness: nanSafeNumber,
  corruptionLevel: nanSafeNumber,
  diplomaticRelations: nanSafeNumber,
  warProbability: nanSafeNumber,
  economicSystem: z.string(),
  wealthInequality: nanSafeNumber,
  tradeActivity: nanSafeNumber,
  currencyType: z.string(),
  taxRate: nanSafeNumber,
  inflationRate: nanSafeNumber,
  powerSource: z.string(),
  powerAccessibility: nanSafeNumber,
  powerHierarchyComplexity: nanSafeNumber,
  breakthroughDifficulty: nanSafeNumber,
  powerImbalance: nanSafeNumber,
  forbiddenTechniques: nanSafeNumber,
  languageCount: nanSafeNumber,
  artTradition: nanSafeNumber,
  philosophicalSchools: nanSafeNumber,
  superstitionLevel: nanSafeNumber,
  hospitalityCulture: nanSafeNumber,
  honorCulture: nanSafeNumber,
  overallMood: z.string(),
  adventureAppeal: nanSafeNumber,
  mysteryLevel: nanSafeNumber,
})

export type WorldAIDetailedParameters = z.infer<typeof worldConfigOutputSchema>

/** W02 aiDetailedParameters 必填字段名（供合并 Prompt 列举，禁止自造嵌套） */
export const WORLD_CONFIG_AI_FIELD_KEYS = Object.keys(
  worldConfigOutputSchema.shape,
) as (keyof WorldAIDetailedParameters)[]

export const worldConfigPrompt: PromptTemplate = {
  name: 'world-config',
  version: '1.0.0',
  mod: 'mod-world',

  systemPrompt: stringifyPrompt({
    role: '世界构建 AI',
    task: '根据用户提供的世界基础配置，生成该世界的详细参数',
    outputFormat: 'JSON，不要 markdown 代码块包裹',
    constraints: [
      '严格输出 JSON，不要 markdown 代码块包裹',
      '所有字段必填',
      '所有数值字段必须输出有效数字，不确定的填 0，严禁输出 NaN 或 "NaN" 字符串',
      '按参数分组顺序返回字段',
    ],
    parameters: {
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
          populationScale: { label: '人口规模', values: ['百千', '百万', '千万', '亿', '十亿'] },
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
    },
  }),

  userPromptTemplate: stringifyPrompt({
    instruction: '请根据以下世界基础配置生成详细参数',
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
