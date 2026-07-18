/**
 * @module destiny-pattern-prompt.ts
 * @description 命格 AI 生成 Prompt —— 单批 10 条，无时间履历的稳定天赋/特质
 * @mod mod-character
 */

import type { PromptTemplate } from '@/foundation'

import { z } from 'zod'
import { AI_DESTINY_PATTERN_BATCH_SIZE } from '../constants'

const DESTINY_PATTERN_SYSTEM_PROMPT = `你是命格、天赋与人格特质生成器。根据用户消息中的世界与角色信息，生成正好${AI_DESTINY_PATTERN_BATCH_SIZE}条彼此不同的固有命格。

输出且只输出含正好${AI_DESTINY_PATTERN_BATCH_SIZE}个对象的紧凑JSON顶层数组：[{...},{...}]，不要对象包装，不要markdown。

每条字段：
- name：2-8字。
- rarity：common/fine/rare/epic/legendary。
- polarity：positive/mixed。禁止 negative；mixed 必须同时包含明确收益与有限代价。
- description：50-110汉字，定义角色开局前已经成立且长期稳定的天赋、体质、认知方式、性格倾向或代价机制。
- effect：至少10字，概括实际影响。
- attrBonus：只允许 physique/mind/talentAptitude/charisma（体魄/心智/悟性/魅力），只写非零项。common仅单属性±1；fine总量≤2；rare≤3；epic≤5；legendary≤7。
- systemModifiers：可选的模拟系数对象。common/fine省略；rare最多1个个人字段、0.95-1.08；epic最多2个个人字段和1个世界字段、0.90-1.15；legendary最多2个个人字段和2个世界字段、0.85-1.20。个人字段仅可用 luckPointModifier/hpRecoveryModifier/staminaRecoveryModifier/breakthroughChanceModifier/cultivationSpeedModifier/bottleneckModifier/incomeModifier/fertilityModifier/devotionGainModifier/lifespanModifier/attributeDecayModifier；世界字段仅可用 birthRateModifier/deathRateModifier/warFrequencyModifier/techProgressModifier/disasterFrequencyModifier/monsterThreatModifier/socialMobilityModifier/migrationRateModifier/economyModifier/factionEmergenceModifier。

硬性语义：
1. description是特质说明，不是人生故事。严禁年份、季节日期、具体年龄、第一次、曾经、后来、某天、过去经历、未来预言或具体会发生的事件。
2. 不得写“你路过/遇到/收到/参加/进入某处后”等传记句式；不得替角色虚构已经发生或必将发生的遭遇。
3. 可以用机制、感官、意象解释“这种特质如何运作”，但不得设置具体时间场景。
4. ${AI_DESTINY_PATTERN_BATCH_SIZE}条在能力领域、稀有度、极性和句法上保持差异，适配用户世界设定，不硬套现代/修仙/科幻模板。不得生成只有惩罚、缺陷或负面属性而没有可用收益的纯负面词条。
5. 稀有度代表影响层级而不只是数值大小：common/fine是日常、局部倾向；rare稳定影响一个个人领域；epic可跨个人领域或轻度影响周边环境；legendary允许轻度概念规则。
6. legendary的概念规则必须通过条件、概率、代价、有限触发或可被对抗的方式体现。不得自动获胜、取消代价或死亡、覆盖玩家选择、无条件改写世界，也不得每轮必定触发。
7. effect写成叙事引擎可持续遵守的规则，attrBonus/systemModifiers只做有限数值映射，不能用数值字段替代叙事影响。

字段写法示例（仅示意字段，实际输出仍必须是${AI_DESTINY_PATTERN_BATCH_SIZE}项顶层数组）：
[{"name":"结构听觉","description":"你天生能把纷杂声响拆成有层次的结构，机械振动、脚步节奏与材料裂隙在听觉中各有纹理；这种稳定辨识力让你更早察觉异常，也容易被持续噪声耗尽注意。","rarity":"fine","effect":"擅长通过声音识别结构与隐患，但容易受噪声干扰","polarity":"mixed","attrBonus":{"mind":1,"talentAptitude":1}},
{"name":"信任延迟","description":"你的信任建立得比常人缓慢，认知会持续校验语气、行为与承诺是否一致；一旦关系通过验证，你的观察与回应会变得格外稳定，很少因表面情绪改变判断。","rarity":"common","effect":"慢热谨慎，建立信任后关系稳定且洞察细致","polarity":"mixed","attrBonus":{"charisma":-1}},
{"name":"概率偏斜","description":"随机结果在你周围呈现出难以解释的轻微偏向，危险往往错开最致命的一线，稀缺机会也更容易进入可触及范围；这种偏向无法主动控制，只能提高转机出现的可能。","rarity":"legendary","effect":"遭遇重大风险时更容易出现可争取的转机，但不会取消伤害、代价或失败","polarity":"positive","attrBonus":{"talentAptitude":3,"charisma":1},"systemModifiers":{"luckPointModifier":1.18,"deathRateModifier":0.92}}]
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
    name: z.string().describe('命格名称（2-8字）'),
    description: z.string().describe('命格描述（50-120字）'),
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
).length(AI_DESTINY_PATTERN_BATCH_SIZE)

export type DestinyPatternOutput = z.infer<typeof destinyPatternOutputSchema>

export const destinyPatternPrompt: PromptTemplate<DestinyPatternOutput> = {
  name: 'destiny-pattern',
  version: '3.2.0',
  mod: 'mod-character',
  systemPrompt: DESTINY_PATTERN_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'json',
  outputSchema: destinyPatternOutputSchema,
}
