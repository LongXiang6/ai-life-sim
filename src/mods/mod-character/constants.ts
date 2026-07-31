/**
 * @module constants.ts
 * @description 角色系统常量定义
 * @mod mod-character
 */

import type {
  BaseAttributes,
  DestinyPattern,
  DestinyPatternPolarity,
  DestinyPatternRarity,
  MoralityLevel,
  RaceLifespanConfig,
} from './types'

export { TRANSMIGRATOR_KEYWORDS } from '@/core/shared'

// ============================================================
// 基础属性
// ============================================================

/** 默认属性值 */
export const DEFAULT_ATTRIBUTE_VALUE = 0
/** 新人生的四项基础值；种族、命格和其他随机来源通过 modifiers 独立叠加。 */
export const ZERO_BASE_ATTRIBUTES: Readonly<BaseAttributes> = Object.freeze({
  physique: DEFAULT_ATTRIBUTE_VALUE,
  mind: DEFAULT_ATTRIBUTE_VALUE,
  talentAptitude: DEFAULT_ATTRIBUTE_VALUE,
  charisma: DEFAULT_ATTRIBUTE_VALUE,
})
/** 凡人领域下限 */
export const MIN_ATTRIBUTE_VALUE = -10
/** 凡人领域上限（人类物种极限；超出即踏入超凡领域） */
export const MAX_ATTRIBUTE_VALUE = 10

// ------------------------------------------------------------
// 超凡领域（Transcendence）
// ------------------------------------------------------------
//
// 设计（design-2026-07-06-compression-attributes.md 想法2）：
//   ±10 是凡人（人类物种）的极限区间。体魄/心智/悟性/魅力 4 项可突破此界限
//   向上（或向下）无限堆叠，进入超凡领域；隐藏属性气运(luck)/善恶(morality)
//   永久锁定在 ±10，不参与超凡堆叠。
//   下游系统（战力/寿命等）直接读取放开后的数值自行换算，无需额外「是否超凡」布尔字段。

/** 可超凡属性：突破 ±10 后无上限堆叠 */
export const TRANSCENDENT_ATTR_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma'] as const

/** 当前没有凡人锁定属性；气运/善恶由独立隐藏子系统锁定。 */
export const MORTAL_LOCKED_ATTR_KEYS = [] as const

/**
 * 属性硬上限/下限（防止数值溢出与 AI 失控；远超任何正常叙事所需）
 * 可超凡属性钳制到 [-ATTR_HARD_CAP, ATTR_HARD_CAP]，实际"无上限"体验由映射档位覆盖。
 */
export const ATTR_HARD_CAP = 100000

/**
 * 超凡领域档位阈值（正向；负向对称取绝对值）
 * 凡人：|v|≤10（沿用 11 档 ATTR_TIER_DESCRIPTIONS）
 * 超凡入圣：11–20 / 神性：21–40 / 神王：41–80 / 概念级：81+（公式化生成）
 */
export const TRANSCENDENT_TIER_THRESHOLDS = {
  mortalCap: 10,
  sage: 20,
  divine: 40,
  divineKing: 80,
} as const

/** 4 项基础属性名称 */
export const ATTRIBUTE_NAMES: Record<string, string> = {
  physique: '体魄',
  mind: '心智',
  talentAptitude: '悟性',
  charisma: '魅力',
}

/** 4 项基础属性 key 数组 */
export const ATTR_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma',] as const

/** 属性图标映射 */
export const ATTRIBUTE_ICONS: Record<string, string> = {
  physique: '\u{1F4AA}',
  mind: '\u{1F9E0}',
  talentAptitude: '\u2B50',
  charisma: '\u{1F4AB}',
}

/** 属性中文别名 → 英文 key 映射（用于从叙事文本中反向提取属性变化） */
export const ATTR_CN_ALIAS_TO_KEY: Record<string, string> = {
  '体魄': 'physique', '力量': 'physique', '体质': 'physique', '身体': 'physique',
  '心智': 'mind', '智力': 'mind', '智慧': 'mind', '头脑': 'mind',
  '悟性': 'talentAptitude', '天赋': 'talentAptitude', '资质': 'talentAptitude',
  '魅力': 'charisma', '容貌': 'charisma', '气质': 'charisma',
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

/** 首屏交接所需的有效命格数；达到后剩余候选在后台静默补齐。 */
export const DESTINY_PATTERN_EARLY_READY_COUNT = 5

/** 定版命格选择页展示的普通候选数。 */
export const DESTINY_PATTERN_DISPLAY_COUNT = 12

/** 旧调用方兼容别名：默认值仍表示首屏交接门槛，不代表展示槽位数。 */
export const DEFAULT_DESTINY_PATTERN_COUNT = DESTINY_PATTERN_EARLY_READY_COUNT

/** 玩家选择数量（选3，对齐废弃项目 TALENT_SELECT_COUNT） */
export const DESTINY_PATTERN_SELECT_COUNT = 3

/** 每局最多携带的轮回天赋数量。 */
export const MYTHIC_PATTERN_SELECT_COUNT = 2

/** 结算页一次生成的轮回天赋候选数。 */
export const MYTHIC_PATTERN_CANDIDATE_COUNT = 3

/** AI 批量生成：每路请求正好 10 条，后台最多 10 批填满约 100 条本地池。 */
export const AI_DESTINY_PATTERN_BATCH_SIZE = 10
export const AI_DESTINY_PATTERN_BATCH_COUNT = 10

/** AI 命格首屏并发路数：任一路先产出有效命格即可尽快完成首屏。 */
export const AI_DESTINY_PATTERN_FIRST_SCREEN_CONCURRENCY = 3

/** 批量数量 + 满池数量（对齐废弃项目 TALENT_BULK_COUNT / TALENT_FULL_POOL_COUNT） */
export const DESTINY_PATTERN_BULK_COUNT = 50
export const DESTINY_PATTERN_FULL_POOL_COUNT = 100

/** 快速抽取阈值（池 ≥90 条时跳过 AI 生成，对齐废弃项目 TALENT_POOL_FAST_DRAW_THRESHOLD） */
export const DESTINY_PATTERN_FAST_DRAW_THRESHOLD = 90

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
 *   'lower'  → 数值越小越有利（红色=好，绿色=坏）—— 如伤病进展、修炼瓶颈、死亡率、灾害频率等
 */

/** 个人向模拟系数元数据 */
export const DESTINY_PATTERN_PERSONAL_MODIFIER_META: Record<string, { label: string; benefitDirection: 'higher' | 'lower' }> = {
  luckPointModifier: { label: '气运获取', benefitDirection: 'higher' },
  vitalityRecoveryModifier: { label: '生命恢复', benefitDirection: 'higher' },
  staminaRecoveryModifier: { label: '体力恢复', benefitDirection: 'higher' },
  spiritRecoveryModifier: { label: '精神恢复', benefitDirection: 'higher' },
  conditionProgressionModifier: { label: '伤病进展', benefitDirection: 'lower' },
  cultivationSpeedModifier: { label: '修炼/战力成长', benefitDirection: 'higher' },
  bottleneckModifier: { label: '修炼瓶颈', benefitDirection: 'lower' },
  incomeModifier: { label: '职业收入', benefitDirection: 'higher' },
  fertilityModifier: { label: '家族生育', benefitDirection: 'higher' },
  devotionGainModifier: { label: '虔诚获取', benefitDirection: 'higher' },
  lifespanModifier: { label: '寿命上限', benefitDirection: 'higher' },
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
// 健康初值
// ============================================================

/** 默认生命状态值。运行时变化与恢复规则由 HealthSystem 独占。 */
export const DEFAULT_MAX_VITALITY = 100
export const DEFAULT_VITALITY = DEFAULT_MAX_VITALITY

/** 默认体力 */
export const DEFAULT_STAMINA = 100

/** 默认精神 */
export const DEFAULT_SPIRIT = 80

/** 默认当地恢复规则，所有速率均按天解释。 */
export const DEFAULT_HEALTH_RECOVERY_PER_DAY = 1
export const DEFAULT_STAMINA_RECOVERY_PER_DAY = 4
export const DEFAULT_SPIRIT_RECOVERY_PER_DAY = 2

/**
 * 种族寿命表（对齐废弃项目 RACE_LIFESPAN，55 种族）
 *
 * attrBaselines 取值尺度（design-2026-07-06-compression-attributes.md 想法2「主题化·有界」）：
 *   基准线本身留在凡人区间（|v|≤10），玩家满投单项 10 点后 current = 基准 + 10。
 *   顶级种族主属性封顶 +8 → 满投 18，落在「超凡入圣」（11–20）顶端，不越「神性」（21）。
 *   人类/半身人基准全 0 作对照组；未列种族默认无基准线（等同 0，向后兼容）。
 *   分级参考：凡人对照 0 / 温和加成 +1~+3 / 强壮种族 +3~+5 / 顶级种族 +6~+8；
 *   孱弱、无形、非人种族按主题给对应属性负基准（如魅力、体魄）。
 */
export const RACE_LIFESPAN: Record<string, RaceLifespanConfig> = {
  // ---- 人类及亚种（对照组，无基准线）----
  human:    { name: '人类',   baseLifespanYears: 100, clockMode: 'aging', },
  halfling: { name: '半身人', baseLifespanYears: 100, clockMode: 'aging', attrBaselines: { charisma: 1, physique: -1, }, },

  // ---- 精灵亚种（长寿善法，心智/悟性/魅力偏高，体魄偏弱）----
  elf:          { name: '精灵',     baseLifespanYears: 1000, clockMode: 'aging',  attrBaselines: { mind: 2, talentAptitude: 2, charisma: 2, physique: -1, }, },
  highElf:      { name: '高等精灵',  baseLifespanYears: 3000, clockMode: 'aging', attrBaselines: { mind: 4, talentAptitude: 4, charisma: 3, }, },
  nightElf:     { name: '暗夜精灵',  baseLifespanYears: 1500, clockMode: 'aging', attrBaselines: { mind: 2, talentAptitude: 3, charisma: 2, }, },
  bloodElf:     { name: '血精灵',   baseLifespanYears: 800,  clockMode: 'aging', attrBaselines: { mind: 2, talentAptitude: 3, charisma: 3, }, },
  darkelf:      { name: '暗精灵',   baseLifespanYears: 800,  clockMode: 'aging', attrBaselines: { mind: 2, talentAptitude: 2, charisma: 2, }, },

  // ---- 矮人（坚韧强壮，体魄高，魅力略低）----
  dwarf: { name: '矮人', baseLifespanYears: 350, clockMode: 'aging', attrBaselines: { physique: 3, charisma: -1, }, },

  // ---- 兽人/哥布林（体魄强，心智/悟性/魅力偏低）----
  orc:      { name: '兽人',   baseLifespanYears: 80,  clockMode: 'aging', attrBaselines: { physique: 4, mind: -1, charisma: -2, }, },
  halfOrc:  { name: '半兽人',  baseLifespanYears: 60,  clockMode: 'aging', attrBaselines: { physique: 2, charisma: -1, }, },
  goblin:   { name: '哥布林',  baseLifespanYears: 50,  clockMode: 'aging', attrBaselines: { physique: -1, charisma: -3, talentAptitude: 1, }, },
  beastman: { name: '兽人（兽化）', baseLifespanYears: 70, clockMode: 'aging', attrBaselines: { physique: 3, charisma: -1, }, },
  gnome:    { name: '地精',   baseLifespanYears: 60,  clockMode: 'aging', attrBaselines: { mind: 2, talentAptitude: 2, physique: -2, }, },
  gnomeDeep:{ name: '侏儒',   baseLifespanYears: 150, clockMode: 'aging', attrBaselines: { mind: 2, talentAptitude: 1, physique: -1, }, },

  // ---- 龙族（顶级种族，体魄/心智/威仪极高）----
  dragon:    { name: '龙族',  baseLifespanYears: 50000, clockMode: 'aging', attrBaselines: { physique: 8, mind: 6, talentAptitude: 6, charisma: 6, }, },
  dragonkin: { name: '龙裔',  baseLifespanYears: 1500,  clockMode: 'aging',  attrBaselines: { physique: 4, mind: 2, charisma: 3, }, },
  halfDragon:{ name: '半龙',  baseLifespanYears: 500,   clockMode: 'aging',  attrBaselines: { physique: 3, charisma: 2, }, },

  // ---- 仙神（顶级种族，悟性/心智/威仪极高）----
  immortal: { name: '仙人',  baseLifespanYears: 10000,  clockMode: 'ageless',     attrBaselines: { talentAptitude: 6, mind: 5, charisma: 4, physique: 3, }, },
  divine:   { name: '神族',  baseLifespanYears: 100000, clockMode: 'aging', attrBaselines: { physique: 6, mind: 7, talentAptitude: 8, charisma: 7, }, },
  celestial:{ name: '仙族',  baseLifespanYears: 50000,  clockMode: 'aging', attrBaselines: { talentAptitude: 7, mind: 6, charisma: 6, physique: 4, }, },

  // ---- 魔族/妖族/鬼族（强大偏邪，体魄/威仪高，视亚种而定）----
  demon:  { name: '魔族', baseLifespanYears: 3000, clockMode: 'aging', attrBaselines: { physique: 5, mind: 3, charisma: 4, }, },
  monster:{ name: '妖族', baseLifespanYears: 2000, clockMode: 'aging', attrBaselines: { physique: 4, talentAptitude: 3, charisma: 2, }, },
  ghost:  { name: '鬼族', baseLifespanYears: 5000, clockMode: 'aging', attrBaselines: { mind: 3, talentAptitude: 3, physique: -3, charisma: -2, }, },

  // ---- 不死族（无生机，体魄视形态而定，魅力多为负）----
  undead:  { name: '不死族', baseLifespanYears: 999999, clockMode: 'ageless', attrBaselines: { physique: 2, charisma: -3, }, },
  undeadZombie:{ name: '僵尸', baseLifespanYears: 5000, clockMode: 'ageless', attrBaselines: { physique: 3, mind: -5, talentAptitude: -4, charisma: -5, }, },
  undeadLich:  { name: '亡灵', baseLifespanYears: 10000, clockMode: 'ageless', attrBaselines: { mind: 5, talentAptitude: 5, physique: -2, charisma: -3, }, },

  // ---- 吸血鬼/狼人（魅力/体魄突出）----
  vampire:     { name: '吸血鬼',  baseLifespanYears: 5000,  clockMode: 'aging',  attrBaselines: { charisma: 5, physique: 4, mind: 3, }, },
  halfVampire: { name: '半吸血鬼', baseLifespanYears: 500,   clockMode: 'aging',   attrBaselines: { charisma: 3, physique: 2, }, },
  bloodline:   { name: '血族',    baseLifespanYears: 10000, clockMode: 'aging', attrBaselines: { charisma: 6, physique: 5, mind: 4, }, },
  werewolf:    { name: '狼人',    baseLifespanYears: 150,   clockMode: 'aging',   attrBaselines: { physique: 5, mind: -1, }, },

  // ---- 天使/恶魔（顶级种族，威仪/心智极高）----
  angel:     { name: '天使',   baseLifespanYears: 50000, clockMode: 'aging', attrBaselines: { charisma: 8, mind: 6, talentAptitude: 6, physique: 5, }, },
  fallenAngel:{ name: '堕天使', baseLifespanYears: 30000, clockMode: 'aging', attrBaselines: { charisma: 6, physique: 6, mind: 5, talentAptitude: 5, }, },
  archdemon: { name: '恶魔',   baseLifespanYears: 10000, clockMode: 'aging', attrBaselines: { physique: 7, mind: 5, charisma: 5, }, },

  // ---- 妖精/人鱼/巨人 ----
  fairy:   { name: '妖精', baseLifespanYears: 300, clockMode: 'aging', attrBaselines: { charisma: 3, talentAptitude: 2, physique: -3, }, },
  merfolk: { name: '人鱼', baseLifespanYears: 250, clockMode: 'aging', attrBaselines: { charisma: 4, mind: 1, }, },
  giant:   { name: '巨人', baseLifespanYears: 300, clockMode: 'aging', attrBaselines: { physique: 6, mind: -2, talentAptitude: -1, }, },

  // ---- AI / 机械 / 数字生命（心智/悟性高，魅力低，体魄视形态）----
  aiEntity:      { name: 'AI 意识体',  baseLifespanYears: 50000,  clockMode: 'ageless',   attrBaselines: { mind: 6, talentAptitude: 5, charisma: -2, }, },
  android:       { name: '仿生人',     baseLifespanYears: 300,    clockMode: 'aging', attrBaselines: { physique: 3, mind: 2, charisma: 1, }, },
  cyborg:        { name: '机械改造人',  baseLifespanYears: 200,    clockMode: 'aging', attrBaselines: { physique: 4, mind: 1, charisma: -1, }, },
  machineLife:   { name: '机械生命',   baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { physique: 5, mind: 4, talentAptitude: 2, charisma: -3, }, },
  digitalLife:   { name: '数字生命',   baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { mind: 6, talentAptitude: 4, physique: -2, charisma: -2, }, },

  // ---- 其他科幻/奇幻 ----
  clone:        { name: '克隆体',   baseLifespanYears: 80,  clockMode: 'aging', },
  alienHybrid:  { name: '外星混血', baseLifespanYears: 200, clockMode: 'aging', attrBaselines: { mind: 2, talentAptitude: 2, }, },
  alien:        { name: '外星人',   baseLifespanYears: 500, clockMode: 'aging', attrBaselines: { mind: 3, talentAptitude: 3, charisma: -1, }, },
  elemental:    { name: '元素生物', baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { physique: 4, talentAptitude: 3, charisma: -2, }, },
  energyBeing:  { name: '能量体',   baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { mind: 5, talentAptitude: 4, physique: -3, charisma: -3, }, },
  alchemyGolem: { name: '炼金造物', baseLifespanYears: 500, clockMode: 'aging', attrBaselines: { physique: 4, mind: -2, charisma: -3, }, },
  magicBeast:   { name: '魔法生物', baseLifespanYears: 1000, clockMode: 'aging', attrBaselines: { physique: 3, talentAptitude: 3, }, },
}

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

/** 气运值范围（隐藏基础属性，与显性属性统一为 -10~+10；0 为常人无特殊气运） */
export const MIN_LUCK = -10
export const MAX_LUCK = 10

/** 新人生只在本地随机生成的初始气运范围。 */
export const INITIAL_LUCK_MIN = -3
export const INITIAL_LUCK_MAX = 3

/** 零气运时三个叙事方向的基准概率。 */
export const BASE_BAD_LUCK_DIRECTION_PERCENT = 25
export const BASE_NEUTRAL_LUCK_DIRECTION_PERCENT = 50
export const BASE_GOOD_LUCK_DIRECTION_PERCENT = 25

/** 每点气运向对应好/坏方向转移的概率百分点。 */
export const LUCK_DIRECTION_PERCENT_PER_POINT = 5
