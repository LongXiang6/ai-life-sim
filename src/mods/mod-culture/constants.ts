/**
 * @module constants.ts
 * @description mod-culture 常量 —— 声望/关系/家族/教育/文化/艺术/弟子/个人能力/成就/著作
 * @mod mod-culture
 */

import type {
  ReputationDimension,
  EducationSystemType,
  EducationQuality,
  CulturalValue,
  ArtForm,
  RelationshipType,
  FamilyRole,
  SpouseStatus,
  AchievementRarity,
  Achievement,
  CustomCategory,
  DiscipleStatus,
} from './types'

export { round, clamp, pickRandom, randomInRange, ROUND_DECIMALS } from './utils'

// ============================================================
// §1 声望常量
// ============================================================

/** 声望维度标签 */
export const REPUTATION_LABELS: Record<ReputationDimension, string> = {
  military: '武勋',
  political: '政绩',
  academic: '学术',
  economic: '财富',
  moral: '道德',
  religious: '信仰',
}

/** 声望范围 */
export const REPUTATION_RANGE = { min: -100, max: 100 }

/** 声望数值 → 等级标签映射（降序排列，首项为最高级） */
export const REPUTATION_RANK_THRESHOLDS: { threshold: number; label: string }[] = [
  { threshold: 80, label: '崇敬' },
  { threshold: 60, label: '尊敬' },
  { threshold: 20, label: '友好' },
  { threshold: -20, label: '中立' },
  { threshold: -60, label: '冷淡' },
  { threshold: -80, label: '敌对' },
  { threshold: -Infinity, label: '仇视' },
]

/** 将声望数值映射为等级标签
 * @param value 声望数值
 * @returns 声望等级标签
 */
export function getReputationRank(value: number): string {
  for (const rank of REPUTATION_RANK_THRESHOLDS) {
    if (value >= rank.threshold) return rank.label
  }
  return '仇视'
}

// ============================================================
// §2 关系常量
// ============================================================

/** 关系类型标签 */
export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  friend: '朋友',
  enemy: '敌人',
  rival: '对手',
  mentor: '导师',
  student: '弟子',
  lover: '恋人',
  spouse: '配偶',
  family: '亲属',
  ally: '盟友',
  neutral: '中立',
}

/** 好感度自然衰减/年（距离上次互动） */
export const AFFINITY_DECAY_PER_YEAR = 2

/** 好感度范围 */
export const AFFINITY_RANGE = { min: -100, max: 100 }

/** 羁绊类型标签 */
export const BOND_TYPE_LABELS: Record<string, string> = {
  oath_of_brotherhood: '结义',
  master_disciple: '师徒',
  life_saving_debt: '救命之恩',
  sworn_enemy: '血仇',
  political_marriage: '政治婚姻',
  blood_pact: '血盟',
  fate_bond: '命运纽带',
  mutual_benefit: '互利',
}

/** 好感度 → 关系状态标签映射 */
export const RELATIONSHIP_STATUS_THRESHOLDS: { threshold: number; label: string; description: string }[] = [
  { threshold: 80, label: '友谊深厚', description: '莫逆之交，肝胆相照' },
  { threshold: 50, label: '相谈甚欢', description: '志趣相投，交往密切' },
  { threshold: 20, label: '点头之交', description: '偶有往来，尚未深交' },
  { threshold: -20, label: '萍水相逢', description: '素未谋面，互不相识' },
  { threshold: -50, label: '话不投机', description: '观点相左，少有往来' },
  { threshold: -80, label: '势如水火', description: '针锋相对，互不相容' },
  { threshold: -Infinity, label: '不共戴天', description: '血海深仇，你死我活' },
]

/** 将好感度映射为关系状态标签
 * @param affinity 好感度数值
 * @returns 关系状态标签及描述
 */
export function getRelationshipStatus(affinity: number): { label: string; description: string } {
  for (const s of RELATIONSHIP_STATUS_THRESHOLDS) {
    if (affinity >= s.threshold) return { label: s.label, description: s.description }
  }
  return { label: '不共戴天', description: '血海深仇，你死我活' }
}

/** 盟友原型定义（8 种） */
export const ALLY_PROTOTYPES: import('./types').AllyArchetype[] = [
  {
    id: 'loyal_companion',
    name: '忠勇之士',
    personality: '性情耿直，重情重义，愿为主公赴汤蹈火',
    initialAffinity: 60,
    preferredLifeStages: ['青年', '中年'],
    worldviewWeights: { historical: 0.8, wuxia: 0.9, cultivation: 0.7, xuanhuan: 0.7, western_fantasy: 0.8, scifi: 0.6, post_apocalyptic: 0.9, mythology: 0.7 },
    narrativeHook: '曾在危难之际出手相助，从此誓死追随',
  },
  {
    id: 'mysterious_senior',
    name: '神秘前辈',
    personality: '深不可测，行踪飘忽，看似冷漠却暗中关照',
    initialAffinity: 40,
    preferredLifeStages: ['少年', '青年'],
    worldviewWeights: { historical: 0.5, wuxia: 0.8, cultivation: 0.9, xuanhuan: 0.9, western_fantasy: 0.7, scifi: 0.4, post_apocalyptic: 0.3, mythology: 0.8 },
    narrativeHook: '总在关键时刻现身，留下意味深长的指点后飘然离去',
  },
  {
    id: 'fierce_rival',
    name: '宿敌',
    personality: '实力相当，亦敌亦友，互相成就也互相折磨',
    initialAffinity: -30,
    preferredLifeStages: ['少年', '青年', '中年'],
    worldviewWeights: { historical: 0.7, wuxia: 0.9, cultivation: 0.8, xuanhuan: 0.8, western_fantasy: 0.7, scifi: 0.6, post_apocalyptic: 0.7, mythology: 0.7 },
    narrativeHook: '命中注定的对手——你曾败于他手，但那场失败让你脱胎换骨',
  },
  {
    id: 'childhood_friend',
    name: '青梅竹马',
    personality: '温柔体贴，知根知底，是世间最了解你的人',
    initialAffinity: 80,
    preferredLifeStages: ['童年', '少年'],
    worldviewWeights: { historical: 0.8, wuxia: 0.8, cultivation: 0.7, xuanhuan: 0.6, western_fantasy: 0.8, scifi: 0.7, post_apocalyptic: 0.6, mythology: 0.6 },
    narrativeHook: '自幼一起长大的挚友，你们之间有数不清的共同回忆',
  },
  {
    id: 'wise_mentor',
    name: '睿智导师',
    personality: '学识渊博，循循善诱，望你青出于蓝而胜于蓝',
    initialAffinity: 65,
    preferredLifeStages: ['少年', '青年'],
    worldviewWeights: { historical: 0.9, wuxia: 0.8, cultivation: 0.8, xuanhuan: 0.7, western_fantasy: 0.9, scifi: 0.8, post_apocalyptic: 0.5, mythology: 0.7 },
    narrativeHook: '慧眼识珠，收你为徒，倾囊相授毕生所学',
  },
  {
    id: 'devoted_servant',
    name: '忠仆',
    personality: '忠心耿耿，任劳任怨，为主人可以牺牲一切',
    initialAffinity: 90,
    preferredLifeStages: ['中年', '老年'],
    worldviewWeights: { historical: 0.7, wuxia: 0.6, cultivation: 0.5, xuanhuan: 0.5, western_fantasy: 0.7, scifi: 0.3, post_apocalyptic: 0.8, mythology: 0.5 },
    narrativeHook: '世代侍奉家族的忠仆，见证了你从小到大的成长',
  },
  {
    id: 'stalwart_ally',
    name: '铁杆盟友',
    personality: '志同道合，利益一致，可托付后背的可靠伙伴',
    initialAffinity: 50,
    preferredLifeStages: ['青年', '中年', '老年'],
    worldviewWeights: { historical: 0.8, wuxia: 0.7, cultivation: 0.6, xuanhuan: 0.6, western_fantasy: 0.8, scifi: 0.9, post_apocalyptic: 0.8, mythology: 0.6 },
    narrativeHook: '在一次关键行动中与你并肩作战，结下深厚情谊',
  },
  {
    id: 'reformed_villain',
    name: '洗白反派',
    personality: '曾经敌对，被你的气度折服后改邪归正，亦正亦邪',
    initialAffinity: 20,
    preferredLifeStages: ['青年', '中年'],
    worldviewWeights: { historical: 0.5, wuxia: 0.7, cultivation: 0.7, xuanhuan: 0.7, western_fantasy: 0.6, scifi: 0.5, post_apocalyptic: 0.6, mythology: 0.6 },
    narrativeHook: '曾是不共戴天的仇敌，却被你的宽容与气度感化，弃暗投明',
  },
]

// ============================================================
// §3 家族常量
// ============================================================

/** 家族角色标签 */
export const FAMILY_ROLE_LABELS: Record<FamilyRole, string> = {
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  cousin: '堂表亲',
  ancestor: '先祖',
}

/** 最大子女数 */
export const MAX_CHILDREN = 6

/** 生育概率/年 */
export const BIRTH_PROBABILITY = 0.08

/** 配偶关系状态标签 */
export const SPOUSE_STATUS_LABELS: Record<SpouseStatus, string> = {
  happy: '幸福',
  strained: '紧张',
  estranged: '疏远',
  widowed: '丧偶',
}

/** 婚姻满意度年衰减量 */
export const MARRIAGE_SATISFACTION_DECAY = 2

/** 婚姻冲突财富阈值（低于此值冲突概率增加） */
export const MARRIAGE_CONFLICT_WEALTH_THRESHOLD = 300

/** 婚姻修复概率/年（wealth > 阈值时） */
export const MARRIAGE_REPAIR_PROBABILITY = 0.15

/** 婚姻修复量 */
export const MARRIAGE_REPAIR_AMOUNT = 3

/** 子女里程碑年龄 */
export const MILESTONE_SCHOOL_AGE = 7
export const MILESTONE_ADULT_AGE = 18
export const MILESTONE_MARRIAGE_AGE = 20

/** 子女成年后每年婚嫁概率 */
export const CHILD_MARRIAGE_PROBABILITY = 0.08

/** 子女婚嫁后独立概率 */
export const CHILD_INDEPENDENT_PROBABILITY = 0.15

// ============================================================
// §4 教育常量
// ============================================================

/** 教育制度标签 */
export const EDUCATION_SYSTEM_LABELS: Record<EducationSystemType, string> = {
  private: '私塾',
  public: '官学',
  religious: '寺院教育',
  guild: '行会教育',
  academy: '学院',
}

/** 教育机构名池 */
export const EDUCATION_INSTITUTION_POOL: readonly string[] = [
  '太学', '国子监', '翰林院', '书院', '私塾', '寺学',
  '道观学堂', '经院', '大学', '研究院', '行会学校', '宗学',
]

/** 识字率初始值 */
export const DEFAULT_LITERACY_RATE = 15

/** 教育普及度初始值 */
export const DEFAULT_EDUCATION_ACCESS = 10

/** 基础科研产出 */
export const BASE_RESEARCH_OUTPUT = 1

/** 知识传播速率基础值 */
export const KNOWLEDGE_SPREAD_RATE_DEFAULT = 0.05
/** 知识传播速率年变化阈值（繁荣>30→+0.002，繁荣<10→-0.003） */
export const KNOWLEDGE_SPREAD_BOOST_THRESHOLD = 30
export const KNOWLEDGE_SPREAD_DECAY_THRESHOLD = 10
export const KNOWLEDGE_SPREAD_BOOST_RATE = 0.002
export const KNOWLEDGE_SPREAD_DECAY_RATE = 0.003

/** 教育水平 → 知识获取乘数 */
export const EDUCATION_KNOWLEDGE_MOD: Record<string, number> = {
  none: 0.3, elite: 0.8, basic: 1.2, universal: 1.8, advanced: 2.5,
}

/** 教育水平 → 科技革新乘数 */
export const EDUCATION_INNOVATION_MOD: Record<string, number> = {
  none: 0.5, elite: 0.7, basic: 1.0, universal: 1.5, advanced: 2.0,
}

/** 教育水平标签 */
export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  none: '无教育', elite: '精英教育', basic: '基础教育', universal: '普及教育', advanced: '高等教育',
}

/** 教育方向标签 */
export const EDUCATION_DIRECTION_LABELS: Record<string, string> = {
  general: '通识', vocational: '职业', classical: '经典', scientific: '科学', mystical: '神秘学',
}

/** 教育质量标签 */
export const EDUCATION_QUALITY_LABELS: Record<EducationQuality, string> = {
  poor: '教育质量低下',
  adequate: '教育尚可',
  good: '教育良好',
  excellent: '教育优异',
}

/** 各阶层初始识字率（按世界观档位） */
export const LITERACY_BY_CLASS_DEFAULT: Record<string, { elite: number; middle: number; common: number }> = {
  default: { elite: 85, middle: 50, common: 30 },
  primitive: { elite: 60, middle: 25, common: 10 },
  advanced: { elite: 98, middle: 80, common: 65 },
}

/** 世界观 → 识字率档位映射 */
export const WORLDVIEW_LITERACY_MAP: Record<string, string> = {
  historical: 'default',
  wuxia: 'default',
  mythology: 'default',
  cultivation: 'default',
  xuanhuan: 'default',
  western_fantasy: 'default',
  scifi: 'advanced',
  post_apocalyptic: 'primitive',
}

// ============================================================
// §5 文化常量
// ============================================================

/** 文化价值标签 */
export const CULTURAL_VALUE_LABELS: Record<CulturalValue, string> = {
  collectivism: '集体主义',
  individualism: '个人主义',
  hierarchy: '等级制',
  egalitarianism: '平等主义',
  militarism: '尚武',
  pacifism: '和平主义',
  spiritualism: '灵性',
  materialism: '物质主义',
}

/** 内置节日模板池（带世界观分层） */
export const FESTIVAL_TEMPLATES: readonly {
  name: string; date: string; description: string; importance: number; worldTypes?: string[]; frequencyYears?: number; effects?: Record<string, number>
}[] = [
  // === 通用 ===
  { name: '春节', date: '1-1', description: '辞旧迎新，阖家团圆', importance: 5, worldTypes: [], frequencyYears: 1, effects: { charisma: 1, luck: 1 } },
  { name: '丰收节', date: '9-15', description: '庆祝秋收，感恩大地', importance: 4, worldTypes: [], frequencyYears: 1, effects: { resources: 2 } },
  { name: '祭祖日', date: '4-5', description: '缅怀先祖，传承家风', importance: 4, worldTypes: [], frequencyYears: 1, effects: { tradition: 1 } },
  { name: '夏至节', date: '6-21', description: '阳气最盛之日，祈福消灾', importance: 3, worldTypes: [], frequencyYears: 1 },
  { name: '冬至节', date: '12-21', description: '阴极阳生，进补养身', importance: 3, worldTypes: [], frequencyYears: 1 },
  // === cultivation/xuanhuan ===
  { name: '灵气潮汐日', date: '3-15', description: '灵气潮汐涌动的日子，修炼事半功倍', importance: 5, worldTypes: ['cultivation', 'xuanhuan'], frequencyYears: 1, effects: { physique: 1, talentAptitude: 1 } },
  { name: '仙盟大会', date: '7-7', description: '修仙各派齐聚的盛会，论道比武', importance: 4, worldTypes: ['cultivation', 'xuanhuan'], frequencyYears: 5 },
  { name: '丹道节', date: '10-10', description: '炼丹师的节日，开炉炼丹的最佳时刻', importance: 3, worldTypes: ['cultivation', 'xuanhuan'], frequencyYears: 1 },
  // === western_fantasy/mythology ===
  { name: '隆冬盛典', date: '12-24', description: '隆冬时节最盛大的节日，万家灯火', importance: 5, worldTypes: ['western_fantasy', 'mythology'], frequencyYears: 1, effects: { charisma: 2 } },
  { name: '法师竞技会', date: '6-6', description: '法师们展示魔法的竞技盛会', importance: 3, worldTypes: ['western_fantasy'], frequencyYears: 3, effects: { intelligence: 1 } },
  // === scifi ===
  { name: '接触纪念日', date: '3-30', description: '纪念首次与外星文明接触的日子', importance: 4, worldTypes: ['scifi'], frequencyYears: 1 },
  { name: 'AI 觉醒日', date: '8-17', description: '人工智能首次获得自我意识的纪念日', importance: 4, worldTypes: ['scifi'], frequencyYears: 1 },
  // === post_apocalyptic ===
  { name: '重生日', date: '5-5', description: '纪念末日之后文明重生的日子', importance: 5, worldTypes: ['post_apocalyptic'], frequencyYears: 1, effects: { hope: 2 } },
  // === historical/wuxia ===
  { name: '上元灯节', date: '2-15', description: '上元佳节，花灯如昼', importance: 4, worldTypes: ['historical', 'wuxia'], frequencyYears: 1 },
]

/** 内置仪式模板池（带世界观分层+触发条件） */
export const RITUAL_TEMPLATES: readonly {
  name: string; category: string; description: string; worldTypes?: string[]; triggerCondition?: string; traditionImpact?: number
}[] = [
  { name: '诞生礼', category: 'birth', description: '新生儿命名与祝福仪式', worldTypes: [], traditionImpact: 1 },
  { name: '成人礼', category: 'coming_of_age', description: '少年步入成年的标志仪式', worldTypes: [], triggerCondition: '角色年满16岁', traditionImpact: 2 },
  { name: '婚礼', category: 'marriage', description: '缔结婚姻盟约的庆典', worldTypes: [], traditionImpact: 2 },
  { name: '葬礼', category: 'death', description: '送别逝者、安抚亡魂的仪式', worldTypes: [], traditionImpact: 1 },
  { name: '丰收祭', category: 'harvest', description: '感谢天地赐予丰收的祭祀', worldTypes: [], traditionImpact: 1 },
  { name: '出征礼', category: 'war', description: '军队出征前的祈福仪式', worldTypes: [], triggerCondition: '国家进入战争状态', traditionImpact: 3 },
  { name: '祭天礼', category: 'worship', description: '祭祀天地的最高礼仪', worldTypes: [], triggerCondition: '新君王/领袖上位', traditionImpact: 3 },
  // === cultivation ===
  { name: '筑基开光', category: 'coming_of_age', description: '筑基修士的开光仪式，正式迈入修行', worldTypes: ['cultivation', 'xuanhuan'], triggerCondition: '角色突破筑基期', traditionImpact: 2 },
  { name: '师徒契', category: 'worship', description: '拜师收徒的正式仪式，天地为证', worldTypes: ['cultivation', 'xuanhuan', 'wuxia'], triggerCondition: '缔结师徒关系', traditionImpact: 2 },
  // === western_fantasy ===
  { name: '骑士册封', category: 'coming_of_age', description: '骑士受封的庄严仪式', worldTypes: ['western_fantasy', 'mythology'], triggerCondition: '角色证明了自己的勇武', traditionImpact: 3 },
  // === scifi ===
  { name: '基因净化礼', category: 'coming_of_age', description: '基因优化改造的成年仪式', worldTypes: ['scifi'], triggerCondition: '角色年满18岁', traditionImpact: 1 },
]

/** 内置禁忌模板池（带世界观分层+传统影响） */
export const TABOO_TEMPLATES: readonly {
  action: string; severity: 'mild' | 'moderate' | 'severe' | 'capital'; consequence: string; worldTypes?: string[]; traditionImpactOnViolation?: number
}[] = [
  { action: '渎神', severity: 'severe', consequence: '火刑', traditionImpactOnViolation: -10 },
  { action: '弑亲', severity: 'capital', consequence: '凌迟', traditionImpactOnViolation: -20 },
  { action: '叛国', severity: 'severe', consequence: '灭族', traditionImpactOnViolation: -15 },
  { action: '偷窃', severity: 'moderate', consequence: '杖刑', traditionImpactOnViolation: -3 },
  { action: '通奸', severity: 'moderate', consequence: '沉塘', traditionImpactOnViolation: -5 },
  { action: '诽谤', severity: 'mild', consequence: '罚款', traditionImpactOnViolation: -2 },
  { action: '浪费粮食', severity: 'mild', consequence: '劳役', traditionImpactOnViolation: -1 },
  // === cultivation ===
  { action: '修炼禁术', severity: 'capital', consequence: '心魔侵蚀，修为倒退', worldTypes: ['cultivation', 'xuanhuan'], traditionImpactOnViolation: -15 },
  { action: '背叛师门', severity: 'severe', consequence: '废除修为，逐出宗门', worldTypes: ['cultivation', 'xuanhuan', 'wuxia'], traditionImpactOnViolation: -12 },
  // === scifi ===
  { action: 'AI 叛乱', severity: 'capital', consequence: '全网通缉，失去所有数字身份', worldTypes: ['scifi'], traditionImpactOnViolation: -15 },
  // === western_fantasy ===
  { action: '黑魔法研究', severity: 'severe', consequence: '被法师协会封印魔力', worldTypes: ['western_fantasy', 'mythology'], traditionImpactOnViolation: -10 },
]

/** 内置习俗模板池（带世界观分层 + 周期性触发） */
export const CUSTOM_TEMPLATES: readonly {
  name: string; category: CustomCategory; description: string; importance: number; worldTypes?: string[]; frequencyYears?: number; effects?: Record<string, number>; traditionImpact?: number
}[] = [
  // === 通用（worldTypes: [] = 所有世界观） ===
  { name: '问候礼', category: 'greeting', description: '日常见面时的基本礼节性仪式', importance: 2, worldTypes: [], frequencyYears: 1, effects: { charisma: 0.3 }, traditionImpact: 0.3 },
  { name: '成年礼', category: 'coming_of_age', description: '少年步入成年的标志性过渡仪式', importance: 4, worldTypes: [], frequencyYears: 1, effects: { tradition: 0.5 }, traditionImpact: 2 },
  { name: '婚礼', category: 'marriage', description: '缔结婚姻盟约的隆重庆典', importance: 5, worldTypes: [], frequencyYears: 1, effects: { charisma: 1, luck: 0.5 }, traditionImpact: 2 },
  { name: '葬礼', category: 'funeral', description: '送别逝者、安抚亡魂的庄严仪式', importance: 4, worldTypes: [], frequencyYears: 1, effects: { tradition: 0.5 }, traditionImpact: 1.5 },
  // === historical / wuxia ===
  { name: '拱手礼', category: 'greeting', description: '双手抱拳的东方传统问候礼', importance: 2, worldTypes: ['historical', 'wuxia'], frequencyYears: 1, effects: { charisma: 0.5 }, traditionImpact: 0.5 },
  { name: '及笄礼', category: 'coming_of_age', description: '女子十五岁成年的笄礼仪式', importance: 4, worldTypes: ['historical', 'wuxia'], frequencyYears: 1, effects: { tradition: 1 }, traditionImpact: 2.5 },
  { name: '冠礼', category: 'coming_of_age', description: '男子二十岁成年的冠礼仪式', importance: 4, worldTypes: ['historical', 'wuxia'], frequencyYears: 1, effects: { tradition: 1 }, traditionImpact: 2.5 },
  { name: '六礼婚', category: 'marriage', description: '纳采、问名、纳吉、纳征、请期、亲迎六礼齐备的正式婚礼', importance: 5, worldTypes: ['historical', 'wuxia'], frequencyYears: 1, effects: { charisma: 2, luck: 1 }, traditionImpact: 3 },
  { name: '土葬礼', category: 'funeral', description: '入土为安的传统丧葬仪轨', importance: 4, worldTypes: ['historical', 'wuxia'], frequencyYears: 1, effects: { tradition: 1 }, traditionImpact: 1.5 },
  // === cultivation / xuanhuan ===
  { name: '抱拳礼', category: 'greeting', description: '修士之间以道门礼数互相致意', importance: 2, worldTypes: ['cultivation', 'xuanhuan'], frequencyYears: 1, effects: { charisma: 0.3 }, traditionImpact: 0.5 },
  { name: '筑基开光礼', category: 'coming_of_age', description: '筑基成功后举行的开光仪式，正式迈入修真', importance: 5, worldTypes: ['cultivation', 'xuanhuan'], frequencyYears: 1, effects: { physique: 1, talentAptitude: 1 }, traditionImpact: 3 },
  { name: '双修大典', category: 'marriage', description: '修仙道侣的灵魂双修合籍典礼', importance: 5, worldTypes: ['cultivation', 'xuanhuan'], frequencyYears: 1, effects: { physique: 0.5, talentAptitude: 0.5 }, traditionImpact: 2.5 },
  { name: '天葬礼', category: 'funeral', description: '将遗体归于天地、令魂魄超脱的修真葬仪', importance: 4, worldTypes: ['cultivation', 'xuanhuan'], frequencyYears: 1, effects: { tradition: 0.5 }, traditionImpact: 1.5 },
  // === western_fantasy / mythology ===
  { name: '鞠躬礼', category: 'greeting', description: '躬身致意的西方传统礼节', importance: 2, worldTypes: ['western_fantasy', 'mythology'], frequencyYears: 1, effects: { charisma: 0.4 }, traditionImpact: 0.3 },
  { name: '骑士受封礼', category: 'coming_of_age', description: '骑士晋升的册封宣誓典礼', importance: 4, worldTypes: ['western_fantasy', 'mythology'], frequencyYears: 1, effects: { charisma: 1 }, traditionImpact: 2 },
  { name: '教堂婚礼', category: 'marriage', description: '在神明见证下缔结婚约的宗教婚礼', importance: 5, worldTypes: ['western_fantasy', 'mythology'], frequencyYears: 1, effects: { charisma: 1, luck: 1 }, traditionImpact: 2 },
  { name: '火化礼', category: 'funeral', description: '以圣火净化遗体的丧葬仪式', importance: 3, worldTypes: ['western_fantasy', 'mythology'], frequencyYears: 1, effects: { tradition: 0.5 }, traditionImpact: 1 },
  // === scifi ===
  { name: '握手法', category: 'greeting', description: '标准星际礼节——右手相握', importance: 1, worldTypes: ['scifi'], frequencyYears: 1, effects: { charisma: 0.2 }, traditionImpact: 0.1 },
  { name: '基因成年礼', category: 'coming_of_age', description: '基因优化改造完成后的成年认证', importance: 3, worldTypes: ['scifi'], frequencyYears: 1, effects: { intelligence: 0.5 }, traditionImpact: 1 },
  { name: '星盟婚礼', category: 'marriage', description: '星盟公证下的简约高效婚礼', importance: 3, worldTypes: ['scifi'], frequencyYears: 1, effects: { charisma: 0.5 }, traditionImpact: 0.5 },
  { name: '星葬', category: 'funeral', description: '将骨灰发射至星空的未来葬仪', importance: 3, worldTypes: ['scifi'], frequencyYears: 1, effects: { charisma: 0.3 }, traditionImpact: 0.3 },
  // === post_apocalyptic ===
  { name: '点头礼', category: 'greeting', description: '废土上最简洁的问候——点头示意', importance: 1, worldTypes: ['post_apocalyptic'], frequencyYears: 1, effects: { charisma: 0.1 }, traditionImpact: 0.1 },
  { name: '生存试炼礼', category: 'coming_of_age', description: '通过废土生存试炼后的成年仪式', importance: 4, worldTypes: ['post_apocalyptic'], frequencyYears: 1, effects: { physique: 1 }, traditionImpact: 1.5 },
  { name: '废土盟约', category: 'marriage', description: '幸存者以血与铁盟誓的生存婚姻', importance: 4, worldTypes: ['post_apocalyptic'], frequencyYears: 1, effects: { physique: 0.5 }, traditionImpact: 1 },
  { name: '回归礼', category: 'funeral', description: '将逝者归还废土的自然葬仪', importance: 3, worldTypes: ['post_apocalyptic'], frequencyYears: 1, effects: { tradition: 0.3 }, traditionImpact: 0.8 },
]

/** 改革压力阈值 */
export const REFORM_PRESSURE_CRASH = 90      // 压力>90 → 传统崩盘
export const REFORM_PRESSURE_REVIVAL = 70     // 压力>70 → 文化复兴
export const REFORM_PRESSURE_CONSOLIDATE = 30 // 压力<30 → 传统巩固
export const REFORM_RESISTANCE_WEIGHT = 0.7   // 改革阻力 = strength×0.7 + inertia×0.3
export const INERTIA_WEIGHT = 0.3
export const REFORM_CRASH_DROP = -30          // 崩盘时传统强度下降量
export const REFORM_REVIVAL_BOOST = 15        // 复兴时传统强度上升量
export const REFORM_CONSOLIDATE_BOOST = 1     // 巩固时每年+1
export const TRADITION_NATURAL_DECAY = -0.1   // 正常状态下每年自然衰减
export const CUSTOMS_TRIGGER_COOLDOWN = 1     // 习俗触发冷却年数（同样习俗不重复触发）

// ============================================================
// §6 艺术常量
// ============================================================

/** 艺术形式标签 */
export const ART_FORM_LABELS: Record<ArtForm, string> = {
  literature: '文学',
  painting: '绘画',
  music: '音乐',
  sculpture: '雕塑',
  architecture: '建筑',
  theater: '戏剧',
  dance: '舞蹈',
}

/** 艺术流派名池（默认兜底） */
export const ART_STYLE_POOL: readonly string[] = [
  '古典主义', '浪漫主义', '现实主义', '印象派', '表现主义',
  '宫廷画派', '文人画', '水墨山水', '工笔花鸟', '书法艺术',
]

/** 世界观分层风格演化序列（世界观 → 风格 ID 有序数组） */
export const WORLDVIEW_STYLE_POOLS: Record<string, readonly string[]> = {
  historical: ['classical', 'realism', 'romantic', 'modern', 'postmodern', 'experimental'],
  wuxia: ['classical', 'realism', 'romantic', 'modern', 'postmodern', 'experimental'],
  mythology: ['classical', 'realism', 'romantic', 'modern', 'postmodern', 'experimental'],
  cultivation: ['ancient', 'medieval', 'early_modern', 'late_modern', 'xianxia', 'innovative'],
  xuanhuan: ['ancient', 'medieval', 'early_modern', 'late_modern', 'xianxia', 'innovative'],
  western_fantasy: ['tribal', 'classical', 'gothic', 'renaissance', 'arcane_realist', 'experimental'],
  scifi: ['functionalism', 'bio_organic', 'holographic', 'quantum_aesthetic', 'transdimensional'],
  post_apocalyptic: ['lost', 'utilitarian', 'revival', 'wasteland_aesthetic', 'new_age'],
}

/** 默认风格演化序列（用于未知世界观） */
export const DEFAULT_STYLE_EVOLUTION: readonly string[] = [
  'classical', 'realism', 'romantic', 'modern', 'postmodern', 'experimental',
]

/** 风格中文标签 */
export const STYLE_CHINESE_LABELS: Record<string, string> = {
  classical: '古典主义',
  realism: '写实主义',
  romantic: '浪漫主义',
  modern: '现代主义',
  postmodern: '后现代主义',
  experimental: '实验艺术',
  ancient: '上古风格',
  medieval: '中古风格',
  early_modern: '近古风格',
  late_modern: '当代风格',
  xianxia: '修仙美学',
  innovative: '创新风格',
  tribal: '部落艺术',
  gothic: '哥特艺术',
  renaissance: '文艺复兴',
  arcane_realist: '奥术写实',
  functionalism: '功能主义',
  bio_organic: '生物有机',
  holographic: '全息艺术',
  quantum_aesthetic: '量子美学',
  transdimensional: '跨维度艺术',
  lost: '失传风格',
  utilitarian: '实用主义',
  revival: '复兴风格',
  wasteland_aesthetic: '废土美学',
  new_age: '新纪元艺术',
}

// ============================================================
// §7 弟子常量
// ============================================================

/** 初始弟子容量 */
export const INITIAL_DISCIPLE_CAPACITY = 3

/** 最大弟子容量 */
export const MAX_DISCIPLE_CAPACITY = 12

/** 弟子名池 */
export const DISCIPLE_NAME_PREFIXES: readonly string[] = [
  '青', '云', '风', '雨', '雷', '电', '山', '海', '天', '地',
  '明', '暗', '晨', '夕', '春', '夏', '秋', '冬', '龙', '凤',
]

/** 弟子阶段中文标签 */
export const DISCIPLE_STATUS_LABELS: Record<DiscipleStatus, string> = {
  apprentice: '入门',
  mature: '出师',
  famous: '名扬',
  deceased: '已故',
  departed: '远离',
}

// ============================================================
// §8 个人能力常量
// ============================================================

/** 基础技能容量 */
export const BASE_SKILL_CAP = 10

/** 技能衰退基础速率 */
export const BASE_SKILL_DECAY = 0.5

/** 知识遗忘基础速率 */
export const BASE_KNOWLEDGE_FORGET_RATE = 0.03

/** 默认技能名池 */
export const DEFAULT_SKILL_NAMES: readonly string[] = [
  '剑术', '弓术', '骑术', '医术', '书法', '绘画', '音律',
  '棋艺', '厨艺', '园艺', '锻造', '制陶', '纺织', '酿酒',
  '占卜', '炼丹', '阵法', '符箓', '机关术', '驯兽',
]

/** 技能等级 → 叙事标签映射 */
export const SKILL_LEVEL_LABELS: { threshold: number; label: string }[] = [
  { threshold: 10, label: '传奇' },
  { threshold: 8, label: '大师' },
  { threshold: 6, label: '精通' },
  { threshold: 4, label: '熟练' },
  { threshold: 1, label: '初学者' },
  { threshold: -Infinity, label: '未入门' },
]

/** 根据等级获取技能叙事标签
 * @param level 技能等级数值
 * @returns 技能等级叙事标签
 */
export function getSkillLevelLabel(level: number): string {
  for (const entry of SKILL_LEVEL_LABELS) {
    if (level >= entry.threshold) return entry.label
  }
  return '未入门'
}

/** 知识类别中文标签 */
export const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  location: '地点',
  person: '人物',
  item: '物品',
  event: '事件',
  secret: '秘密',
  skill: '技能',
}

/** 知识准确度标签阈值 */
export const KNOWLEDGE_ACCURACY_LABELS: { threshold: number; label: string }[] = [
  { threshold: 86, label: '精准' },
  { threshold: 61, label: '准确' },
  { threshold: 31, label: '大体正确' },
  { threshold: 0, label: '模糊' },
]

/** 根据准确度获取知识标签
 * @param accuracy 知识准确度数值
 * @returns 知识准确度标签
 */
export function getKnowledgeAccuracyLabel(accuracy: number): string {
  for (const entry of KNOWLEDGE_ACCURACY_LABELS) {
    if (accuracy >= entry.threshold) return entry.label
  }
  return '模糊'
}

/** 角色基础属性键列表 */
export const ATTRIBUTE_KEYS: readonly string[] = [
  'physique',   // 体质 — 影响体能类技能学习速率
  'intelligence', // 智力 — 影响学术类技能学习速率
  'talent',     // 悟性 — 影响所有技能学习速率
]

/** 属性中文标签 */
export const ATTRIBUTE_LABELS: Record<string, string> = {
  physique: '体质',
  intelligence: '智力',
  talent: '悟性',
}

/** 基础属性默认值 */
export const DEFAULT_ATTRIBUTE_VALUES: Record<string, number> = {
  physique: 50,
  intelligence: 50,
  talent: 50,
}

// ============================================================
// §9 成就常量
// ============================================================

/** 成就模板（含运行时评测函数） */
export interface AchievementTemplate {
  id: string
  name: string
  description: string
  points: number
  category: Achievement['category']
  rarity: AchievementRarity
  icon: string
  evaluate: (conditions: Record<string, number | boolean>) => boolean
}

/** 预设成就池（18 条，含稀有度/图标/条件函数） */
export const ACHIEVEMENT_TEMPLATES: AchievementTemplate[] = [
  // ── 经济（3） ──
  { id: 'first_trade', name: '第一桶金', description: '完成第一次贸易', points: 10, category: 'economic', rarity: 'common', icon: '💰', evaluate: (c) => c.firstTrade === true },
  { id: 'wealth_1000', name: '小富即安', description: '积累 1000 财富', points: 20, category: 'economic', rarity: 'common', icon: '📈', evaluate: (c) => typeof c.wealth === 'number' && c.wealth >= 1000 },
  { id: 'wealth_10000', name: '富甲一方', description: '积累 10000 财富', points: 50, category: 'economic', rarity: 'rare', icon: '👑', evaluate: (c) => typeof c.wealth === 'number' && c.wealth >= 10000 },
  // ── 社会（3） ──
  { id: 'friend_5', name: '广交友', description: '拥有 5 个朋友', points: 10, category: 'social', rarity: 'common', icon: '🤝', evaluate: (c) => typeof c.friendCount === 'number' && c.friendCount >= 5 },
  { id: 'noble_rank', name: '加官进爵', description: '晋升贵族阶层', points: 30, category: 'social', rarity: 'rare', icon: '🏅', evaluate: (c) => c.isNoble === true },
  { id: 'social_butterfly', name: '社交达人', description: '拥有 20 个朋友', points: 30, category: 'relationship', rarity: 'rare', icon: '🦋', evaluate: (c) => typeof c.friendCount === 'number' && c.friendCount >= 20 },
  // ── 个人（5） ──
  { id: 'marriage', name: '琴瑟和鸣', description: '缔结婚姻', points: 15, category: 'personal', rarity: 'common', icon: '💍', evaluate: (c) => c.isMarried === true },
  { id: 'first_child', name: '为人父母', description: '第一个子女出生', points: 15, category: 'personal', rarity: 'common', icon: '👶', evaluate: (c) => c.hasChild === true },
  { id: 'skill_master', name: '一技之长', description: '任意技能达到 50 级', points: 20, category: 'skill', rarity: 'rare', icon: '🔧', evaluate: (c) => typeof c.maxSkillLevel === 'number' && c.maxSkillLevel >= 50 },
  { id: 'jack_of_all', name: '无所不通', description: '5 个技能达到 50 级', points: 40, category: 'skill', rarity: 'epic', icon: '📚', evaluate: (c) => typeof c.skillsAbove50 === 'number' && c.skillsAbove50 >= 5 },
  { id: 'centenarian', name: '百岁老人', description: '年龄达到 100', points: 30, category: 'personal', rarity: 'rare', icon: '🕯️', evaluate: (c) => typeof c.age === 'number' && c.age >= 100 },
  // ── 战斗（3） ──
  { id: 'battle_hardened', name: '万人敌', description: '累计 50 场战斗胜利', points: 30, category: 'combat', rarity: 'rare', icon: '⚔️', evaluate: (c) => typeof c.battlesWon === 'number' && c.battlesWon >= 50 },
  { id: 'legendary_warrior', name: '不败战神', description: '累计 100 场战斗胜利', points: 50, category: 'combat', rarity: 'epic', icon: '🛡️', evaluate: (c) => typeof c.battlesWon === 'number' && c.battlesWon >= 100 },
  // ── 探索（1） ──
  { id: 'capital_visit', name: '入京', description: '造访都城', points: 10, category: 'exploration', rarity: 'common', icon: '🏰', evaluate: (c) => c.visitedCapital === true },
  // ── 文化（1） ──
  { id: 'cultural_patron', name: '文教兴邦', description: '文化繁荣度达到 80', points: 40, category: 'culture', rarity: 'epic', icon: '📖', evaluate: (c) => typeof c.cultureProsperity === 'number' && c.cultureProsperity >= 80 },
  // ── 生存 / 特殊（2） ──
  { id: 'survivor', name: '绝处逢生', description: '在濒死危机中存活', points: 25, category: 'survival', rarity: 'rare', icon: '🌱', evaluate: (c) => c.hasSurvivedCrisis === true },
  { id: 'millennium', name: '千年之约', description: '年龄达到 1000', points: 60, category: 'personal', rarity: 'epic', icon: '⏳', evaluate: (c) => typeof c.age === 'number' && c.age >= 1000 },
  { id: 'immortal', name: '不朽传说', description: '年龄达到 10000', points: 100, category: 'personal', rarity: 'legendary', icon: '🌟', evaluate: (c) => typeof c.age === 'number' && c.age >= 10000 },
]

// ============================================================
// §10 著作常量
// ============================================================

/** 古籍世界观作品类型标签 */
export const WORKS_ANCIENT_LABELS: Record<string, string> = {
  biography: '传记', novel: '小说', treatise: '论著', poetry: '诗集', art: '画作', craft: '工艺',
  code: '奇门秘术', paper: '学术论著', holo: '灵契图录',
}

/** 修仙世界观作品类型标签 */
export const WORKS_XIANXIA_LABELS: Record<string, string> = {
  biography: '道经', novel: '修仙志异', treatise: '功法秘籍', poetry: '道歌', art: '阵图', craft: '炼器谱',
  code: '丹方手札', paper: '玄理论著', holo: '神识投影',
}

/** 现代世界观作品类型标签 */
export const WORKS_MODERN_LABELS: Record<string, string> = {
  biography: '回忆录', novel: '小说', treatise: '学术专著', poetry: '诗集', art: '画作', craft: '工艺',
  code: '代码库', paper: '学术论文', holo: '全息影像',
}

/** 世界观 → 作品标签映射 */
export const WORKS_WORLDVIEW_LABEL_MAP: Record<string, Record<string, string>> = {
  default: WORKS_ANCIENT_LABELS,
  historical: WORKS_ANCIENT_LABELS,
  wuxia: WORKS_ANCIENT_LABELS,
  mythology: WORKS_ANCIENT_LABELS,
  cultivation: WORKS_XIANXIA_LABELS,
  xuanhuan: WORKS_XIANXIA_LABELS,
  western_fantasy: WORKS_ANCIENT_LABELS,
  scifi: WORKS_MODERN_LABELS,
  post_apocalyptic: WORKS_MODERN_LABELS,
}

/** 根据世界观获取作品类型中文标签
 * @param worldview 世界观标识（可选）
 * @returns 作品类型标签映射
 */
export function getWorksLabels(worldview?: string): Record<string, string> {
  if (worldview && WORKS_WORLDVIEW_LABEL_MAP[worldview]) {
    return WORKS_WORLDVIEW_LABEL_MAP[worldview]
  }
  return WORKS_ANCIENT_LABELS
}

/** 默认每年投入度 */
export const WORKS_EFFORT_DEFAULT = 15
