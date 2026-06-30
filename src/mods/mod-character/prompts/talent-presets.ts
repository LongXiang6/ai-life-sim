/**
 * @module talent-presets.ts
 * @description 天赋预设库 —— 31 条共享普通天赋，按极性分类
 * @mod mod-character
 *
 * 来源：废弃项目 lib/config/ai/talent-presets-shared.ts
 * 每条天赋含 id/name/description/rarity/effect/polarity/attrBonus
 */

/** 天赋稀有度 */
export type TalentRarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary'

/** 天赋极性 */
export type TalentPolarity = 'positive' | 'neutral' | 'negative'

/** 属性加成键 */
export type AttrBonusKey = 'physique' | 'mind' | 'talentAptitude' | 'charisma' | 'resources' | 'luck'

/** 天赋定义 */
export interface TalentPreset {
  id: string
  name: string
  description: string
  rarity: TalentRarity
  effect: string
  polarity: TalentPolarity
  attrBonus: Partial<Record<AttrBonusKey, number>>,
}

// ============================================================
// 正面天赋（13 条）
// ============================================================

const POSITIVE_TALENTS: TalentPreset[] = [
  {
    id: 'strong_body',
    name: '体魄强健',
    description: '天生体魄过人，身体素质远超常人',
    rarity: 'common',
    effect: '初始体魄+3，疾病抗性+10%',
    polarity: 'positive',
    attrBonus: { physique: 3 },
  },
  {
    id: 'sharp_mind',
    name: '思维敏捷',
    description: '脑子转得比谁都快，学习效率极高',
    rarity: 'common',
    effect: '初始心智+3，学习速度+15%',
    polarity: 'positive',
    attrBonus: { mind: 3 },
  },
  {
    id: 'natural_charm',
    name: '天生魅力',
    description: '言谈举止间自然散发吸引力',
    rarity: 'common',
    effect: '初始魅力+3，社交成功率+10%',
    polarity: 'positive',
    attrBonus: { charisma: 3 },
  },
  {
    id: 'keen_insight',
    name: '洞察入微',
    description: '能看透事物本质，悟性极高',
    rarity: 'fine',
    effect: '初始悟性+3，修炼速度+10%',
    polarity: 'positive',
    attrBonus: { talentAptitude: 3 },
  },
  {
    id: 'family_legacy',
    name: '家学渊源',
    description: '出身名门，自幼耳濡目染',
    rarity: 'fine',
    effect: '初始出身+3，初始财富+20%',
    polarity: 'positive',
    attrBonus: { resources: 3 },
  },
  {
    id: 'lucky_star',
    name: '福星高照',
    description: '运气极佳，总能化险为夷',
    rarity: 'fine',
    effect: '初始气运+2，奇遇概率+15%',
    polarity: 'positive',
    attrBonus: { luck: 2 },
  },
  {
    id: 'iron_will',
    name: '钢铁意志',
    description: '意志坚如磐石，百折不挠',
    rarity: 'rare',
    effect: '心智+4，精神抗性+20%',
    polarity: 'positive',
    attrBonus: { mind: 4 },
  },
  {
    id: 'dragon_blood',
    name: '龙血传承',
    description: '体内流淌着远古龙族血脉',
    rarity: 'rare',
    effect: '体魄+4，寿命上限+10年',
    polarity: 'positive',
    attrBonus: { physique: 4 },
  },
  {
    id: 'savant',
    name: '天纵奇才',
    description: '百年难遇的修炼奇才',
    rarity: 'epic',
    effect: '悟性+5，所有修炼速度+20%',
    polarity: 'positive',
    attrBonus: { talentAptitude: 5 },
  },
  {
    id: 'silver_tongue',
    name: '三寸不烂之舌',
    description: '口才极佳，能说会道',
    rarity: 'fine',
    effect: '魅力+3，说服成功率+20%',
    polarity: 'positive',
    attrBonus: { charisma: 3 },
  },
  {
    id: 'eagle_eye',
    name: '鹰眼锐目',
    description: '视力远超常人，能洞察细微',
    rarity: 'common',
    effect: '感知+2，侦查成功率+15%',
    polarity: 'positive',
    attrBonus: { mind: 2 },
  },
  {
    id: 'swift_reflexes',
    name: '身手矫健',
    description: '反应极快，身手敏捷',
    rarity: 'common',
    effect: '体魄+2，闪避率+10%',
    polarity: 'positive',
    attrBonus: { physique: 2 },
  },
  {
    id: 'noble_bearing',
    name: '气度不凡',
    description: '举止优雅，自带贵族气质',
    rarity: 'fine',
    effect: '魅力+2，声望获取+10%',
    polarity: 'positive',
    attrBonus: { charisma: 2 },
  },
]

// ============================================================
// 中立天赋（5 条）
// ============================================================

const NEUTRAL_TALENTS: TalentPreset[] = [
  {
    id: 'wanderer',
    name: '四海为家',
    description: '居无定所却乐在其中',
    rarity: 'common',
    effect: '移动速度+20%，但无法获得家族加成',
    polarity: 'neutral',
    attrBonus: {},
  },
  {
    id: 'night_owl',
    name: '夜猫子',
    description: '夜间精力充沛，白天昏昏欲睡',
    rarity: 'common',
    effect: '夜间效率+30%，白天效率-15%',
    polarity: 'neutral',
    attrBonus: {},
  },
  {
    id: 'bookworm',
    name: '书虫',
    description: '嗜书如命，手不释卷',
    rarity: 'common',
    effect: '学习速度+25%，但社交能力-10%',
    polarity: 'neutral',
    attrBonus: { mind: 2, charisma: -1 },
  },
  {
    id: 'hothead',
    name: '急性子',
    description: '做事雷厉风行，但容易冲动',
    rarity: 'common',
    effect: '行动速度+20%，但决策失误率+10%',
    polarity: 'neutral',
    attrBonus: {},
  },
  {
    id: 'mysterious_origin',
    name: '身世成谜',
    description: '连自己都不知道从哪来',
    rarity: 'rare',
    effect: '随机获得一个隐藏属性加成',
    polarity: 'neutral',
    attrBonus: {},
  },
]

// ============================================================
// 负面天赋（13 条）
// ============================================================

const NEGATIVE_TALENTS: TalentPreset[] = [
  {
    id: 'sickly',
    name: '体弱多病',
    description: '从小体弱，疾病缠身',
    rarity: 'common',
    effect: '初始体魄-3，疾病抗性-15%',
    polarity: 'negative',
    attrBonus: { physique: -3 },
  },
  {
    id: 'slow_learner',
    name: '驽钝愚笨',
    description: '理解能力较差，学东西慢',
    rarity: 'common',
    effect: '初始心智-3，学习速度-20%',
    polarity: 'negative',
    attrBonus: { mind: -3 },
  },
  {
    id: 'plain_looks',
    name: '相貌平平',
    description: '长相普通到让人过目即忘',
    rarity: 'common',
    effect: '初始魅力-2',
    polarity: 'negative',
    attrBonus: { charisma: -2 },
  },
  {
    id: 'poor_background',
    name: '出身寒微',
    description: '家境贫寒，资源匮乏',
    rarity: 'common',
    effect: '初始出身-3，初始财富-50%',
    polarity: 'negative',
    attrBonus: { resources: -3 },
  },
  {
    id: 'bad_luck',
    name: '霉运缠身',
    description: '运气极差，祸不单行',
    rarity: 'fine',
    effect: '初始气运-2，负面事件概率+15%',
    polarity: 'negative',
    attrBonus: { luck: -2 },
  },
  {
    id: 'short_lived',
    name: '命途多舛',
    description: '寿命上限天生较低',
    rarity: 'fine',
    effect: '寿命上限-15年',
    polarity: 'negative',
    attrBonus: {},
  },
  {
    id: 'clumsy',
    name: '笨手笨脚',
    description: '手脚不太协调',
    rarity: 'common',
    effect: '体魄-2，制作成功率-10%',
    polarity: 'negative',
    attrBonus: { physique: -2 },
  },
  {
    id: 'social_anxiety',
    name: '社交恐惧',
    description: '害怕与人交流',
    rarity: 'fine',
    effect: '魅力-3，社交成功率-20%',
    polarity: 'negative',
    attrBonus: { charisma: -3 },
  },
  {
    id: 'fragile_bones',
    name: '骨骼脆弱',
    description: '骨头容易受伤',
    rarity: 'fine',
    effect: '体魄-2，重伤概率+10%',
    polarity: 'negative',
    attrBonus: { physique: -2 },
  },
  {
    id: 'forgetful',
    name: '健忘',
    description: '记性不好，容易忘事',
    rarity: 'common',
    effect: '心智-2，学习效率-10%',
    polarity: 'negative',
    attrBonus: { mind: -2 },
  },
  {
    id: 'hot_temper',
    name: '暴脾气',
    description: '容易发怒，难以控制情绪',
    rarity: 'common',
    effect: '魅力-1，冲突概率+15%',
    polarity: 'negative',
    attrBonus: { charisma: -1 },
  },
  {
    id: 'unlucky_in_love',
    name: '情路坎坷',
    description: '感情方面总是波折不断',
    rarity: 'fine',
    effect: '恋爱成功率-20%，但失恋后成长+10%',
    polarity: 'negative',
    attrBonus: {},
  },
  {
    id: 'cursed',
    name: '天煞孤星',
    description: '命格孤克，亲近之人容易遭遇不幸',
    rarity: 'rare',
    effect: '气运-3，但个人战斗力+10%',
    polarity: 'negative',
    attrBonus: { luck: -3 },
  },
]

// ============================================================
// 全部天赋
// ============================================================

/** 全部 31 条共享天赋 */
export const ALL_SHARED_TALENTS: TalentPreset[] = [
  ...POSITIVE_TALENTS,
  ...NEUTRAL_TALENTS,
  ...NEGATIVE_TALENTS,
]

/** 按极性分组 */
export const TALENTS_BY_POLARITY = {
  positive: POSITIVE_TALENTS,
  neutral: NEUTRAL_TALENTS,
  negative: NEGATIVE_TALENTS,
} as const

/** 按稀有度分组 */
export const TALENTS_BY_RARITY: Record<TalentRarity, TalentPreset[]> = {
  common: ALL_SHARED_TALENTS.filter((t) => t.rarity === 'common'),
  fine: ALL_SHARED_TALENTS.filter((t) => t.rarity === 'fine'),
  rare: ALL_SHARED_TALENTS.filter((t) => t.rarity === 'rare'),
  epic: ALL_SHARED_TALENTS.filter((t) => t.rarity === 'epic'),
  legendary: ALL_SHARED_TALENTS.filter((t) => t.rarity === 'legendary'),
}

// ============================================================
// 预设组合
// ============================================================

/** 理想主义天赋组合（偏向正面） */
export const IDEALIST_TALENT_SET: string[] = [
  'keen_insight', 'natural_charm', 'noble_bearing', 'iron_will',
]

/** 唯物主义天赋组合（偏向实用） */
export const MATERIALIST_TALENT_SET: string[] = [
  'strong_body', 'sharp_mind', 'family_legacy', 'eagle_eye',
]

/** 冒险天赋组合（偏向行动） */
export const ADVENTURE_TALENT_SET: string[] = [
  'strong_body', 'swift_reflexes', 'lucky_star', 'eagle_eye',
]

/** 人生天赋组合（偏向平衡） */
export const LIFE_TALENT_SET: string[] = [
  'natural_charm', 'sharp_mind', 'silver_tongue', 'bookworm',
]

// ============================================================
// 辅助函数
// ============================================================

/** 根据 ID 查找天赋 */
export function findTalentById(id: string): TalentPreset | undefined {
  return ALL_SHARED_TALENTS.find((t) => t.id === id)
}

/** 从预设池中随机抽取 N 条不重复天赋 */
export function drawTalents(pool: string[], count: number): TalentPreset[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, count)
  return selected.map((id) => findTalentById(id)).filter((t): t is TalentPreset => t !== undefined)
}

/** 计算天赋列表的总属性加成 */
export function sumAttrBonus(talents: TalentPreset[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const talent of talents) {
    for (const [key, val] of Object.entries(talent.attrBonus)) {
      result[key] = (result[key] || 0) + val
    }
  }
  return result
}

