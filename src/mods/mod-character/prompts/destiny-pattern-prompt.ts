/**
 * @module destiny-pattern-prompt.ts
 * @description 命格 AI 生成 Prompt —— 单批 10 条，无时间履历的稳定天赋/特质
 * @mod mod-character
 */

import type { PromptTemplate } from '@/foundation'

import { z } from 'zod'
import { AI_DESTINY_PATTERN_BATCH_SIZE } from '../constants'

const DESTINY_PATTERN_TARGET_POSITIVE_COUNT = 7
const DESTINY_PATTERN_MIN_POSITIVE_COUNT = 6
export const DESTINY_PATTERN_PROMPT_VERSION = '3.5.0'

const DESTINY_PATTERN_SYSTEM_PROMPT = `你是命格、天赋与人格特质生成器。根据用户消息中的世界与角色信息，生成正好${AI_DESTINY_PATTERN_BATCH_SIZE}条彼此不同的固有命格。

输出且只输出含正好${AI_DESTINY_PATTERN_BATCH_SIZE}个对象的紧凑JSON顶层数组：[{...},{...}]，不要对象包装，不要markdown，且完全使用中文属性键。

每条字段：
- 名称：简短、鲜明的命格名称。
- 稀有度：普通/精良/稀有/史诗/传说。
- 极性：正向/混合。极性只允许这两个中文值。每批正好${DESTINY_PATTERN_TARGET_POSITIVE_COUNT}条“正向”、${AI_DESTINY_PATTERN_BATCH_SIZE - DESTINY_PATTERN_TARGET_POSITIVE_COUNT}条“混合”，并打乱顺序；“混合”必须同时包含明确收益与有限代价。
- 设定描述：完整定义角色开局前已经成立且长期稳定的天赋、体质、认知方式、性格倾向或代价机制。
- 效果：至少10字，概括实际影响。
- 属性加成：只允许 体魄/心智/悟性/魅力，只写非零项。普通仅单属性±1；精良总量≤2；稀有≤3；史诗≤5；传说≤7。
- 模拟系数：可选的模拟系数对象。普通/精良省略；稀有最多1个个人字段、0.95-1.08；史诗最多2个个人字段和1个世界字段、0.90-1.15；传说最多2个个人字段和2个世界字段、0.85-1.20。
  个人字段名只允许使用以下中文名称：气运获取/生命恢复/体力恢复/寿命突破/成长系数/修炼瓶颈/职业收入/家族生育/虔诚获取/寿命上限/属性衰减。
  世界字段名只允许使用以下中文名称：宏观人口出生/宏观死亡率/战争频率/科技进度/灾害频率/怪物威胁/阶层流动/人口迁移/宏观经济/势力涌现。

硬性语义：
1. 设定描述是特质说明，不是人生故事。严禁年份、季节日期、具体年龄、第一次、曾经、后来、某天、过去经历、未来预言或具体会发生的事件。
2. 不得写“你路过/遇到/收到/参加/进入某处后”等传记句式；不得替角色虚构已经发生或必将发生的遭遇。
3. 可以用机制、感官、意象解释“这种特质如何运作”，但不得设置具体时间场景。
4. ${AI_DESTINY_PATTERN_BATCH_SIZE}条在能力领域、稀有度和句法上保持差异，适配用户世界设定，不硬套现代/修仙/科幻模板。正向必须是清楚可用的正向特质，不得为了“平衡”统一补写副作用、人格缺陷、负属性或“但/却/容易因此”的转折尾巴；只有张力本身构成命格核心时才使用混合。
5. 稀有度代表影响层级而不只是数值大小：普通/精良是日常、局部倾向；稀有稳定影响一个个人领域；史诗可跨个人领域或轻度影响周边环境；传说允许轻度概念规则。
6. 概念规则必须通过条件、概率、有限触发或可被对抗的方式体现，混合还可以包含有限代价。
7. 效果写成叙事引擎可持续遵守的规则，属性加成/模拟系数只做有限数值映射，不能用数值字段替代叙事影响。

字段写法示例（两条正向、一条混合；仅示意字段，实际输出仍必须是${AI_DESTINY_PATTERN_BATCH_SIZE}项顶层数组）：
[{"名称":"结构听觉","设定描述":"你天生能把纷杂声响拆成有层次的结构，机械振动、脚步节奏与材料裂隙在听觉中各有纹理，这种稳定辨识力让你更早察觉异常并理解复杂结构。","稀有度":"精良","效果":"擅长通过声音识别结构、节奏与潜在隐患","极性":"正向","属性加成":{"心智":1,"悟性":1}},
{"名称":"信任延迟","设定描述":"你的信任建立得比常人缓慢，认知会持续校验语气、行为与承诺是否一致；一旦关系通过验证，你的观察与回应会变得格外稳定，很少因表面情绪改变判断。","稀有度":"普通","效果":"慢热谨慎，建立信任后关系稳定且洞察细致","极性":"混合","属性加成":{"魅力":-1}},
{"名称":"概率偏斜","设定描述":"随机结果在你周围呈现出难以解释的轻微偏向，危险往往错开最致命的一线，稀缺机会也更容易进入可触及范围；这种偏向无法主动控制，只能提高转机出现的可能。","稀有度":"传说","效果":"遭遇重大风险时更容易出现可争取的转机，但不会取消伤害、代价或失败","极性":"正向","属性加成":{"悟性":3,"魅力":1},"模拟系数":{"气运获取":1.18,"宏观死亡率":0.92}}]
`

const destinyPatternSystemModifiersSchema = z.object({
  luckPointModifier: z.coerce.number().optional(),
  hpRecoveryModifier: z.coerce.number().optional(),
  staminaRecoveryModifier: z.coerce.number().optional(),
  breakthroughChanceModifier: z.coerce.number().optional(),
  cultivationSpeedModifier: z.coerce.number().optional(),
  bottleneckModifier: z.coerce.number().optional(),
  incomeModifier: z.coerce.number().optional(),
  fertilityModifier: z.coerce.number().optional(),
  devotionGainModifier: z.coerce.number().optional(),
  lifespanModifier: z.coerce.number().optional(),
  attributeDecayModifier: z.coerce.number().optional(),
  birthRateModifier: z.coerce.number().optional(),
  deathRateModifier: z.coerce.number().optional(),
  warFrequencyModifier: z.coerce.number().optional(),
  techProgressModifier: z.coerce.number().optional(),
  disasterFrequencyModifier: z.coerce.number().optional(),
  monsterThreatModifier: z.coerce.number().optional(),
  socialMobilityModifier: z.coerce.number().optional(),
  migrationRateModifier: z.coerce.number().optional(),
  economyModifier: z.coerce.number().optional(),
  factionEmergenceModifier: z.coerce.number().optional(),
}).strict()

export const destinyPatternOutputSchema = z.array(
  z.object({
    type: z.enum(['命格', '特征']).optional(),
    name: z.string().describe('简短、鲜明的命格名称'),
    description: z.string().describe('完整命格描述，不得按字符数删短'),
    rarity: z.enum(['common', 'fine', 'rare', 'epic', 'legendary']).describe('稀有度'),
    polarity: z.enum(['positive', 'mixed']).describe('极性：正向，或收益与有限代价并存'),
    effect: z.string().describe('效果描述'),
    attrBonus: z.object({
      physique: z.coerce.number().optional(),
      mind: z.coerce.number().optional(),
      talentAptitude: z.coerce.number().optional(),
      charisma: z.coerce.number().optional(),
    }).strict().optional(),
    systemModifiers: destinyPatternSystemModifiersSchema.optional(),
  }).strict(),
).length(AI_DESTINY_PATTERN_BATCH_SIZE).superRefine((patterns, context) => {
  const positiveCount = patterns.filter((pattern) => pattern.polarity === 'positive').length
  if (positiveCount < DESTINY_PATTERN_MIN_POSITIVE_COUNT) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `每批命格至少需要${DESTINY_PATTERN_MIN_POSITIVE_COUNT}条正向命格`,
    })
  }
})

export type DestinyPatternOutput = z.infer<typeof destinyPatternOutputSchema>

export const destinyPatternPrompt: PromptTemplate<DestinyPatternOutput> = {
  name: 'destiny-pattern',
  version: DESTINY_PATTERN_PROMPT_VERSION,
  mod: 'mod-character',
  systemPrompt: DESTINY_PATTERN_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'json',
  outputSchema: destinyPatternOutputSchema,
}

// 命格生成中文键到系统英文契约映射
const RARITY_MAP: Record<string, string> = {
  '普通': 'common', '精良': 'fine', '稀有': 'rare', '史诗': 'epic', '传说': 'legendary'
}
const POLARITY_MAP: Record<string, string> = {
  '正向': 'positive', '混合': 'mixed'
}
const ATTR_MAP: Record<string, string> = {
  '体魄': 'physique', '心智': 'mind', '悟性': 'talentAptitude', '魅力': 'charisma'
}
const MODIFIER_MAP: Record<string, string> = {
  '气运获取': 'luckPointModifier',
  '生命恢复': 'hpRecoveryModifier',
  '体力恢复': 'staminaRecoveryModifier',
  '寿命突破': 'breakthroughChanceModifier',
  '成长系数': 'cultivationSpeedModifier',
  '修炼瓶颈': 'bottleneckModifier',
  '职业收入': 'incomeModifier',
  '家族生育': 'fertilityModifier',
  '虔诚获取': 'devotionGainModifier',
  '寿命上限': 'lifespanModifier',
  '属性衰减': 'attributeDecayModifier',
  '宏观人口出生': 'birthRateModifier',
  '宏观死亡率': 'deathRateModifier',
  '战争频率': 'warFrequencyModifier',
  '科技进度': 'techProgressModifier',
  '灾害频率': 'disasterFrequencyModifier',
  '怪物威胁': 'monsterThreatModifier',
  '阶层流动': 'socialMobilityModifier',
  '人口迁移': 'migrationRateModifier',
  '宏观经济': 'economyModifier',
  '势力涌现': 'factionEmergenceModifier'
}

/**
 * 将 AI 中文协议格式转换为底层英文 strict Zod 结构
 */
export function translateDestinyPatternAIResponse(rawList: unknown[]): unknown[] {
  if (!Array.isArray(rawList)) return []
  return rawList.map(rawItem => {
    if (!rawItem || typeof rawItem !== 'object') return rawItem
    const item = rawItem as Record<string, unknown>

    // 处理基础键
    const name = String(item.名称 ?? item.name ?? '')
    const description = String(item.设定描述 ?? item.description ?? '')
    const rarity = RARITY_MAP[String(item.稀有度 ?? '')] ?? String(item.rarity ?? '')
    const polarity = POLARITY_MAP[String(item.极性 ?? '')] ?? String(item.polarity ?? '')
    const effect = String(item.效果 ?? item.effect ?? '')

    // 处理属性加成
    const attrBonus: Record<string, number> = {}
    const rawAttr = item.属性加成 ?? item.attrBonus
    if (rawAttr && typeof rawAttr === 'object' && rawAttr !== null) {
      for (const [k, v] of Object.entries(rawAttr)) {
        const engKey = ATTR_MAP[k] ?? k
        attrBonus[engKey] = Number(v)
      }
    }

    // 处理系统修饰系数
    const systemModifiers: Record<string, number> = {}
    const rawMods = item.模拟系数 ?? item.systemModifiers
    if (rawMods && typeof rawMods === 'object' && rawMods !== null) {
      for (const [k, v] of Object.entries(rawMods)) {
        const engKey = MODIFIER_MAP[k] ?? k
        systemModifiers[engKey] = Number(v)
      }
    }

    return {
      name,
      description,
      rarity,
      polarity,
      effect,
      attrBonus: Object.keys(attrBonus).length > 0 ? attrBonus : undefined,
      systemModifiers: Object.keys(systemModifiers).length > 0 ? systemModifiers : undefined
    }
  })
}
