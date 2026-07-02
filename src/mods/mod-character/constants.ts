/**
 * @module constants.ts
 * @description 角色系统常量定义
 * @mod mod-character
 */

import type { DestinyPattern, DestinyPatternRarity, DestinyPatternPolarity, RaceLifespanConfig, LifeStageId, LifeStageConfig, MoralityLevel, BreakthroughPathway, DeathCause, } from './types'

// ============================================================
// 基础属性（对齐废弃项目 attribute-config.ts）
// ============================================================

/** 总属性分配点数 */
export const TOTAL_ATTRIBUTE_POINTS = 30

/** 默认属性值 */
export const DEFAULT_ATTRIBUTE_VALUE = 0
export const MIN_ATTRIBUTE_VALUE = -10
export const MAX_ATTRIBUTE_VALUE = 10

/** 5 项属性名称（key 对齐废弃项目 ATTR_KEYS） */
export const ATTRIBUTE_NAMES: Record<string, string> = {
  physique: '体魄',
  mind: '心智',
  talentAptitude: '悟性',
  charisma: '魅力',
  resources: '出身',
}

/** 5 项属性 key 数组 */
export const ATTR_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma', 'resources',] as const

/** 属性图标映射 */
export const ATTRIBUTE_ICONS: Record<string, string> = {
  physique: '\u{1F4AA}',
  mind: '\u{1F9E0}',
  talentAptitude: '\u2B50',
  charisma: '\u{1F4AB}',
  resources: '\u{1F3E0}',
}

/** 属性中文别名 → 英文 key 映射（用于从叙事文本中反向提取属性变化） */
export const ATTR_CN_ALIAS_TO_KEY: Record<string, string> = {
  '体魄': 'physique', '力量': 'physique', '体质': 'physique', '身体': 'physique',
  '心智': 'mind', '智力': 'mind', '智慧': 'mind', '头脑': 'mind',
  '悟性': 'talentAptitude', '天赋': 'talentAptitude', '资质': 'talentAptitude',
  '魅力': 'charisma', '容貌': 'charisma', '气质': 'charisma',
  '出身': 'resources', '资源': 'resources', '门第': 'resources',
}

/** 属性自然语言增加关键词 */
export const ATTR_INCREASE_KEYWORDS = ['提升', '增加', '增强', '上升', '暴涨', '增长', '大幅增长', '提高',]
/** 属性自然语言减少关键词 */
export const ATTR_DECREASE_KEYWORDS = ['下降', '减少', '降低', '衰退', '损失', '跌落', '大幅下降', '削弱',]

// ============================================================
// 浮点精度
// ============================================================

/** 全局数值精度：所有浮点计算结果四舍五入到此位数 */
export const ROUND_DECIMALS = 4

// ============================================================
// 命格（对齐废弃项目 TalentRarity + TALENT_PRESETS_SHARED）
// ============================================================

/** 稀有度权重（用于随机抽取，对齐废弃项目 distribution） */
export const DESTINY_PATTERN_RARITY_WEIGHTS: Record<DestinyPatternRarity, number> = {
  common: 60,
  fine: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
}

/** 稀有度硬限制（单角色持有上限） */
export const DESTINY_PATTERN_RARITY_LIMITS: Partial<Record<DestinyPatternRarity, number>> = {
  legendary: 2,
  epic: 6,
}

/** 默认生成候选命格数（抽12） */
export const DEFAULT_DESTINY_PATTERN_COUNT = 12

/** 玩家选择数量（选3，对齐废弃项目 TALENT_SELECT_COUNT） */
export const DESTINY_PATTERN_SELECT_COUNT = 3

/** AI 批量生成：每批 20 条，分 5 批 */
export const AI_DESTINY_PATTERN_BATCH_SIZE = 20
export const AI_DESTINY_PATTERN_BATCH_COUNT = 5

/** 批量数量 + 满池数量（对齐废弃项目 TALENT_BULK_COUNT / TALENT_FULL_POOL_COUNT） */
export const DESTINY_PATTERN_BULK_COUNT = 48
export const DESTINY_PATTERN_FULL_POOL_COUNT = 96

/** 快速抽取阈值（池 ≥90 条时跳过 AI 生成，对齐废弃项目 TALENT_POOL_FAST_DRAW_THRESHOLD） */
export const DESTINY_PATTERN_FAST_DRAW_THRESHOLD = 90

/** 存储容量管理（对齐废弃项目 MAX_WORLD_SIZE_MB / TOTAL_MAX_MB） */
export const DESTINY_PATTERN_MAX_WORLD_SIZE_MB = 10
export const DESTINY_PATTERN_TOTAL_MAX_MB = 500

/** 自定义世界编码起始偏移（对齐废弃项目 CUSTOM_WORLD_CODE_START） */
export const CUSTOM_WORLD_CODE_START = 10000

/** ID 编码前缀（预设/ AI 生成区分） */
export const DESTINY_PATTERN_ID_PREFIX = {
  PRESET: 'preset',
  AI: 'ai',
} as const

// ============================================================
// 稀有度 UI 视觉配置（对齐废弃项目 TALENT_RARITY_CONFIG）
// ============================================================

/** 稀有度颜色 + 光效配置 */
export const DESTINY_PATTERN_RARITY_CONFIG: Record<DestinyPatternRarity, { label: string; color: string; glow: string }> = {
  common: { label: '普通', color: '#94a3b8', glow: '0 0 6px #94a3b8', },
  fine: { label: '精良', color: '#22c55e', glow: '0 0 8px #22c55e', },
  rare: { label: '稀有', color: '#3b82f6', glow: '0 0 12px #3b82f6', },
  epic: { label: '史诗', color: '#a855f7', glow: '0 0 16px #a855f7', },
  legendary: { label: '传说', color: '#f59e0b', glow: '0 0 20px #f59e0b', },
}

/** 稀有度排序值（用于 UI 列表排序） */
export const DESTINY_PATTERN_RARITY_RANK: Record<DestinyPatternRarity, number> = {
  common: 0, fine: 1, rare: 2, epic: 3, legendary: 4,
}

/** 极性 UI 颜色（对齐废弃项目 TALENT_POLARITY_CONFIG） */
export const DESTINY_PATTERN_POLARITY_CONFIG: Record<DestinyPatternPolarity, { label: string; color: string }> = {
  positive: { label: '正面', color: '#22c55e', },
  negative: { label: '负面', color: '#ef4444', },
  mixed: { label: '双刃', color: '#f59e0b', },
}

/**
 * 命格模拟系数元数据 —— 含显示名 + 收益方向
 *
 * benefitDirection:
 *   'higher' → 数值越大对玩家/世界越有利（绿色=好，红色=坏）
 *   'lower'  → 数值越小越有利（红色=好，绿色=坏）—— 如属性衰减、修炼瓶颈、死亡率、灾害频率等
 */

/** 个人向模拟系数元数据 */
export const DESTINY_PATTERN_PERSONAL_MODIFIER_META: Record<string, { label: string; benefitDirection: 'higher' | 'lower' }> = {
  luckPointModifier: { label: '气运获取', benefitDirection: 'higher' },
  hpRecoveryModifier: { label: '生命恢复', benefitDirection: 'higher' },
  staminaRecoveryModifier: { label: '体力恢复', benefitDirection: 'higher' },
  breakthroughChanceModifier: { label: '寿命突破', benefitDirection: 'higher' },
  cultivationSpeedModifier: { label: '修炼/战力成长', benefitDirection: 'higher' },
  bottleneckModifier: { label: '修炼瓶颈', benefitDirection: 'lower' },
  incomeModifier: { label: '职业收入', benefitDirection: 'higher' },
  fertilityModifier: { label: '家族生育', benefitDirection: 'higher' },
  devotionGainModifier: { label: '虔诚获取', benefitDirection: 'higher' },
  lifespanModifier: { label: '寿命上限', benefitDirection: 'higher' },
  attributeDecayModifier: { label: '属性衰减', benefitDirection: 'lower' },
} as const

/** 个人向 label 映射（向后兼容） */
export const DESTINY_PATTERN_PERSONAL_MODIFIERS: Record<string, string> = Object.fromEntries(
  Object.entries(DESTINY_PATTERN_PERSONAL_MODIFIER_META).map(([k, v]) => [k, v.label]),
) as Record<string, string>

export type DestinyPatternPersonalModifierKey = keyof typeof DESTINY_PATTERN_PERSONAL_MODIFIER_META

export const DESTINY_PATTERN_PERSONAL_MODIFIER_KEYS = Object.keys(
  DESTINY_PATTERN_PERSONAL_MODIFIER_META,
) as DestinyPatternPersonalModifierKey[]

/** 世界向模拟系数元数据 */
export const DESTINY_PATTERN_WORLD_MODIFIER_META: Record<string, { label: string; benefitDirection: 'higher' | 'lower' }> = {
  birthRateModifier: { label: '宏观人口出生', benefitDirection: 'higher' },
  deathRateModifier: { label: '宏观死亡率', benefitDirection: 'lower' },
  warFrequencyModifier: { label: '战争频率', benefitDirection: 'lower' },
  techProgressModifier: { label: '科技进度', benefitDirection: 'higher' },
  disasterFrequencyModifier: { label: '灾害频率', benefitDirection: 'lower' },
  monsterThreatModifier: { label: '怪物威胁', benefitDirection: 'lower' },
  socialMobilityModifier: { label: '阶层流动', benefitDirection: 'higher' },
  migrationRateModifier: { label: '人口迁移', benefitDirection: 'higher' },
  economyModifier: { label: '宏观经济', benefitDirection: 'higher' },
  factionEmergenceModifier: { label: '势力涌现', benefitDirection: 'higher' },
} as const

/** 世界向 label 映射（向后兼容） */
export const DESTINY_PATTERN_WORLD_MODIFIERS: Record<string, string> = Object.fromEntries(
  Object.entries(DESTINY_PATTERN_WORLD_MODIFIER_META).map(([k, v]) => [k, v.label]),
) as Record<string, string>

export type DestinyPatternWorldModifierKey = keyof typeof DESTINY_PATTERN_WORLD_MODIFIER_META

export const DESTINY_PATTERN_WORLD_MODIFIER_KEYS = Object.keys(
  DESTINY_PATTERN_WORLD_MODIFIER_META,
) as DestinyPatternWorldModifierKey[]

/** 合并所有修饰符的收益方向查找表 */
export const DESTINY_PATTERN_MODIFIER_BENEFIT_DIRECTION: Record<string, 'higher' | 'lower'> = Object.fromEntries(
  [
    ...Object.entries(DESTINY_PATTERN_PERSONAL_MODIFIER_META).map(([k, v]) => [k, v.benefitDirection] as const),
    ...Object.entries(DESTINY_PATTERN_WORLD_MODIFIER_META).map(([k, v]) => [k, v.benefitDirection] as const),
  ],
)

/** 内置预设命格库（AI 不可用时的降级池，对齐废弃项目 TALENT_PRESETS_SHARED 31 条）
 *  所有 description 须在 40–60 汉字之间，对齐 AI 生成质量 */
export const PRESET_DESTINY_PATTERNS: Omit<DestinyPattern, 'id'>[] = [
  // ===================== 正面命格 =====================
  { name: '喜欢运动', description: '球场上总能看到你奔跑的身影，流汗对你来说是种享受；体育课是你最期待的时光，跑跳投掷样样在行，精力仿佛永远用不完。', rarity: 'common', effect: '基础体质略好', polarity: 'positive', attrBonus: { physique: 1, }, },
  { name: '讲信用', description: '答应别人的事哪怕再麻烦也会做到，不轻易许诺但一旦承诺便全力以赴；周围人都知道找你办事靠得住，这份信任是日积月累攒下来的。', rarity: 'common', effect: '更容易获得他人信任', polarity: 'positive', attrBonus: { charisma: 1, }, },
  { name: '善于观察', description: '旁人注意不到的细节你总能一眼捕捉——谁今天情绪不对、桌上少了什么东西、路面的细微变化；这些信息在你脑中自动拼合成完整的图景。', rarity: 'common', effect: '察觉变化的能力略强', polarity: 'positive', attrBonus: { mind: 1, }, },
  { name: '手脚麻利', description: '做事从不拖泥带水，同样的任务你总是最快完成的那一个；动作干净利落，收拾东西、完成工作都比别人快上半拍，效率惊人。', rarity: 'common', effect: '任务完成速度略快', polarity: 'positive', attrBonus: { physique: 1, }, },
  { name: '心态好', description: '遇到不顺心的事很少钻牛角尖，睡一觉就能翻篇；考试考砸了、被批评了都能坦然面对，这种不内耗的性格让你比同龄人轻松许多。', rarity: 'common', effect: '情绪波动较少', polarity: 'positive', attrBonus: { mind: 1, }, },
  { name: '会做饭', description: '锅碗瓢盆在你手中如同乐器，简单的食材也能做出让人眼前一亮的味道；调味全凭手感，菜谱看一遍就能还原八九不离十。', rarity: 'common', effect: '生活质量略高', polarity: 'positive', attrBonus: { talentAptitude: 1, }, },
  { name: '懂礼貌', description: '见到长辈主动问好，接过东西会说谢谢，公共场所懂得排队和低声交谈；这些看似不起眼的习惯让认识你的人都觉得这孩子教养好。', rarity: 'common', effect: '初次印象更好', polarity: 'positive', attrBonus: { charisma: 1, }, },
  { name: '爱干净', description: '书桌永远整整齐齐，衣服就算旧也洗得干干净净；周围稍微乱一点就浑身不自在，这个习惯让你远离了很多小病小痛。', rarity: 'common', effect: '生病概率略低', polarity: 'positive', attrBonus: { physique: 1, }, },
  { name: '有主见', description: '面对选择时心里自有一杆秤，不会因为别人说什么就轻易改变想法；买什么东西、走哪条路、信谁的话，你都有自己的判断标准。', rarity: 'common', effect: '不容易被别人影响决定', polarity: 'positive', attrBonus: { charisma: 1, }, },
  { name: '记性不错', description: '见过一面的人名和脸能对上号，读过的文章过一阵还能复述大意；亲戚的生日、老师交代的事都记得清清楚楚，不需要特意记笔记。', rarity: 'common', effect: '记忆类任务略占优势', polarity: 'positive', attrBonus: { mind: 1, }, },
  { name: '早起习惯', description: '天刚蒙蒙亮就自然醒来，从不赖床；清晨的时光对你来说是一天中最清醒高效的时段，别人还在睡梦中时你已经做了不少事。', rarity: 'common', effect: '每日精力充沛', polarity: 'positive', attrBonus: { physique: 1, }, },
  { name: '有耐心', description: '钓鱼能坐一整天，拼图能反复试错直到完成最后一块；别人觉得枯燥的事你觉得很有意思，这份耐性让你在很多事上比别人做得更精细。', rarity: 'common', effect: '需要耐心的任务更容易完成', polarity: 'positive', attrBonus: { mind: 1, }, },
  { name: '有同情心', description: '看到别人受伤或难过时你心里也会跟着难受，忍不住想上前帮忙；路边的小猫小狗受伤了你也会心疼，这份柔软让你身边聚拢了不少真心朋友。', rarity: 'common', effect: '更容易获得他人好感', polarity: 'positive', attrBonus: { charisma: 1, }, },

  // ===================== 中立命格（mixed） =====================
  { name: '选择困难', description: '面对两个选项时脑子里会有两种声音打架，从午饭吃什么到买哪件衣服都能犹豫半天；虽然耗时，但你很少后悔自己的最终决定。', rarity: 'common', effect: '选择时耗时更久，但错误概率略低', polarity: 'mixed', attrBonus: { mind: -1, }, },
  { name: '怀旧', description: '旧照片、老玩具、儿时去过的那个小卖部——这些东西总能让你陷入回忆；你喜欢留着手边的东西不舍得扔，每件旧物都连着一段忘不掉的时光。', rarity: 'common', effect: '老物件相关事件有加成，但容易沉迷', polarity: 'mixed', attrBonus: { mind: -1, }, },
  { name: '慢热', description: '刚到新环境时总是安静地待在角落，不会主动和陌生人攀谈；但一旦相处久了、认定你是朋友了，就会变得格外真诚和热络，那份交情往往很长久。', rarity: 'common', effect: '长期关系更稳定，但初期稍难', polarity: 'mixed', attrBonus: {}, },
  { name: '完美主义', description: '作业里的一个字写歪了也要擦掉重写，做一件事不做到自己满意绝不罢休；这份追求极致的心让你的作品总是精良，但也常常把自己累得够呛。', rarity: 'common', effect: '作品质量高，但耗时更长', polarity: 'mixed', attrBonus: { talentAptitude: 1, mind: -1, }, },
  { name: '夜猫子', description: '白天昏昏沉沉提不起劲，但一到深夜就精神抖擞；万籁俱寂时是你最专注的时刻，效率比白天高出几倍，尽管第二天早起总是个挑战。', rarity: 'common', effect: '夜晚效率高，但白天精神差', polarity: 'mixed', attrBonus: { mind: 1, physique: -1, }, },

  // ===================== 负面命格 =====================
  { name: '容易忘事', description: '出门走到半路才想起忘了带钥匙，交代的事情转头就记不清细节；备忘录写了又写还是丢三落四，记性差这件事本身倒是记得很清楚。', rarity: 'common', effect: '经常忘记重要事情', polarity: 'negative', attrBonus: { mind: -1, }, },
  { name: '路痴', description: '在地图上看懂路线是一回事，走着走着又是另一回事了；明明来过的地方换个方向就不认识了，导航是你出门最离不开的东西。', rarity: 'common', effect: '容易迷路', polarity: 'negative', attrBonus: {}, },
  { name: '拖延症', description: '作业和任务总是等到截止日期前才开始动手，前期各种磨蹭找理由，后期疯狂赶工；虽然最后总能完成，但过程中的焦虑一点也没少受。', rarity: 'common', effect: '经常赶工', polarity: 'negative', attrBonus: { mind: -1, }, },
  { name: '粗心大意', description: '做题时思路是对的但计算总出错，写字一不留神就多一笔少一画；出门忘关灯、洗完忘拔插头，这些小失误在你的生活中频繁上演。', rarity: 'common', effect: '容易出错', polarity: 'negative', attrBonus: {}, },
  { name: '脾气急躁', description: '一遇到不顺心的事火气就往上蹿，说话声音跟着变大，脸也沉了下来；虽然发完火很快就消气了，但那些被你不经意伤到的话却收不回来了。', rarity: 'common', effect: '人际关系容易出问题', polarity: 'negative', attrBonus: { charisma: -1, }, },
  { name: '运气一般', description: '抽奖永远抽不到大奖，排队总是排到最慢的那一队，赶公交总是差那么几步；不是特别倒霉，但好事也很少自己落到你头上。', rarity: 'common', effect: '随机事件略差', polarity: 'negative', attrBonus: {}, },
  { name: '反应慢', description: '别人说完笑话大家都笑了你才反应过来，遇到突发情况总会愣一下才行动；运动场上球飞过来时你的身体总比脑子慢半拍，错过了不少好机会。', rarity: 'common', effect: '紧急情况容易出错', polarity: 'negative', attrBonus: { mind: -1, }, },
  { name: '挑食', description: '盘子里不喜欢的菜会一根根挑出来放边上，味道奇怪的东西尝一口就不肯再碰了；吃饭这件事上你有一套自己的规矩，换个地方吃饭经常吃不惯。', rarity: 'common', effect: '容易吃不好', polarity: 'negative', attrBonus: { physique: -1, }, },
  { name: '坐不住', description: '在椅子上坐不到二十分钟就想站起来走一走，看书看一会儿就忍不住摸手机；让你长时间安安静静地做同一件事简直是一种折磨，屁股像长了刺。', rarity: 'common', effect: '需要专注的任务困难', polarity: 'negative', attrBonus: { mind: -1, }, },
  { name: '胆子小', description: '一个人走夜路总觉得身后有脚步声，看恐怖片会好几天不敢关灯睡觉；遇到冲突和争吵时第一反应是想躲开，心跳加速手心冒汗是常态。', rarity: 'common', effect: '容易害怕', polarity: 'negative', attrBonus: { mind: -1, }, },
  { name: '不爱运动', description: '体育课跑两圈就喘不上气，能坐着绝不站着、能躺着绝不坐着；运动对你来说不是享受而是受罪，宁愿多走几步去近的地方也不愿意跑起来。', rarity: 'common', effect: '体质略差', polarity: 'negative', attrBonus: { physique: -1, }, },
  { name: '脸皮薄', description: '在众人面前说话脸会红到耳根，被老师点名回答问题声音小得像蚊子叫；向陌生人求助或者跟人讨价还价对你来说尤其艰难，宁可不做也不愿开口。', rarity: 'common', effect: '社交困难', polarity: 'negative', attrBonus: { charisma: -1, }, },
  { name: '丢三落四', description: '钥匙、钱包、学生证——这三样东西你轮流丢，每学期至少补办一次；明明出门时还记得带上的东西，到地方一摸口袋发现不知什么时候弄丢了。', rarity: 'common', effect: '经常找不到东西', polarity: 'negative', attrBonus: {}, },
]

// ============================================================
// 健康伤病（对齐废弃项目 advanceHealthRound）
// ============================================================

/** 默认最大生命值 */
export const DEFAULT_MAX_HP = 100

/** 默认体力 */
export const DEFAULT_STAMINA = 100

/** 默认精神（对齐废弃项目 mentalState 初始值 80） */
export const DEFAULT_SPIRIT = 80

/** 精神平衡点（向此值漂移） */
export const SPIRIT_BALANCE_POINT = 50

/** 精神漂移基础速率 + 魅力加成 */
export const SPIRIT_DRIFT_RATE_BASE = 1
export const SPIRIT_CHARISMA_BONUS = 0.1

/** 体力恢复 = max(1, round(体魄 * 2 * diffMult)) */
export const STAMINA_PHYSIQUE_MULTIPLIER = 2

/** HP 恢复（对齐废弃项目低 HP 分级惩罚） */
export const HP_RECOVERY_PHYSIQUE_MULT = 0.3
export const HP_RECOVERY_PHYSIQUE_MULT_SAFE = 0.8
export const HP_LOW_PENALTY_THRESHOLD_1 = 15
export const HP_LOW_PENALTY_THRESHOLD_2 = 25
export const HP_LOW_PENALTY_MULT_1 = 0.5
export const HP_LOW_PENALTY_MULT_2 = 0.6

// ============================================================
// 伤病严重度标签（10 级，对齐废弃项目 health-config.ts）
// ============================================================

/** 伤势严重度 10 级中文标签 */
export const INJURY_SEVERITY_LABELS: string[] = [
  '擦伤', '轻伤', '中度伤', '重伤', '危急',
  '致残', '濒死', '致命', '毁灭性', '无法治愈',
]

/** 疾病严重度 10 级中文标签 */
export const ILLNESS_SEVERITY_LABELS: string[] = [
  '轻微不适', '感冒', '发烧', '慢性病', '急性病',
  '重病', '危重病', '绝症', '瘟疫', '致命瘟疫',
]

// ============================================================
// 恢复速率自动计算表（对齐废弃项目 RECOVERY_BASE_RATES）
// ============================================================

/** 10 级恢复基础轮次表（severity 1→1轮 / 5→9轮 / 10→40轮） */
export const RECOVERY_BASE_RATES: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 6, 5: 9,
  6: 13, 7: 18, 8: 24, 9: 31, 10: 40,
}

// ============================================================
// 健康/精神状态文字标签（对齐废弃项目 getHealthStatusLabel / getMentalStateLabel）
// ============================================================

// ============================================================
// 重伤联动（对齐废弃项目重伤时精神加速恶化）
// ============================================================

/** 重伤时精神恶化倍率（HP < 15 时精神漂移速率 × 2） */
export const CRITICAL_HP_MENTAL_DECAY_MULT = 2

/** 重伤阈值（HP 低于此值触发精神加速恶化） */
export const CRITICAL_HP_MENTAL_THRESHOLD = 15

// ============================================================
// 添加伤病自动扣血（对齐废弃项目 addInjury/addIllness）
// ============================================================

/** 添加伤病时自动扣血乘数（HP -= severity × 1.5） */
export const AUTO_INJURY_DAMAGE_MULTIPLIER = 1.5

// ============================================================
// 寿命（对齐废弃项目 lifespan-config.ts + lifespan-breakthrough-config.ts）
// ============================================================

/** 基准人类寿命 */
export const BASE_HUMAN_LIFESPAN = 90

/** 最大寿命上限（对齐废弃项目硬上限） */
export const MAX_LIFESPAN_CAP = 300

/** 种族寿命表（对齐废弃项目 RACE_LIFESPAN，55 种族） */
export const RACE_LIFESPAN: Record<string, RaceLifespanConfig> = {
  // ---- 人类及亚种 ----
  human:    { name: '人类',   baseMaxAge: 100, goldenAgeRatio: [0.18, 0.40,], decayMultiplier: 1.0, },
  halfling: { name: '半身人', baseMaxAge: 100, goldenAgeRatio: [0.18, 0.40,], decayMultiplier: 1.0, },

  // ---- 精灵亚种 ----
  elf:          { name: '精灵',     baseMaxAge: 1000, goldenAgeRatio: [0.05, 0.30,], decayMultiplier: 0.1, },
  highElf:      { name: '高等精灵',  baseMaxAge: 3000, goldenAgeRatio: [0.03, 0.25,], decayMultiplier: 0.05, },
  nightElf:     { name: '暗夜精灵',  baseMaxAge: 1500, goldenAgeRatio: [0.04, 0.28,], decayMultiplier: 0.08, },
  bloodElf:     { name: '血精灵',   baseMaxAge: 800,  goldenAgeRatio: [0.06, 0.32,], decayMultiplier: 0.12, },
  darkelf:      { name: '暗精灵',   baseMaxAge: 800,  goldenAgeRatio: [0.06, 0.30,], decayMultiplier: 0.15, },

  // ---- 矮人 ----
  dwarf: { name: '矮人', baseMaxAge: 350, goldenAgeRatio: [0.10, 0.35,], decayMultiplier: 0.3, },

  // ---- 兽人/哥布林 ----
  orc:      { name: '兽人',   baseMaxAge: 80,  goldenAgeRatio: [0.15, 0.35,], decayMultiplier: 1.2, },
  halfOrc:  { name: '半兽人',  baseMaxAge: 60,  goldenAgeRatio: [0.17, 0.37,], decayMultiplier: 1.4, },
  goblin:   { name: '哥布林',  baseMaxAge: 50,  goldenAgeRatio: [0.20, 0.40,], decayMultiplier: 1.8, },
  beastman: { name: '兽人（兽化）', baseMaxAge: 70, goldenAgeRatio: [0.15, 0.35,], decayMultiplier: 1.3, },
  gnome:    { name: '地精',   baseMaxAge: 60,  goldenAgeRatio: [0.18, 0.40,], decayMultiplier: 1.6, },
  gnomeDeep:{ name: '侏儒',   baseMaxAge: 150, goldenAgeRatio: [0.15, 0.35,], decayMultiplier: 0.8, },

  // ---- 龙族 ----
  dragon:    { name: '龙族',  baseMaxAge: 50000, goldenAgeRatio: [0.01, 0.20,], decayMultiplier: 0.01, },
  dragonkin: { name: '龙裔',  baseMaxAge: 1500,  goldenAgeRatio: [0.10, 0.35,], decayMultiplier: 0.3, },
  halfDragon:{ name: '半龙',  baseMaxAge: 500,   goldenAgeRatio: [0.12, 0.38,], decayMultiplier: 0.5, },

  // ---- 仙神 ----
  immortal: { name: '仙人',  baseMaxAge: 10000,  goldenAgeRatio: [0, 0,],       decayMultiplier: 0, },
  divine:   { name: '神族',  baseMaxAge: 100000, goldenAgeRatio: [0.005, 0.15,], decayMultiplier: 0.001, },
  celestial:{ name: '仙族',  baseMaxAge: 50000,  goldenAgeRatio: [0.005, 0.15,], decayMultiplier: 0.001, },

  // ---- 魔族/妖族/鬼族 ----
  demon:  { name: '魔族', baseMaxAge: 3000, goldenAgeRatio: [0.03, 0.20,], decayMultiplier: 0.03, },
  monster:{ name: '妖族', baseMaxAge: 2000, goldenAgeRatio: [0.04, 0.25,], decayMultiplier: 0.05, },
  ghost:  { name: '鬼族', baseMaxAge: 5000, goldenAgeRatio: [0.02, 0.20,], decayMultiplier: 0.02, },

  // ---- 不死族 ----
  undead:  { name: '不死族', baseMaxAge: 999999, goldenAgeRatio: [0, 0,], decayMultiplier: 0, },
  undeadZombie:{ name: '僵尸', baseMaxAge: 5000, goldenAgeRatio: [0, 0,], decayMultiplier: 0, },
  undeadLich:  { name: '亡灵', baseMaxAge: 10000, goldenAgeRatio: [0, 0,], decayMultiplier: 0, },

  // ---- 吸血鬼/狼人 ----
  vampire:     { name: '吸血鬼',  baseMaxAge: 5000,  goldenAgeRatio: [0.02, 0.20,], decayMultiplier: 0.01, },
  halfVampire: { name: '半吸血鬼', baseMaxAge: 500,   goldenAgeRatio: [0.10, 0.35,], decayMultiplier: 0.3, },
  bloodline:   { name: '血族',    baseMaxAge: 10000, goldenAgeRatio: [0.01, 0.15,], decayMultiplier: 0.005, },
  werewolf:    { name: '狼人',    baseMaxAge: 150,   goldenAgeRatio: [0.15, 0.38,], decayMultiplier: 0.8, },

  // ---- 天使/恶魔 ----
  angel:     { name: '天使',   baseMaxAge: 50000, goldenAgeRatio: [0.005, 0.15,], decayMultiplier: 0.001, },
  fallenAngel:{ name: '堕天使', baseMaxAge: 30000, goldenAgeRatio: [0.005, 0.15,], decayMultiplier: 0.002, },
  archdemon: { name: '恶魔',   baseMaxAge: 10000, goldenAgeRatio: [0.01, 0.18,],  decayMultiplier: 0.005, },

  // ---- 妖精/人鱼/巨人 ----
  fairy:   { name: '妖精', baseMaxAge: 300, goldenAgeRatio: [0.12, 0.35,], decayMultiplier: 0.5, },
  merfolk: { name: '人鱼', baseMaxAge: 250, goldenAgeRatio: [0.10, 0.35,], decayMultiplier: 0.4, },
  giant:   { name: '巨人', baseMaxAge: 300, goldenAgeRatio: [0.10, 0.35,], decayMultiplier: 0.6, },

  // ---- AI / 机械 / 数字生命 ----
  aiEntity:      { name: 'AI 意识体',  baseMaxAge: 50000,  goldenAgeRatio: [0, 0,], decayMultiplier: 0, },
  android:       { name: '仿生人',     baseMaxAge: 300,    goldenAgeRatio: [0.05, 0.30,], decayMultiplier: 0.3, },
  cyborg:        { name: '机械改造人',  baseMaxAge: 200,    goldenAgeRatio: [0.10, 0.40,], decayMultiplier: 0.5, },
  machineLife:   { name: '机械生命',   baseMaxAge: 100000, goldenAgeRatio: [0, 0,],       decayMultiplier: 0, },
  digitalLife:   { name: '数字生命',   baseMaxAge: 100000, goldenAgeRatio: [0, 0,],       decayMultiplier: 0, },

  // ---- 其他科幻/奇幻 ----
  clone:        { name: '克隆体',   baseMaxAge: 80,  goldenAgeRatio: [0.15, 0.35,], decayMultiplier: 1.2, },
  alienHybrid:  { name: '外星混血', baseMaxAge: 200, goldenAgeRatio: [0.10, 0.35,], decayMultiplier: 0.7, },
  alien:        { name: '外星人',   baseMaxAge: 500, goldenAgeRatio: [0.08, 0.30,], decayMultiplier: 0.5, },
  elemental:    { name: '元素生物', baseMaxAge: 100000, goldenAgeRatio: [0, 0,], decayMultiplier: 0, },
  energyBeing:  { name: '能量体',   baseMaxAge: 100000, goldenAgeRatio: [0, 0,], decayMultiplier: 0, },
  alchemyGolem: { name: '炼金造物', baseMaxAge: 500, goldenAgeRatio: [0.05, 0.30,], decayMultiplier: 0.2, },
  magicBeast:   { name: '魔法生物', baseMaxAge: 1000, goldenAgeRatio: [0.05, 0.30,], decayMultiplier: 0.1, },
}

/** 世界观寿命修正映射表（对齐废弃项目 LIFESPAN_WORLD_MAP，44 世界观） */
export const LIFESPAN_WORLD_MAP: Record<string, number> = {
  '修仙世界': 300, '洪荒神话': 300, '玄幻大陆': 300,
  '龙与地下城': 300, '奥术大陆': 200, '英灵纪元': 200,
  '星际战锤': 200, '星穹铁道': 200, '黑暗森林': 200,
  '赛博朋克': 130, '文明纪元': 200, '西方奇幻': 300,
  '武侠江湖': 120, '忍者战国': 120, '海盗大航海': 100,
  '克苏鲁迷踪': 100, '维多利亚英伦': 100, '鬼灭之刃': 100,
  '龙血学院': 200, '斗罗大陆': 300, '精灵训练师': 150,
  '忍界风云': 120, '泰拉大陆': 200, '七神纪行': 300,
  '东方幻想乡': 300, '蛊师天下': 200, '序列之主': 300,
  '星海科幻': 200, '咒灵之战': 300, '武道割据': 200,
  '战锤40K': 200, '哈利波特': 150, '中土世界': 300,
  '漫威宇宙': 200, 'DC宇宙': 200, '死神境界': 300,
  '艾尔登法环': 300, '黑神话悟空': 300, '完美世界': 300,
  '斗气大陆': 300, '大主宰': 300, '牧神记': 300,
  '后室': 20,
}

/** 背景关键词寿命加成（对齐废弃项目 LIFESPAN_BG_BONUS_KEYWORDS） */
export const LIFESPAN_BG_BONUS_KEYWORDS: Record<string, number> = {
  '长生': 5000, '不死': 50000, '永生': 100000, '不朽': 100000,
  '系统无限寿命': 100000, '寿命无限': 100000, '寿命锁定': 100000,
  '寿元无限': 100000, '不老': 3000, '冻龄': 2000,
}

/** 穿越者检测关键词（对齐废弃项目 TRANSMIGRATOR_KEYWORDS，13 个） */
export const TRANSMIGRATOR_KEYWORDS: string[] = [
  '穿越', '魂穿', '重生', '转世', '夺舍', '附身', '觉醒', '系统', '绑定',
  '降临', '投影', '异世界', '魂越',
]

/** 开始检查突破的年龄比例阈值（age/maxAge > 0.85） */
export const BREAKTHROUGH_AGE_RATIO = 0.85

/** 突破基础概率 */
export const BREAKTHROUGH_BASE_CHANCE = 0.30

/** 每次突破后概率递减乘数 */
export const BREAKTHROUGH_DECAY_MULTIPLIER = 1.5

/** 6 种突破途径（对齐废弃项目 BreakthroughCondition） */
export const BREAKTHROUGH_PATHWAYS: Array<{
  pathway: BreakthroughPathway
  label: string
  description: string
  requiredLuck: number
  requiredWealth: number
  requiredReputation: number
  yearsGained: number
}> = [
  {
    pathway: 'rareElixir', label: '延寿丹药', description: '服用传说中的延寿仙丹',
    requiredLuck: 5, requiredWealth: 5000, requiredReputation: 30, yearsGained: 50,
  },
  {
    pathway: 'cultivation', label: '修为突破', description: '修行突破境界，生命层次跃升',
    requiredLuck: 6, requiredWealth: 2000, requiredReputation: 40, yearsGained: 80,
  },
  {
    pathway: 'divineBlessing', label: '神祇赐福', description: '获得神灵或超凡存在的寿命赐福',
    requiredLuck: 8, requiredWealth: 0, requiredReputation: 50, yearsGained: 100,
  },
  {
    pathway: 'forbiddenRitual', label: '禁忌仪式', description: '通过献祭或禁忌仪式强行延寿',
    requiredLuck: 4, requiredWealth: 3000, requiredReputation: -10, yearsGained: 60,
  },
  {
    pathway: 'techEnhancement', label: '科技改造', description: '通过尖端科技改造延长生命',
    requiredLuck: 3, requiredWealth: 10000, requiredReputation: 20, yearsGained: 40,
  },
  {
    pathway: 'ancientArtifact', label: '远古神器', description: '使用蕴含生命力的远古神器',
    requiredLuck: 7, requiredWealth: 1000, requiredReputation: 25, yearsGained: 70,
  },
]

/** 减寿关键词组及减少年数（对齐废弃项目 LIFESPAN_LOSS_EVENTS，支持多关键词匹配 + note 说明） */
export const LIFESPAN_REDUCTION_KEYWORDS: Array<{ keywords: string[]; yearsLost: number; note: string }> = [
  { keywords: ['重伤濒死', '丹田破碎', '经脉尽断',], yearsLost: 30, note: '重伤损及寿元根基', },
  { keywords: ['诅咒', '寿命诅咒', '寿元被夺',], yearsLost: 50, note: '被诅咒掠夺寿命', },
  { keywords: ['献祭寿命', '折寿', '燃烧寿元',], yearsLost: 20, note: '主动献祭或燃烧寿命', },
  { keywords: ['中毒', '慢性毒', '深入骨髓',], yearsLost: 10, note: '毒素侵蚀寿命', },
  { keywords: ['天劫', '雷劫', '渡劫失败',], yearsLost: 40, note: '天劫反噬折损寿元', },
  { keywords: ['走火入魔', '心魔反噬',], yearsLost: 25, note: '走火入魔损害根基', },
]

// ============================================================
// 生命阶段（对齐废弃项目 getLifeStageFromAge）
// ============================================================

/** 8 个生命阶段基础配置（AI 适配前，系数对齐废弃项目 vitality/learning/social） */
export const DEFAULT_LIFE_STAGES: Record<LifeStageId, Omit<LifeStageConfig, 'displayName' | 'eventPool' | 'avoidancePool'>> = {
  infant:       { id: 'infant',       ageRange: [0, 3,],   coefficients: { vitality: 0.3,  learning: 0.2, social: 0.1, }, },
  child:        { id: 'child',        ageRange: [3, 12,],  coefficients: { vitality: 0.6,  learning: 1.8, social: 0.8, }, },
  teenager:     { id: 'teenager',     ageRange: [12, 18,], coefficients: { vitality: 0.9,  learning: 1.5, social: 1.0, }, },
  young_adult:  { id: 'young_adult',  ageRange: [0, 0,],   coefficients: { vitality: 1.1,  learning: 1.2, social: 1.2, }, },
  adult:        { id: 'adult',        ageRange: [0, 0,],   coefficients: { vitality: 1.0,  learning: 0.9, social: 1.0, }, },
  middle_age:   { id: 'middle_age',   ageRange: [0, 0,],   coefficients: { vitality: 0.85, learning: 0.6, social: 0.9, }, },
  elder:        { id: 'elder',        ageRange: [0, 0,],   coefficients: { vitality: 0.5,  learning: 0.3, social: 0.6, }, },
  deceased:     { id: 'deceased',     ageRange: [0, 0,],   coefficients: { vitality: 0,    learning: 0,   social: 0, }, },
}

/** 生命阶段硬编码默认术语（AI 适配失败时使用） */
export const DEFAULT_STAGE_DISPLAY_NAMES: Record<LifeStageId, string> = {
  infant: '婴儿',
  child: '儿童',
  teenager: '少年',
  young_adult: '青年',
  adult: '壮年',
  middle_age: '中年',
  elder: '老年',
  deceased: '已故',
}

// ============================================================
// 年龄衰减（对齐废弃项目 age-decay-config.ts + age-decay-system.ts）
// ============================================================

/** 默认黄金年龄（human 绝对年龄） */
export const DEFAULT_PRIME_AGE_START = 18
export const DEFAULT_PRIME_AGE_END = 40

/** 按种族区分的衰减速率（对齐废弃项目 AGE_DECAY_RATES） */
export const AGE_DECAY_RATES: Record<string, Record<string, number>> = {
  human:    { physique: -0.3,  mind: -0.1,  talentAptitude: -0.15, charisma: -0.2, },
  elf:      { physique: -0.05, mind: -0.05, talentAptitude: -0.05, charisma: -0.05, },
  dragon:   { physique: -0.01, mind: -0.01, talentAptitude: -0.01, charisma: -0.01, },
  immortal: { physique: 0,     mind: 0,     talentAptitude: 0,     charisma: 0, },
}

/** 黄金年龄前增长率（对齐废弃项目 AGE_GROWTH_RATES，human 基准） */
export const AGE_GROWTH_RATES: Record<string, Record<string, number>> = {
  human: { physique: 0.5, mind: 0.3, talentAptitude: 0.2, charisma: 0.3, },
}

/** 心智经验补偿速率（对齐废弃项目，每年额外 +0.05） */
export const MIND_EXPERIENCE_BONUS = 0.05

/** 衰减修正钳制范围 */
export const DECAY_CLAMP_RANGE: [number, number] = [-10, 10,]

// ============================================================
// 善恶值（对齐废弃项目 extractMoralityChanges）
// ============================================================

/** 7 档善恶映射（对齐废弃项目小范围阈值 + 叙事描述） */
export const MORALITY_LEVELS: { level: MoralityLevel; label: string; description: string; range: [number, number] }[] = [
  { level: 'supremeGood', label: '至善',     description: '圣人出世，万众敬仰',   range: [8, Infinity,], },
  { level: 'greatGood',   label: '大善',     description: '乐善好施，名望远播',   range: [5, 8,], },
  { level: 'good',        label: '善良',     description: '品行端正',             range: [2, 5,], },
  { level: 'balanced',    label: '善恶平衡',  description: '凡人之心，善恶未分',   range: [-1, 2,], },
  { level: 'evilLeaning', label: '偏向恶行',  description: '渐入歧途，人心渐失',   range: [-4, -1,], },
  { level: 'greatEvil',   label: '大恶',     description: '恶名昭著',             range: [-7, -4,], },
  { level: 'supremeEvil', label: '极恶',     description: '十恶不赦，人人喊打',   range: [-Infinity, -7,], },
]

/** 善行关键词（对齐废弃项目 14+14 条，含分级匹配） */
export const MORALITY_GOOD_KEYWORDS_MINOR = ['行善', '施舍', '救人', '助人', '救济', '宽恕', '仁慈', '仗义',]
export const MORALITY_GOOD_KEYWORDS_MODERATE = ['伸张正义', '为民除害', '赈灾', '济困', '扶危', '仗义疏财',]
export const MORALITY_GOOD_KEYWORDS_MAJOR = ['舍己救人', '大义灭亲', '毁家纾难', '慷慨就义', '舍身取义', '救万民', '挽救苍生', '舍己', '奉献',]

/** 恶行关键词（对齐废弃项目 14+14 条，含分级匹配） */
export const MORALITY_EVIL_KEYWORDS_MINOR = ['作恶', '害人', '杀人', '欺骗', '出卖', '坑害', '见死不救',]
export const MORALITY_EVIL_KEYWORDS_MODERATE = ['陷害', '栽赃', '灭口', '背叛', '勒索', '残忍',]
export const MORALITY_EVIL_KEYWORDS_MAJOR = ['屠戮', '灭门', '滥杀无辜', '残害忠良', '丧尽天良', '十恶不赦',]

/** 善恶分档得分 */
export const MORALITY_SCORE_MINOR = 1
export const MORALITY_SCORE_MODERATE = 2
export const MORALITY_SCORE_MAJOR_GOOD = 3
export const MORALITY_SCORE_MAJOR_EVIL = -4

/** 叙事中须排除的句子关键词（对齐废弃项目 isPlayerAction） */
export const MORALITY_EXCLUDE_KEYWORDS = ['敌军', '敌人', '听说', '传言', '据说', '传闻', '他国', '他们', '邻国',]

/** 每轮善恶变化钳制 */
export const MORALITY_DELTA_CLAMP: [number, number] = [-10, 10,]

// ============================================================
// 存储键
// ============================================================

export const STORAGE_KEYS = {
  CHARACTER: 'mod-character:character',
  DESTINY_PATTERNS: 'mod-character:destiny-patterns',
  HEALTH: 'mod-character:health',
  LIFESPAN: 'mod-character:lifespan',
  LIFE_STAGE: 'mod-character:life-stage',
  DECAY: 'mod-character:decay',
  MORALITY: 'mod-character:morality',
  LUCK: 'mod-character:luck',
} as const

// ============================================================
// 气运（对齐废弃项目 luck-config.ts）
// ============================================================

/** 每点气运提升疾病回避概率 */
export const LUCK_DISEASE_AVOIDANCE_PER_POINT = 0.03

/** 每点气运提升死亡回避概率 */
export const LUCK_DEATH_AVOID_CHANCE_PER_POINT = 0.02

/** 每点气运向有利叙事方向偏移权重 */
export const LUCK_EVENT_WEIGHT_PER_POINT = 0.05

/** 每点气运减缓衰老速率 */
export const LUCK_AGE_DECAY_MODIFIER_PER_POINT = 0.01

/** 气运值范围 */
export const MIN_LUCK = 0
export const MAX_LUCK = 10

// ============================================================
// 死因推断（对齐废弃项目 death-constants.ts）
// ============================================================

/** 7 种死因中文标签 */
export const DEATH_CAUSE_LABELS: Record<DeathCause, string> = {
  old_age: '寿终正寝',
  illness: '疾病缠身',
  battle: '战死沙场',
  accident: '意外身亡',
  murder: '惨遭杀害',
  catastrophe: '天灾降临',
  unknown: '死因不明',
}
