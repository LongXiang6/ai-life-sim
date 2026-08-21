/**
 * Purpose: Define shared character-system constants and static configuration.
 * Owner: mod-character
 * Responsibility: Immutable character defaults, labels, and limits only.
 */

import type {
  BaseAttributes,
  DestinyPattern,
  DestinyPatternCategory,
  DestinyPatternRarity,
  RaceLifespanConfig,
} from './types'


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
//   向上（或向下）无限堆叠，进入超凡领域；气运由状态系统独立管理。
//   永久锁定在 ±10，不参与超凡堆叠。
//   下游系统（战力/寿命等）直接读取放开后的数值自行换算，无需额外「是否超凡」布尔字段。

/** 可超凡属性：突破 ±10 后无上限堆叠 */
export const TRANSCENDENT_ATTR_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma'] as const

/** 当前没有凡人锁定属性；气运由角色状态独立管理。 */
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

/** 首批四类普通候选总数：每类各四条。 */
export const DESTINY_PATTERN_DISPLAY_COUNT = 16

/** 默认候选数量。 */
export const DEFAULT_DESTINY_PATTERN_COUNT = DESTINY_PATTERN_DISPLAY_COUNT

/** 普通命格与轮回天赋共用的每局携带槽位数。 */
export const PATTERN_LOADOUT_SLOT_COUNT = 4

/** 每个分类 AI 请求生成的命格数。 */
export const AI_DESTINY_PATTERN_BATCH_SIZE = 4

/** 普通命格的固定分类顺序。 */
export const DESTINY_PATTERN_CATEGORY_ORDER: readonly DestinyPatternCategory[] = [
  'battle',
  'exploration',
  'social',
  'production',
] as const

/** 每个分类的后台候选目标数。 */
export const DESTINY_PATTERN_CATEGORY_TARGET_COUNT = 12

/** 一批命格生成的四个独立分类任务。 */
export const AI_DESTINY_PATTERN_THREAD_ASSIGNMENTS: readonly (readonly DestinyPatternCategory[])[] = [
  ['battle'],
  ['exploration'],
  ['social'],
  ['production'],
] as const

/** 命格类别名称与说明。 */
export const DESTINY_PATTERN_CATEGORY_CONFIG: Record<DestinyPatternCategory, { label: string; guidance: string }> = {
  battle: { label: '战斗', guidance: '直接影响对抗、攻防、临场判断、承压或战斗方式。' },
  exploration: { label: '探索', guidance: '直接影响观察、求知、追踪、远行、发现或环境适应。' },
  social: { label: '社交', guidance: '直接影响交往、协作、说服、关系建立或群体位置。' },
  production: { label: '生产', guidance: '直接影响制作、经营、劳动、创造、维护或资源转化。' },
}

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
  mythic: { label: '神话', color: '#e879f9', glow: '0 0 24px #e879f9', },
}

/** 稀有度排序值（用于 UI 列表排序） */
export const DESTINY_PATTERN_RARITY_RANK: Record<DestinyPatternRarity, number> = {
  common: 0, fine: 1, rare: 2, epic: 3, legendary: 4, mythic: 5,
}

/** 内置预设命格库（AI 不可用时的降级池）。 */
export const PRESET_DESTINY_PATTERNS: Omit<DestinyPattern, 'id' | 'category' | 'lineageId' | 'version'>[] = [
  { name: '负重耐行', description: '你耐住奔走、负重与对抗的时间略长，体力恢复也更稳；连续透支后，仍会如常人一般力竭。', rarity: 'common', effect: '长时行动与体力恢复略占优势', attrBonus: { physique: 1, }, },
  { name: '守诺如山', description: '你答应的事会尽力办成，旁人因此更愿意托付；承诺过多时，仍须付出时间与精力。', rarity: 'common', effect: '更容易取得他人信任', attrBonus: { charisma: 1, }, },
  { name: '观微知著', description: '你能更早察觉人、物与环境的细微变化，常可从小处找到线索；信息不足时，仍不可凭直觉断定全貌。', rarity: 'common', effect: '察觉变化与发现线索略占优势', attrBonus: { mind: 1, }, },
  { name: '手稳工细', description: '你做手上功夫时更稳更细，重复工序不易出错；遇到陌生技艺，仍需从头练起。', rarity: 'common', effect: '重复制作与操作更稳定', attrBonus: { physique: 1, }, },
  { name: '静心守势', description: '你在受挫和对抗中更能稳住判断，不易被一时情绪带偏；惊变连至时，仍需靠经验应对。', rarity: 'common', effect: '压力下较易保持判断', attrBonus: { mind: 1, }, },
  { name: '食火知味', description: '你能较快掌握火候与调味，把寻常食材做得妥帖；食材与器具不足时，成品仍受限制。', rarity: 'common', effect: '烹饪与日常制作略占优势', attrBonus: { talentAptitude: 1, }, },
  { name: '知礼有度', description: '你能分辨场合与分寸，说话做事较少失礼；遇到陌生规矩时，仍需先观察学习。', rarity: 'common', effect: '初次相处更容易留下好印象', attrBonus: { charisma: 1, }, },
  { name: '洁身有序', description: '你习惯把住处、器具和流程收拾清楚，做事较少遗漏；环境长期混乱时，仍需花时间维持。', rarity: 'common', effect: '日常整理与卫生维护略占优势', attrBonus: { physique: 1, }, },
  { name: '持见不移', description: '你能在众说纷纭时保住自己的判断，不易轻易改口；若先入为主，也可能错过他人的提醒。', rarity: 'common', effect: '不易受外界言语左右', attrBonus: { charisma: 1, }, },
  { name: '过目留痕', description: '你对见过的人事与路径记得更牢，复述要点时较少遗漏；久远细节仍会随时间淡去。', rarity: 'common', effect: '记忆与复述略占优势', attrBonus: { mind: 1, }, },
  { name: '晨行识路', description: '你在清晨精神较清明，辨路、观察和整理线索更有效率；作息被打乱时，这份优势会减弱。', rarity: 'common', effect: '清晨探索与观察更有效率', attrBonus: { physique: 1, }, },
  { name: '耐心守成', description: '你能耐住重复与等待，把细小事务做完做好；进展过慢时，仍可能错过需要果断的时机。', rarity: 'common', effect: '耐心事务更容易完成', attrBonus: { mind: 1, }, },
  { name: '恻隐存心', description: '你能较快体会他人的难处，也愿意伸手相助；心软过度时，容易被他人的处境牵住。', rarity: 'common', effect: '更容易获得他人好感', attrBonus: { charisma: 1, }, },

  { name: '审慎决断', description: '你会多看一层后果再作决定，因此较少犯轻率的错；局势骤变时，判断也会比旁人慢半步。', rarity: 'common', effect: '复杂选择较少轻率失误', attrBonus: { mind: -1, }, },
  { name: '旧物留情', description: '你能从旧物与旧事中记住关系和线索，熟人相处更有分寸；过分执着旧事时，脚步会慢下来。', rarity: 'common', effect: '旧关系与旧物线索更易被记起', attrBonus: { mind: -1, }, },
  { name: '慢熟重情', description: '你与人熟识较慢，但一旦建立信任便较能长久相处；初见时不善主动，关系推进会更慢。', rarity: 'common', effect: '长期关系更稳定，初期较慢', attrBonus: {}, },
  { name: '精工细作', description: '你愿意反复校正细节，让成品更完整可靠；追求周全会多耗时间，急事中未必占优。', rarity: 'common', effect: '作品更完整，但耗时更长', attrBonus: { talentAptitude: 1, mind: -1, }, },
  { name: '夜读凝神', description: '你在夜深人静时更易集中精神，处理细事更有耐性；若缺少休息，次日的体力与反应会受影响。', rarity: 'common', effect: '夜间专注较强，白日恢复较慢', attrBonus: { mind: 1, physique: -1, }, },

  // ===================== 其余备用命格 =====================
  { name: '容易忘事', description: '出门走到半路才想起忘了带钥匙，交代的事情转头就记不清细节；备忘录写了又写还是丢三落四，记性差这件事本身倒是记得很清楚。', rarity: 'common', effect: '经常忘记重要事情', attrBonus: { mind: -1, }, },
  { name: '路痴', description: '在地图上看懂路线是一回事，走着走着又是另一回事了；明明来过的地方换个方向就不认识了，导航是你出门最离不开的东西。', rarity: 'common', effect: '容易迷路', attrBonus: {}, },
  { name: '拖延症', description: '作业和任务总是等到截止日期前才开始动手，前期各种磨蹭找理由，后期疯狂赶工；虽然最后总能完成，但过程中的焦虑一点也没少受。', rarity: 'common', effect: '经常赶工', attrBonus: { mind: -1, }, },
  { name: '粗心大意', description: '做题时思路是对的但计算总出错，写字一不留神就多一笔少一画；出门忘关灯、洗完忘拔插头，这些小失误在你的生活中频繁上演。', rarity: 'common', effect: '容易出错', attrBonus: {}, },
  { name: '脾气急躁', description: '一遇到不顺心的事火气就往上蹿，说话声音跟着变大，脸也沉了下来；虽然发完火很快就消气了，但那些被你不经意伤到的话却收不回来了。', rarity: 'common', effect: '人际关系容易出问题', attrBonus: { charisma: -1, }, },
  { name: '运气一般', description: '抽奖永远抽不到大奖，排队总是排到最慢的那一队，赶公交总是差那么几步；不是特别倒霉，但好事也很少自己落到你头上。', rarity: 'common', effect: '随机事件略差', attrBonus: {}, },
  { name: '反应慢', description: '别人说完笑话大家都笑了你才反应过来，遇到突发情况总会愣一下才行动；运动场上球飞过来时你的身体总比脑子慢半拍，错过了不少好机会。', rarity: 'common', effect: '紧急情况容易出错', attrBonus: { mind: -1, }, },
  { name: '挑食', description: '盘子里不喜欢的菜会一根根挑出来放边上，味道奇怪的东西尝一口就不肯再碰了；吃饭这件事上你有一套自己的规矩，换个地方吃饭经常吃不惯。', rarity: 'common', effect: '容易吃不好', attrBonus: { physique: -1, }, },
  { name: '坐不住', description: '在椅子上坐不到二十分钟就想站起来走一走，看书看一会儿就忍不住摸手机；让你长时间安安静静地做同一件事简直是一种折磨，屁股像长了刺。', rarity: 'common', effect: '需要专注的任务困难', attrBonus: { mind: -1, }, },
  { name: '胆子小', description: '一个人走夜路总觉得身后有脚步声，看恐怖片会好几天不敢关灯睡觉；遇到冲突和争吵时第一反应是想躲开，心跳加速手心冒汗是常态。', rarity: 'common', effect: '容易害怕', attrBonus: { mind: -1, }, },
  { name: '不爱运动', description: '体育课跑两圈就喘不上气，能坐着绝不站着、能躺着绝不坐着；运动对你来说不是享受而是受罪，宁愿多走几步去近的地方也不愿意跑起来。', rarity: 'common', effect: '体质略差', attrBonus: { physique: -1, }, },
  { name: '脸皮薄', description: '在众人面前说话脸会红到耳根，被老师点名回答问题声音小得像蚊子叫；向陌生人求助或者跟人讨价还价对你来说尤其艰难，宁可不做也不愿开口。', rarity: 'common', effect: '社交困难', attrBonus: { charisma: -1, }, },
  { name: '丢三落四', description: '钥匙、钱包、学生证——这三样东西你轮流丢，每学期至少补办一次；明明出门时还记得带上的东西，到地方一摸口袋发现不知什么时候弄丢了。', rarity: 'common', effect: '经常找不到东西', attrBonus: {}, },
]

/** 非 AI 模式使用的人工分类；未列入的旧预设不进入新分类抽取。 */
export const PRESET_DESTINY_PATTERN_CATEGORY_BY_NAME: Readonly<Record<string, DestinyPatternCategory>> = {
  负重耐行: 'battle',
  静心守势: 'battle',
  夜读凝神: 'battle',
  不爱运动: 'battle',
  观微知著: 'exploration',
  过目留痕: 'exploration',
  晨行识路: 'exploration',
  持见不移: 'exploration',
  旧物留情: 'exploration',
  守诺如山: 'social',
  知礼有度: 'social',
  恻隐存心: 'social',
  慢熟重情: 'social',
  手稳工细: 'production',
  食火知味: 'production',
  洁身有序: 'production',
  耐心守成: 'production',
  精工细作: 'production',
  审慎决断: 'production',
}

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
