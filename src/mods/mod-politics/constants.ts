/**
 * @module constants.ts
 * @description mod-politics 常量 —— 阶层等级/派系等级/法律类型/冲突周期/语言命名/社会价值
 * @mod mod-politics
 */

import type {
  SocialStratum, ConflictPhase, DiplomaticStance,
  LawCategory, FactionStatus, FactionRank,
} from './types'

import { clamp } from './utils'
export { round, clamp, pickRandom, randomInt, ROUND_DECIMALS } from './utils'

// ============================================================
// §1 社会分层常量 (S6)
// ============================================================

/** 阶层默认标签 */
export const STRATUM_LABELS_DEFAULT: Record<SocialStratum, string> = {
  royalty: '皇室',
  nobility: '贵族',
  gentry: '士绅',
  commoner: '平民',
  peasant: '农民',
  slave: '奴隶',
}

/** 阶层初始人口比例 */
export const STRATUM_POPULATION_DEFAULT: Record<SocialStratum, number> = {
  royalty: 0.01,
  nobility: 0.05,
  gentry: 0.10,
  commoner: 0.25,
  peasant: 0.50,
  slave: 0.09,
}

/** 社会流动性基础推进值 */
export const SOCIAL_MOBILITY_BASE = 0.5

/** 各阶层收入倍率（影响玩家收入计算） */
export const STRATUM_INCOME_MULTIPLIER: Record<string, number> = {
  slave: 0.3,
  peasant: 0.6,
  commoner: 1.0,
  gentry: 1.5,
  nobility: 2.5,
  royalty: 4.0,
}

/** 各阶层声望加成（影响玩家社交声望） */
export const STRATUM_REPUTATION_BONUS: Record<string, number> = {
  slave: -20,
  peasant: -10,
  commoner: 0,
  gentry: 10,
  nobility: 20,
  royalty: 35,
}

/** 个人阶层流动确认所需年数 */
export const CLASS_FLOW_CONFIRM_YEARS = 5

/** 财富暴跌阈值（<=0 时触发暴跌降级） */
export const WEALTH_CRASH_THRESHOLD = 0

/** 财富暴跌降级层数 */
export const WEALTH_CRASH_DROP_TIERS = 3

// ============================================================
// §2 派系常量 (S7)
// ============================================================

/** 派系类型标签 */
export const FACTION_TYPE_LABELS: Record<string, string> = {
  political: '政治',
  military: '军事',
  religious: '宗教',
  commercial: '商业',
  academic: '学术',
  secret: '秘密',
}

/** 派系最大数量 */
export const MAX_FACTIONS = 8

/** 派系涨跌状态标签 */
export const FACTION_STATUS_LABELS: Record<FactionStatus, string> = {
  rising: '崛起',
  stable: '稳固',
  declining: '衰退',
}

/** 派系等级体系 */
export const FACTION_RANKS: FactionRank[] = [
  { name: '成员', contributionRequired: 0 },
  { name: '执事', contributionRequired: 500 },
  { name: '护法', contributionRequired: 1500 },
  { name: '长老', contributionRequired: 3000 },
  { name: '副首领', contributionRequired: 5000 },
  { name: '首领', contributionRequired: 8000 },
]

/** 派系敌对/同盟生成概率 */
export const FACTION_RIVAL_PROBABILITY = 0.15
export const FACTION_ALLY_PROBABILITY = 0.20

/** 世界观预设派系模板 */
export const WORLDVIEW_FACTION_TEMPLATES: Record<string, Array<{
  name: string; type: string; goal: string
}>> = {
  historical: [
    { name: '文渊阁', type: 'academic', goal: '弘扬儒学' },
    { name: '铁血营', type: 'military', goal: '开疆拓土' },
    { name: '天机楼', type: 'secret', goal: '暗中支配朝政' },
  ],
  wuxia: [
    { name: '丐帮', type: 'commercial', goal: '行侠仗义' },
    { name: '少林派', type: 'religious', goal: '弘扬佛法' },
    { name: '明教', type: 'secret', goal: '推翻朝廷' },
  ],
  cultivation: [
    { name: '青云门', type: 'academic', goal: '追求天道' },
    { name: '天魔教', type: 'secret', goal: '统御修真界' },
    { name: '器宗', type: 'commercial', goal: '铸造神器' },
  ],
  xuanhuan: [
    { name: '星辰殿', type: 'academic', goal: '参悟天机' },
    { name: '妖神盟', type: 'military', goal: '万妖归一' },
    { name: '冥府', type: 'secret', goal: '掌控轮回' },
  ],
  western_fantasy: [
    { name: '贤者议会', type: 'academic', goal: '守护知识' },
    { name: '圣光教会', type: 'religious', goal: '传播信仰' },
    { name: '盗贼公会', type: 'commercial', goal: '垄断黑市' },
  ],
  scifi: [
    { name: '星际贸易联盟', type: 'commercial', goal: '垄断银河商路' },
    { name: '联邦军部', type: 'military', goal: '维护星域秩序' },
    { name: '义体改造会', type: 'secret', goal: '推动基因进化' },
  ],
  post_apocalyptic: [
    { name: '钢铁兄弟会', type: 'military', goal: '重建文明秩序' },
    { name: '水源联盟', type: 'commercial', goal: '控制水资源' },
    { name: '废土游民', type: 'political', goal: '争取生存权' },
  ],
  mythology: [
    { name: '奥林匹斯议会', type: 'political', goal: '维持神界秩序' },
    { name: '冥界使者', type: 'secret', goal: '收割灵魂' },
    { name: '英灵殿', type: 'military', goal: '备战诸神黄昏' },
  ],
}

/** 默认派系模板（兜底） */
export const DEFAULT_FACTION_TEMPLATES: Array<{
  name: string; type: string; goal: string
}> = [
  { name: '铁血盟', type: 'military', goal: '扩张军力' },
  { name: '紫微阁', type: 'academic', goal: '弘扬学术' },
]

// ============================================================
// §3 国家关系常量 (S8)
// ============================================================

/** 外交立场标签 */
export const DIPLOMATIC_STANCE_LABELS: Record<DiplomaticStance, string> = {
  ally: '同盟',
  neutral: '中立',
  hostile: '敌对',
  war: '战争',
  vassal: '附庸',
  overlord: '宗主',
}

/** 关系值范围 */
export const NATION_RELATION_RANGE = { min: -100, max: 100, } as const

/** 紧张度达到此阈值且关系为 hostile → 战争爆发 */
export const NATION_TENSION_WAR_THRESHOLD = 80

/** 和平度达到此阈值且关系为 neutral/friendly → 升级为 ally */
export const NATION_PEACE_ALLY_THRESHOLD = 60

/** 紧张度自然衰减/年（非 hostile 状态） */
export const NATION_TENSION_DECAY = 3

/** 战争期间和平度年增量 */
export const NATION_WAR_PEACE_GAIN = 2

/** 战争结束后转为 hostile 的概率（15%） */
export const NATION_WAR_END_TO_HOSTILE = 0.15

/** 战争消耗：参战国繁荣度年扣减基础值 */
export const NATION_WAR_DAMAGE_BASE = 3

/** 战争消耗随机上限 */
export const NATION_WAR_DAMAGE_RANDOM = 5

/** 国力自然波动幅度 */
export const NATION_POWER_DRIFT = 3

/** 繁荣度自然波动幅度 */
export const NATION_PROSPERITY_DRIFT = 2

// ============================================================
// §4 法律常量 (S9)
// ============================================================

/** 法律类别标签 */
export const LAW_CATEGORY_LABELS: Record<LawCategory, string> = {
  criminal: '刑事',
  civil: '民事',
  commercial: '商业',
  religious: '宗教',
  military: '军事',
}

/** 法律体系标签 */
export const LEGAL_SYSTEM_LABELS: Record<string, string> = {
  customary: '习惯法',
  statutory: '成文法',
  religious: '宗教法',
  martial: '军法',
  anarchic: '无政府状态',
}

/** 执法力度范围 */
export const ENFORCEMENT_RANGE = { min: 0, max: 100, } as const

/** 法律体系演化触发阈值（基于执法力度 enforcementLevel） */
export const LEGAL_EVOLVE_THRESHOLDS = {
  /** 执法力度 >= 此值 → 习惯法→成文法 */
  CUSTOMARY_TO_STATUTORY: 55,
  /** 执法力度 < 此值 → 任何→军法 */
  ANY_TO_MARTIAL: 25,
  /** 执法力度 < 此值 → 任何→无政府 */
  ANY_TO_ANARCHIC: 8,
  /** 执法力度 >= 此值 → 无政府→成文法（复苏） */
  ANARCHIC_TO_STATUTORY: 45,
} as const

/** 法律体系类型 → 下一阶段映射（演化状态机） */
export const LEGAL_EVOLUTION_MAP: Record<string, string | null> = {
  customary: 'statutory',   // 习惯法 → 成文法
  statutory: null,           // 成文法已达最高稳定形态
  religious: null,           // 神权法为特殊形态，不进一步演化
  martial: null,             // 军法为特殊形态，执法回升后→成文法
  anarchic: 'statutory',     // 无政府复苏 → 成文法
}

/** 法律体系叙事提示文本（用于 AI Prompt） */
export const LEGAL_NARRATIVE_HINTS: Record<string, string> = {
  customary: '社会以习惯法和口头传统维持秩序，纠纷依赖长者/族长裁决，成文法规稀缺。',
  statutory: '成文法体系确立了明确的法律条文和司法程序，社会秩序井然，产权受保护。',
  religious: '神权法主导社会，法律与宗教教义合一，违规被视为渎神。宗教法庭掌握司法权。',
  martial: '军法管制，社会处于戒严状态，公民自由受限，军事法庭取代常规司法。',
  anarchic: '社会秩序崩溃，法律体系完全失效，暴力事件频发，民众依赖私人武装自保。',
}

/** 高腐败叙事提示阈值 */
export const LEGAL_CORRUPTION_HINT_THRESHOLD = 70

/** 高腐败叙事提示文本 */
export const LEGAL_CORRUPTION_HINT = '司法系统基本瘫痪，腐败横行，法律形同虚设，财富和关系决定一切。'

/** 执法力度标签（3 档） */
export const ENFORCEMENT_LEVEL_LABELS: Record<string, string> = {
  strict: '严格',
  normal: '普通',
  weak: '薄弱',
}

/**
 * 根据执法力度获取标签
 * @param level - 执法力度数值（0-100）
 * @returns 执法力度标签（"严格" / "普通" / "薄弱"）
 */
export function getEnforcementLabel(level: number): string {
  if (level >= 70) return ENFORCEMENT_LEVEL_LABELS.strict
  if (level >= 30) return ENFORCEMENT_LEVEL_LABELS.normal
  return ENFORCEMENT_LEVEL_LABELS.weak
}

/** 执法乘数范围（影响合同执行/产权保护/经济效率） */
export const ENFORCEMENT_MULTIPLIER_RANGE = { min: 0.3, max: 1.5 } as const

/** 根据执法力度计算执法乘数
 * @param enforcementLevel 执法力度数值
 * @returns 执法乘数（0.3 ~ 1.5）
 */
export function getEnforcementMultiplier(enforcementLevel: number): number {
  return 0.3 + (enforcementLevel / 100) * 1.2
}

/** 根据腐败率估算犯罪率 0-100
 * @param corruption 腐败率
 * @param enforcementLevel 执法力度
 * @returns 估算犯罪率（0-100）
 */
export function estimateCrimeRate(corruption: number, enforcementLevel: number): number {
  const base = corruption * 0.6
  const deterrence = enforcementLevel * 0.3
  // 防御强度 (0-100): 基础 + 科技抵消 - 威慑力，下限 0 上限 100
  return clamp(Math.round(base - deterrence + 20), 0, 100)
}

// ============================================================
// §5 冲突周期常量 (S17)
// ============================================================

/** 六阶段顺序 */
export const CONFLICT_PHASE_ORDER: readonly ConflictPhase[] = [
  'peace', 'tension', 'escalation', 'crisis', 'climax', 'resolution',
]

/** 阶段标签（中式网文风格） */
export const CONFLICT_PHASE_LABELS: Record<ConflictPhase, string> = {
  peace: '风平浪静',
  tension: '暗流涌动',
  escalation: '黑云压城',
  crisis: '绝地反击',
  climax: '酣畅打脸',
  resolution: '余波未平',
}

/** 阶段基础持续回合 */
export const CONFLICT_PHASE_DURATION: Record<ConflictPhase, number> = {
  peace: 10,
  tension: 5,
  escalation: 3,
  crisis: 2,
  climax: 1,
  resolution: 3,
}

/** 冲突主题池 */
export const CONFLICT_THEME_POOL: readonly string[] = [
  '领土争端', '资源争夺', '宗教冲突', '继承危机',
  '贸易摩擦', '民族矛盾', '意识形态对抗', '霸权争夺',
]

// ─── 对手系统 ───

/** 对手原型定义 */
export const ANTAGONIST_ARCHETYPES: Record<string, { powerBase: number; prideBase: number; persistenceBase: number; actionKeywords: string[] }> = {
  arrogant_young_master: { powerBase: 50, prideBase: 80, persistenceBase: 60, actionKeywords: ['挑衅', '羞辱', '强抢', '以势压人', '大放厥词'] },
  scheming_elder: { powerBase: 70, prideBase: 60, persistenceBase: 80, actionKeywords: ['算计', '栽赃', '阳谋', '借刀杀人', '权术'] },
  corrupt_official: { powerBase: 40, prideBase: 90, persistenceBase: 50, actionKeywords: ['压榨', '陷害', '勒索', '以权谋私', '结党营私'] },
  rival_genius: { powerBase: 60, prideBase: 70, persistenceBase: 70, actionKeywords: ['挑战', '较劲', '超越', '证明自己', '碾压'] },
  foreign_invader: { powerBase: 80, prideBase: 50, persistenceBase: 90, actionKeywords: ['入侵', '掠夺', '剿灭', '奴役', '扩张'] },
  ancient_monster: { powerBase: 90, prideBase: 40, persistenceBase: 100, actionKeywords: ['肆虐', '吞噬', '毁灭', '操纵', '腐蚀'] },
  corporate_tycoon: { powerBase: 60, prideBase: 75, persistenceBase: 65, actionKeywords: ['收购', '垄断', '打压', '吞并', '商战'] },
  political_opponent: { powerBase: 65, prideBase: 65, persistenceBase: 75, actionKeywords: ['弹劾', '污蔑', '拉拢', '权斗', '阴谋'] },
}

/** 对手类型中文标签 */
export const ANTAGONIST_TYPE_LABELS: Record<string, string> = {
  arrogant_young_master: '纨绔子弟',
  scheming_elder: '老谋深算',
  corrupt_official: '贪官污吏',
  rival_genius: '天才对手',
  foreign_invader: '外族入侵者',
  ancient_monster: '上古妖魔',
  corporate_tycoon: '商业巨鳄',
  political_opponent: '政敌',
}

/** 对手名称池（按类型） */
export const ANTAGONIST_NAMES: Record<string, string[]> = {
  arrogant_young_master: ['赵无妄', '钱傲天', '孙飞扬', '李霸天'],
  scheming_elder: ['阴无极', '司空暗', '独孤谋', '慕容算'],
  corrupt_official: ['赵贪狼', '钱剥皮', '王刮骨', '李蛀虫'],
  rival_genius: ['叶凌云', '萧逸仙', '林无敌', '楚惊鸿'],
  foreign_invader: ['呼延烈火', '完颜铁骨', '拓跋屠城', '耶律狂'],
  ancient_monster: ['冥帝', '九幽', '天煞', '古魔'],
  corporate_tycoon: ['龙傲天', '金满堂', '钱四海', '富可敌'],
  political_opponent: ['司马昭', '曹孟德', '王莽心', '赵高谋'],
}

// ============================================================
// §6 语言命名常量 (S18)
// ============================================================

/** 命名前缀池 */
export const NAME_PREFIX_POOL: readonly string[] = [
  '天', '风', '龙', '星', '暗', '光', '雷', '炎', '冰', '玄',
  '太', '玉', '金', '银', '紫', '碧', '渊', '苍', '昊', '寰',
]

/** 命名中缀池 */
export const NAME_INFIX_POOL: readonly string[] = [
  '月', '阳', '云', '霄', '羽', '鸣', '啸', '吟', '岚', '墟',
  '宸', '曦', '熠', '澜', '瀚', '昭', '煜', '珩', '珺', '瑶',
]

/** 命名后缀池 */
export const NAME_SUFFIX_POOL: readonly string[] = [
  '宗', '阁', '殿', '峰', '谷', '城', '湖', '林', '原', '域',
  '宫', '观', '寺', '院', '塔', '坊', '盟', '会', '堂', '楼',
]

/** 世界观初始语言配置（多语言生态） */
export const WORLDVIEW_LANGUAGE_INIT: Record<string, Array<{
  name: string; prestige: number; speakers: number; phonemePool: string[]
}>> = {
  default: [
    { name: '通用语', prestige: 60, speakers: 80_000, phonemePool: ['天', '地', '人', '风', '火', '水', '山', '林', '星', '月', '阳', '阴'] },
  ],
  historical: [
    { name: '官话', prestige: 70, speakers: 60_000, phonemePool: ['天', '地', '君', '臣', '文', '武', '礼', '乐', '仁', '义', '忠', '孝'] },
    { name: '蛮语', prestige: 30, speakers: 20_000, phonemePool: ['狼', '鹰', '熊', '豹', '风', '雪', '石', '铁', '骨', '血', '部', '帐'] },
  ],
  wuxia: [
    { name: '江湖通用语', prestige: 75, speakers: 70_000, phonemePool: ['江', '湖', '剑', '气', '武', '侠', '情', '义', '风', '云', '月', '霜'] },
    { name: '苗疆语', prestige: 25, speakers: 15_000, phonemePool: ['蛊', '蝶', '花', '蛇', '银', '芦', '笙', '鼓', '寨', '谷', '雾', '瘴'] },
  ],
  cultivation: [
    { name: '修真通用语', prestige: 90, speakers: 80_000, phonemePool: ['灵', '道', '元', '真', '玄', '太', '虚', '清', '紫', '丹', '符', '鼎'] },
    { name: '妖语', prestige: 40, speakers: 20_000, phonemePool: ['龙', '凤', '麟', '龟', '虎', '蛟', '鸾', '鲲', '蟒', '螭', '犼', '貔'] },
  ],
  xuanhuan: [
    { name: '天界通用语', prestige: 85, speakers: 70_000, phonemePool: ['天', '道', '神', '圣', '星', '辰', '曜', '辉', '乾', '坤', '无', '极'] },
    { name: '冥界语', prestige: 30, speakers: 15_000, phonemePool: ['冥', '幽', '魂', '魄', '魇', '煞', '死', '寂', '暗', '渊', '狱', '葬'] },
  ],
  western_fantasy: [
    { name: '通用语', prestige: 80, speakers: 70_000, phonemePool: ['sil', 'ver', 'gold', 'stone', 'star', 'moon', 'sun', 'vale', 'keep', 'shire', 'dale', 'ford'] },
    { name: '精灵语', prestige: 60, speakers: 15_000, phonemePool: ['ael', 'lith', 'mar', 'dor', 'fal', 'nor', 'quil', 'thal', 'wyn', 'lor', 'ion', 'el'] },
    { name: '矮人语', prestige: 40, speakers: 10_000, phonemePool: ['dur', 'mor', 'grim', 'thor', 'khan', 'gar', 'bor', 'in', 'val', 'rot', 'orn', 'mek'] },
  ],
  scifi: [
    { name: '联邦标准语', prestige: 85, speakers: 80_000, phonemePool: ['nova', 'star', 'void', 'flux', 'core', 'nex', 'prime', 'alpha', 'omega', 'drift', 'syn', 'tech'] },
    { name: '基因工语', prestige: 35, speakers: 10_000, phonemePool: ['bio', 'gene', 'synth', 'cyber', 'nex', 'vox', 'link', 'grid', 'byte', 'chip', 'ware', 'pod'] },
  ],
  post_apocalyptic: [
    { name: '废土通用语', prestige: 60, speakers: 50_000, phonemePool: ['waste', 'ash', 'rust', 'steel', 'bone', 'rock', 'clan', 'tribe', 'forge', 'camp', 'den', 'out'] },
    { name: '避难所语', prestige: 25, speakers: 8_000, phonemePool: ['vault', 'clean', 'pure', 'code', 'life', 'east', 'west', 'north', 'south', 'gate', 'wall', 'dome'] },
  ],
  mythology: [
    { name: '神语', prestige: 95, speakers: 50_000, phonemePool: ['神', '圣', '天', '奥', '光', '暗', '创', '涅', '格', '姆', '索', '尔'] },
    { name: '凡语', prestige: 40, speakers: 30_000, phonemePool: ['人', '部', '落', '城', '村', '河', '丘', '谷', '牧', '耕', '猎', '织'] },
  ],
}

/** 世界观势力命名模板（prefix + middle + suffix 组合） */
export const FACTION_NAMING_TEMPLATES: Record<string, {
  prefixes: string[]; middles: string[]; suffixes: string[]
}> = {
  historical: {
    prefixes: ['天策', '龙武', '神机', '虎贲', '金吾', '羽林', '玄甲', '锦衣'],
    middles: ['御', '神', '龙', '虎', '风', '云', '霜', '雪'],
    suffixes: ['卫', '营', '府', '司', '局', '台', '阁', '院'],
  },
  wuxia: {
    prefixes: ['少林', '武当', '峨眉', '昆仑', '华山', '崆峒', '丐帮', '明教'],
    middles: ['派', '门', '宗', '山', '谷', '峰', '湖', '林'],
    suffixes: ['', '', '', '', '', '', '', ''],
  },
  cultivation: {
    prefixes: ['青云', '紫霄', '太虚', '玄元', '碧落', '天衍', '星辰', '九幽'],
    middles: ['道', '玄', '真', '灵', '天', '神', '仙', '魔'],
    suffixes: ['门', '宗', '派', '阁', '殿', '观', '洞', '谷'],
  },
  xuanhuan: {
    prefixes: ['星辰', '天穹', '轮回', '涅槃', '万象', '混沌', '神霄', '大罗'],
    middles: ['神', '圣', '天', '玄', '之', '的', '与', ''],
    suffixes: ['殿', '宫', '塔', '域', '界', '渊', '城', '境'],
  },
  western_fantasy: {
    prefixes: ['Silver', 'Golden', 'Iron', 'Storm', 'Shadow', 'Crimson', 'Emerald', 'Dragon'],
    middles: ['', 'thorn', 'gate', 'hold', 'crest', 'fall', 'wind', 'wing'],
    suffixes: ['Keep', 'Reach', 'Guard', 'Lodge', 'Hall', 'Clan', 'Order', 'Council'],
  },
  scifi: {
    prefixes: ['Nova', 'Star', 'Void', 'Flux', 'Cyber', 'Quantum', 'Astral', 'Omega'],
    middles: ['', 'link', 'gate', 'core', 'drift', 'syn', 'tech', 'nex'],
    suffixes: ['Federation', 'Alliance', 'Collective', 'Corporation', 'Union', 'Command', 'Division', 'Fleet'],
  },
  post_apocalyptic: {
    prefixes: ['Ash', 'Rust', 'Steel', 'Bone', 'Iron', 'Waste', 'Dead', 'Thunder'],
    middles: ['', 'land', 'march', 'rock', 'fall', 'fire', 'storm', 'claw'],
    suffixes: ['Clan', 'Tribe', 'Settlement', 'Outpost', 'Fort', 'Camp', 'Gang', 'Brotherhood'],
  },
  mythology: {
    prefixes: ['奥林', '涅盘', '永恒', '黄昏', '苍穹', '深渊', '光辉', '暗影'],
    middles: ['神', '圣', '神之', '圣', '之', '与', '天', '地'],
    suffixes: ['议会', '神殿', '圣殿', '祭坛', '军团', '守卫', '使徒', '神选'],
  },
}

/** 根据世界观生成势力名
 * @param worldview 世界观标识
 * @param existingNames 现有势力名称列表
 * @returns 生成的唯一势力名
 */
export function generateFactionName(worldview: string, existingNames: string[]): string {
  const template = FACTION_NAMING_TEMPLATES[worldview] ?? FACTION_NAMING_TEMPLATES.historical
  const { prefixes, middles, suffixes } = template

  for (let attempt = 0; attempt < 50; attempt++) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const middle = middles[Math.floor(Math.random() * middles.length)]
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
    const name = `${prefix}${middle}${suffix}`.trim()

    if (!existingNames.includes(name)) {
      return name
    }
  }

  return `${prefixes[0]}${suffixes[0]}${existingNames.length + 1}`
}

/** 世界观 → 初始语言配置查找
 * @param worldview 世界观标识
 * @returns 初始语言配置数组，无匹配返回 default 配置
 */
export function getLanguageInitForWorldview(worldview: string): Array<{
  name: string; prestige: number; speakers: number; phonemePool: string[]
}> {
  return WORLDVIEW_LANGUAGE_INIT[worldview] ?? WORLDVIEW_LANGUAGE_INIT.default
}

// ============================================================
// §7 社会价值常量 (S19)
// ============================================================

/** 主导权竞争：挑战者 importance 需超过主导值此阈值才能积累进度 */
export const SHIFT_GAP = 10

/** 主导权竞争：进度累积到此值触发主导权切换 */
export const SHIFT_PROGRESS_MAX = 100

/** 跨系统权重修正：系统名键映射 */
export const SOCIAL_VALUE_SYSTEM_KEYS: readonly string[] = [
  'law',
  'reputation',
  'economy',
]

/**
 * 社会价值观配置（带世界观兼容性和跨系统权重修正）
 * 世界观兼容规则：historical/wuxia 共享东方传统，cultivation/xuanhuan 共享修仙，
 * scifi/post_apocalyptic 共享未来，western_fantasy/mythology 共享西方奇幻
 */
export const SOCIAL_VALUES_CONFIG: Array<{
  name: string
  defaultPriority: number
  compatibleWorldviews: string[]
  description: string
  weightModifiers: Record<string, number>
}> = [
  // ── 东方传统（historical, wuxia, mythology） ──
  { name: '忠孝', defaultPriority: 80, compatibleWorldviews: ['historical', 'wuxia', 'mythology'], description: '忠君孝亲是立身之本', weightModifiers: { law: 10, reputation: 15 } },
  { name: '仁义', defaultPriority: 75, compatibleWorldviews: ['historical', 'wuxia'], description: '仁者爱人，义者行正', weightModifiers: { reputation: 10, law: 5 } },
  { name: '礼教', defaultPriority: 70, compatibleWorldviews: ['historical', 'mythology'], description: '礼序乐和，尊卑有序', weightModifiers: { law: 15, reputation: 5 } },
  { name: '勇武', defaultPriority: 65, compatibleWorldviews: ['wuxia', 'historical', 'mythology'], description: '勇者无畏，武者不屈', weightModifiers: { reputation: 10, law: -5 } },
  { name: '勤俭', defaultPriority: 60, compatibleWorldviews: ['historical', 'post_apocalyptic'], description: '克勤克俭，持家有道', weightModifiers: { economy: 10 } },
  { name: '诚信', defaultPriority: 55, compatibleWorldviews: ['historical', 'wuxia', 'western_fantasy'], description: '言必信，行必果', weightModifiers: { law: 5, reputation: 10 } },
  // ── 修仙（cultivation, xuanhuan） ──
  { name: '道心', defaultPriority: 85, compatibleWorldviews: ['cultivation', 'xuanhuan'], description: '道心坚定，超脱凡俗', weightModifiers: { reputation: 10 } },
  { name: '长生', defaultPriority: 80, compatibleWorldviews: ['cultivation', 'xuanhuan'], description: '长生久视，追求不朽', weightModifiers: { economy: 5 } },
  { name: '因果', defaultPriority: 70, compatibleWorldviews: ['cultivation', 'xuanhuan'], description: '因果循环，报应不爽', weightModifiers: { law: 10, reputation: 5 } },
  { name: '强者为尊', defaultPriority: 75, compatibleWorldviews: ['cultivation', 'xuanhuan'], description: '实力决定一切', weightModifiers: { law: -10, reputation: 15 } },
  // ── 西方奇幻（western_fantasy, mythology） ──
  { name: '荣誉', defaultPriority: 80, compatibleWorldviews: ['western_fantasy', 'mythology'], description: '荣誉高于生命', weightModifiers: { reputation: 15, law: 5 } },
  { name: '信仰', defaultPriority: 75, compatibleWorldviews: ['western_fantasy', 'mythology'], description: '信仰指引迷途', weightModifiers: { law: 10, reputation: 10 } },
  { name: '自由', defaultPriority: 70, compatibleWorldviews: ['western_fantasy', 'scifi'], description: '生而自由，不屈于强权', weightModifiers: { law: -5, economy: 5 } },
  { name: '法治', defaultPriority: 65, compatibleWorldviews: ['western_fantasy', 'scifi', 'historical'], description: '法律面前人人平等', weightModifiers: { law: 20, economy: 5 } },
  // ── 科幻（scifi） ──
  { name: '科学', defaultPriority: 85, compatibleWorldviews: ['scifi'], description: '真理源于实证', weightModifiers: { economy: 15, reputation: 5 } },
  { name: '进步', defaultPriority: 80, compatibleWorldviews: ['scifi', 'post_apocalyptic'], description: '不断超越自我，开创未来', weightModifiers: { economy: 10 } },
  { name: '平等', defaultPriority: 70, compatibleWorldviews: ['scifi', 'western_fantasy'], description: '众生平等，无有高下', weightModifiers: { law: 10, reputation: 5 } },
  // ── 废土（post_apocalyptic） ──
  { name: '生存', defaultPriority: 90, compatibleWorldviews: ['post_apocalyptic'], description: '活着高于一切', weightModifiers: { law: -15, economy: 15 } },
  { name: '团结', defaultPriority: 75, compatibleWorldviews: ['post_apocalyptic'], description: '守望相助，共度难关', weightModifiers: { reputation: 10, economy: 5 } },
  { name: '力量', defaultPriority: 70, compatibleWorldviews: ['post_apocalyptic', 'cultivation', 'xuanhuan', 'wuxia'], description: '力量是生存的保障', weightModifiers: { law: -10, reputation: 10 } },
]

/** 社会价值名池（兜底用） */
export const SOCIAL_VALUE_NAME_POOL: readonly string[] = [
  '忠孝', '仁义', '礼智信', '勇武', '勤俭', '诚信',
  '自由', '平等', '博爱', '法治', '民主', '科学',
  '和谐', '中庸', '无为', '兼爱', '尚贤', '尊师',
]

/** 根据世界观获取兼容的价值观配置
 * @param worldview 世界观标识
 * @param count 返回数量（默认 5）
 * @returns 兼容的社会价值观配置列表
 */
export function getValuesForWorldview(worldview: string, count: number = 5): Array<{
  name: string
  defaultPriority: number
  description: string
  weightModifiers: Record<string, number>
}> {
  const compatible = SOCIAL_VALUES_CONFIG
    .filter(v => v.compatibleWorldviews.includes(worldview))
    .sort((a, b) => b.defaultPriority - a.defaultPriority)
    .slice(0, count)

  if (compatible.length === 0) {
    return SOCIAL_VALUE_NAME_POOL.slice(0, count).map(name => ({
      name,
      defaultPriority: 50,
      description: `${name}是社会的核心价值取向之一`,
      weightModifiers: {} as Record<string, number>,
    }))
  }

  return compatible
}
