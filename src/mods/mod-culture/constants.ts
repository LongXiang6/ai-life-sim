/**
 * @module constants.ts
 * @description mod-culture 常量 —— 教育、文化、艺术与作品
 * @mod mod-culture
 */

import type {
  EducationSystemType,
  EducationQuality,
  CulturalValue,
  ArtForm,
  CustomCategory,
} from './types'

export { round, clamp, pickRandom, randomInt, ROUND_DECIMALS } from './utils'

// ============================================================
// §4 教育常量
// ============================================================

/** 教育制度标签 */
export const EDUCATION_SYSTEM_LABELS: Record<EducationSystemType, string> = {
  oral: '口述传承',
  household: '家庭传承',
  school: '学校教育',
  network: '网络教育',
  religious: '寺院教育',
  guild: '行会教育',
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
