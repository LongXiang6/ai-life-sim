/**
 * @module destiny-pattern-prompt.ts
 * @description 命格 AI 生成 Prompt —— 单批 12 条，无时间履历的稳定天赋/特质
 * @mod mod-character
 */

import type { PromptTemplate } from '@/foundation'

import { z } from 'zod'

const DESTINY_PATTERN_SYSTEM_PROMPT = `你是命格、天赋与人格特质生成器。根据用户消息中的世界与角色信息，生成正好12条彼此不同的固有命格。

输出且只输出含正好12个对象的紧凑JSON顶层数组：[{...},{...}]，不要对象包装，不要markdown。

每条字段：
- name：2-8字。
- rarity：common/fine/rare/epic/legendary。
- polarity：positive/negative/mixed。
- description：50-110汉字，定义角色开局前已经成立且长期稳定的天赋、体质、认知方式、性格倾向或代价机制。
- effect：至少10字，概括实际影响。
- attrBonus：只写非零项。common仅单属性±1；fine总量≤2；rare≤3；epic≤5；legendary≤7。

硬性语义：
1. description是特质说明，不是人生故事。严禁年份、季节日期、具体年龄、第一次、曾经、后来、某天、过去经历、未来预言或具体会发生的事件。
2. 不得写“你路过/遇到/收到/参加/进入某处后”等传记句式；不得替角色虚构已经发生或必将发生的遭遇。
3. 可以用机制、感官、意象解释“这种特质如何运作”，但不得设置具体时间场景。
4. 12条在能力领域、稀有度、极性和句法上保持差异，适配用户世界设定，不硬套现代/修仙/科幻模板。

字段写法示例（仅示意字段，实际输出仍必须是12项顶层数组）：
[{"name":"结构听觉","description":"你天生能把纷杂声响拆成有层次的结构，机械振动、脚步节奏与材料裂隙在听觉中各有纹理；这种稳定辨识力让你更早察觉异常，也容易被持续噪声耗尽注意。","rarity":"fine","effect":"擅长通过声音识别结构与隐患，但容易受噪声干扰","polarity":"mixed","attrBonus":{"mind":1,"talentAptitude":1}},
{"name":"信任延迟","description":"你的信任建立得比常人缓慢，认知会持续校验语气、行为与承诺是否一致；一旦关系通过验证，你的观察与回应会变得格外稳定，很少因表面情绪改变判断。","rarity":"common","effect":"慢热谨慎，建立信任后关系稳定且洞察细致","polarity":"mixed","attrBonus":{"charisma":-1}},
{"name":"概率偏斜","description":"随机结果在你周围呈现出难以解释的轻微偏向，危险往往错开最致命的一线，稀缺机会也更容易进入可触及范围；这种偏向无法主动控制，只能提高转机出现的可能。","rarity":"legendary","effect":"重大风险更易出现转机，稀有机会的可达性提高","polarity":"positive","attrBonus":{"resources":2,"talentAptitude":3,"charisma":1}}]
`

export const destinyPatternOutputSchema = z.array(
  z.object({
    type: z.enum(['命格', '特征']).optional(),
    name: z.string().describe('命格名称（2-8字）'),
    description: z.string().describe('命格描述（50-120字）'),
    rarity: z.enum(['common', 'fine', 'rare', 'epic', 'legendary']).describe('稀有度'),
    polarity: z.enum(['positive', 'negative', 'mixed']).describe('极性'),
    effect: z.string().describe('效果描述'),
    attrBonus: z.object({
      physique: z.coerce.number().optional(),
      mind: z.coerce.number().optional(),
      talentAptitude: z.coerce.number().optional(),
      charisma: z.coerce.number().optional(),
      resources: z.coerce.number().optional(),
    }).optional(),
  }),
)

export type DestinyPatternOutput = z.infer<typeof destinyPatternOutputSchema>

export const destinyPatternPrompt: PromptTemplate<DestinyPatternOutput> = {
  name: 'destiny-pattern',
  version: '2.7.0',
  mod: 'mod-character',
  systemPrompt: DESTINY_PATTERN_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'json',
  outputSchema: destinyPatternOutputSchema,
}
