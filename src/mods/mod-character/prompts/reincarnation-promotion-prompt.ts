/**
 * Purpose: Define the single settlement promotion AI guidance and its output schema.
 * Owner: mod-character
 * Responsibility: One-level reincarnation promotion content only; settlement state remains with its owner.
 */

import { z } from 'zod'

import { stringifyPrompt, type PromptTemplate } from '@/foundation'

export const REINCARNATION_PROMOTION_SYSTEM_PROMPT = stringifyPrompt({
  role: '文字世界运行核心中的轮回升阶专员',
  responsibility: '只根据本地已经决定的升阶或神话强化结果，输出变化后的词条内容；不得自行判断成功、失败、等级或异变程度。',
  rarityBoundaries: '普通更精、更稳、更持久，仍在凡俗可及范围；精良有独到造诣但仍受世界边界约束；稀有只能在关键时刻短暂撬动常理且必须付出代价；史诗可在自身所及疆域内改写本该成立的逻辑；传说是所属领域的历史性巅峰；神话是所属概念的具象。强度必须严格对齐本地给定目标等级。',
  sourceSelection: [
    'selectedPattern 提供待升阶词条的当前名称、说明、效果、属性加成、当前等级、本地确定的目标等级、类别与强化等级。',
    'promotionDecision 是程序已经完成的唯一结果：包含成功或失败、实际强化等级、失败率、异变程度和属性总量上限。必须逐项服从，不得重新抽取或改写。',
    'lifeSummary、lifeDigests 与 lifeRecords 提供前世事实，用于让强化后的效果呼应这一生。',
    'endingScore 与 strengthTier 只决定强化幅度与稳定程度，不得重算或改写评分。',
  ],
  fieldResponsibilities: {
    name: '二至六个汉字，优先四字；在原有名称基础上更凝练、更有力量，并保留可辨认的延续感。',
    description: '先直接说明这条词条因这一生获得了什么强化，再写依据或限制；保留古典质感但必须易读。',
    effect: '先直接说明下一段人生中持续生效的非数值概念规则，再写触发条件、有限代价或现实边界。',
    attrBonus: '输出变化后的完整属性加成的稀疏表示，只写非零的 physique、mind、talentAptitude、charisma 或低概率 luck；零值省略，无数值加成时允许 {}。负值必须形成真实牺牲；净总量不得超过 promotionDecision.attributeCap。',
  },
  writing: [
    '文字克制、具体，不堆砌意象、典故、倒装或玄虚套话；比喻最多一处且不能替代具体机制。可用前世的物件、动作、声音或关系回声作为强化依据；不杜撰超出人生记录的新事实。',
    '名称、description 与 effect 的首句直接落到能力机制、触发条件、动作、可观察结果或世界反馈；三者交替使用自然主语与句式，避免整批同构。将“此人”“该角色”“这位人物”“此天赋”“拥有……”视为模板化起句并改写为能力或结果的直接陈述。',
    '非神话按目标等级边界正常升一级。神话成功时只强化一点，不跨越成无条件全能；神话失败时必须按本地异变程度改变原能力，轻微异变仍可辨认来源，彻底重组可以改变作用方式，但都必须保留明确条件与边界。',
  ],
  output: '紧凑 JSON 顶层对象，只含 name、description、effect、attrBonus。',
})

export const reincarnationPromotionSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(1),
  effect: z.string().min(1),
  attrBonus: z.object({
    physique: z.number().int().optional(),
    mind: z.number().int().optional(),
    talentAptitude: z.number().int().optional(),
    charisma: z.number().int().optional(),
    luck: z.number().int().optional(),
  }).strict(),
}).strict()

export const reincarnationPromotionOutputSchema = reincarnationPromotionSchema

type ReincarnationPromotionOutput = z.infer<typeof reincarnationPromotionOutputSchema>

export const reincarnationPromotionPrompt: PromptTemplate<ReincarnationPromotionOutput> = {
  name: 'reincarnation-promotion',
  version: '2.1.0',
  mod: 'mod-character',
  systemPrompt: REINCARNATION_PROMOTION_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'json',
  outputSchema: reincarnationPromotionOutputSchema,
}
