/**
 * @module destiny-pattern-prompt.ts
 * @description 命格 AI 生成 Prompt —— 分批生成 100 条命格池（5 批 × 20 条）
 * @mod mod-character
 */

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import { z } from 'zod'

import { DESTINY_PATTERN_MODERN_EXAMPLE } from '../utils/destiny-pattern-content-quality'
import { DESTINY_PATTERN_FEW_SHOT_BLOCK } from '../constants/destiny-pattern-few-shots'

/** 命格专用叙事风格：与全局 NARRATIVE_STYLE_DEFAULT 的「简练」脱钩，避免与 50–60 字冲突 */
const DESTINY_PATTERN_NARRATIVE_STYLE = [
  '叙事用现代白话，准确、有画面感；description 以 50–60 汉字为佳',
  '忌网游腔、忌与 worldDescription 不符的时代错置；描写风格须多样化，避免千篇一律的句式',
  '只写角色与生俱来的天赋、体质、性格倾向、能力特长；禁止写人生开局场景',
  '句式不拘一格：可省略主语从特质直接切入（如「对市场动向有着本能的敏锐」「数理推理能力出类拔萃」），也可用人称但不宜每条都雷同',
].join('；')

const DESTINY_PATTERN_SYSTEM_PROMPT = stringifyPrompt({
  role: '命格与天赋生成 AI',
  task: '根据完整世界观与角色信息，生成 20 条命格或天赋（天赋特质卡片，不是人生故事）',
  narrativeStyle: DESTINY_PATTERN_NARRATIVE_STYLE,
  fewShotExamples: DESTINY_PATTERN_FEW_SHOT_BLOCK,
  outputFormat: '纯 JSON 对象 { "patterns": [...] }，每条占一行，禁止 pretty-print，禁止 markdown 代码块',
  outputSchema: {
    type: '命格 | 特征（必填）',
    name: '名称（2-8字）',
    description: '描述（50-60字为佳，现代白话，写满一段；只写先天/已有特质，禁止未来剧情）',
    rarity: 'common | fine | rare | epic | legendary',
    polarity: 'positive | negative | mixed',
    effect: '效果概括（15-25字，定性描述，禁止数值）',
    attrBonus: {
      physique: '体魄 (integer)',
      mind: '心智 (integer)',
      talentAptitude: '悟性 (integer)',
      charisma: '魅力 (integer)',
      resources: '出身 (integer)',
    },
    systemModifiers: '可选，模拟系数微调（乘法，1.0=无变化）',
  },
  typeDistribution: {
    命格: '约 20–30% —— 命运气质/机缘标签（如吉星高照、天煞孤星），用抽象气质写',
    特征: '约 70–80% —— 能力倾向与天赋特长（如商业嗅觉、逻辑天才、机械亲和）',
    principle: '每批 20 条中特征占多数；禁止把未来剧情或出生场景写成命格',
  },
  temporalRules: {
    focus: '每条命格/特征是「这个人有什么特质」的静态卡片，不是「出生后发生了什么」',
    forbidden: [
      '禁止写具体未来年龄节点（如初二、高三、30岁）',
      '禁止写尚未发生的人生剧情（如父亲离世、公司上市）',
      '禁止用「将会」「日后」「未来」「一年后」等预言式措辞',
      '禁止以出生地、家庭悲剧、父母身世、宗族为主轴',
      '禁止出生/婴儿/襁褓/摇篮/育幼/同龄婴儿/啼哭等场景描写',
      '禁止把社会阶层、职业、婚姻等后天身份写成命格主体',
      '禁止描写具体童年或学生行为场景（如放学后、课堂上、拼模型、玩小霸王、爬树翻墙等属于行为场景而非天赋特质）',
    ],
    allowed: [
      '先天体质与感官（体弱、耳聪目明、平衡感佳）',
      '性格倾向与习惯（慢热、观察力强、完美主义、夜猫子）',
      '天赋特长与能力倾向（商业嗅觉、逻辑天才、机械亲和）',
      '命格式气质标签（吉星高照 —— 抽象气质，不写具体事件）',
    ],
    writingStyle: 'description 句式须多样化：可省略主语从特质直接切入，也可用「你」但整批中每种句式不宜超过三分之一；关键是把特质写透写活，而非套固定模板',
  },
  lengthRequirements: {
    description: '每条 50–60 汉字为佳（含标点）；低于 50 字仍可接受但不宜过短',
    effect: '每条 15–25 汉字',
    exampleDescription: DESTINY_PATTERN_MODERN_EXAMPLE.description,
    antiPattern: '禁止 20 字以内的单句描述；禁止「初二配眼镜」「1999年入职上市」等未来事件',
  },
  systemModifierRules: {
    common_fine: '禁止输出 systemModifiers',
    rare: '最多 1 个个人向字段，范围 0.95~1.08',
    epic: '最多 1 个人 + 1 个世界向字段，范围 0.93~1.12',
    legendary: '最多 2 个人 + 2 个世界向字段，范围 0.88~1.15',
    personalFields: '见 user.personalModifierFields',
    worldFields: '见 user.worldModifierFields',
    principle: '影响力宜小；worldDescription 与 coherenceHint 优先于 essenceTag 与 worldTags',
  },
  rarityDistribution: {
    common: { count: '7-8 条', ratio: '≈40%' },
    fine: { count: '5-6 条', ratio: '≈30%' },
    rare: { count: '2-3 条', ratio: '≈15%' },
    epic: { count: '1-2 条', ratio: '≈10%' },
    legendary: { count: '0-1 条', ratio: '≈5%' },
    batchLimits: '每批 20 条：legendary 最多 3、epic 最多 8',
    principle: '禁止整批几乎全是 common/fine；至少含 1 条 rare 及以上',
  },
  polarityDistribution: {
    positive: '约 50%',
    negative: '约 30%',
    mixed: '约 20%',
  },
  designRequirements: [
    '先按 coherenceHint 理解本世界成立的系统层，命格主题不得引入未启用的文明要素',
    '命格须贴合 worldDescription 的核心设定（术语、力量体系、社会形态）',
    '命格或天赋名称与描述须体现本世界独特性，禁止套用放之四海皆准的通用模板（如「魅力亲和」「资源达人」）',
    '属性加成：common 仅 1 个属性 ±1；fine ±2 或双属性各 ±1；rare 双属性 +2/+1；epic 总和 ≤5；legendary 总和 ≤7',
    'attrBonus 仅输出非零字段，禁止写 physique:0 等占位零值',
    'common/fine 禁止 systemModifiers 字段；禁止 systemModifiers:null',
    '输出紧凑单行 JSON，禁止 pretty-print 换行缩进',
    '命格之间差异化，禁止与 existingNames 重复或近似',
    'description 与 effect 禁止出现具体数字',
    '每条必须含 type 字段，值为「命格」或「特征」',
  ],
})

export const destinyPatternOutputSchema = z.array(
  z.object({
    type: z.enum(['命格', '特征']).optional(),
    name: z.string().describe('命格名称（2-8字）'),
    description: z.string().describe('命格描述（50-60字）'),
    rarity: z.enum(['common', 'fine', 'rare', 'epic', 'legendary']).describe('稀有度'),
    polarity: z.enum(['positive', 'negative', 'mixed']).describe('极性'),
    effect: z.string().describe('效果描述'),
    attrBonus: z.object({
      physique: z.number().optional(),
      mind: z.number().optional(),
      talentAptitude: z.number().optional(),
      charisma: z.number().optional(),
      resources: z.number().optional(),
    }).optional(),
    systemModifiers: z.record(z.string(), z.number()).optional(),
  }),
)

export type DestinyPatternOutput = z.infer<typeof destinyPatternOutputSchema>

export const destinyPatternPrompt: PromptTemplate<DestinyPatternOutput> = {
  name: 'destiny-pattern',
  version: '2.5.0',
  mod: 'mod-character',
  systemPrompt: DESTINY_PATTERN_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'json',
  outputSchema: destinyPatternOutputSchema,
}
