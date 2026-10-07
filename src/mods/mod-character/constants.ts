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
  mind: DEFAULT_ATTRIBUTE_VALUE,
  physique: DEFAULT_ATTRIBUTE_VALUE,
  charisma: DEFAULT_ATTRIBUTE_VALUE,
  familyBackground: DEFAULT_ATTRIBUTE_VALUE,
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
//   ±10 是凡人（人类物种）的极限区间。心智/体魄/魅力/财富 4 项可突破此界限
//   向上（或向下）无限堆叠，进入超凡领域；气运由状态系统独立管理。
//   永久锁定在 ±10，不参与超凡堆叠。
//   下游系统（战力/寿命等）直接读取放开后的数值自行换算，无需额外「是否超凡」布尔字段。

/** 可超凡属性：突破 ±10 后无上限堆叠 */
export const TRANSCENDENT_ATTR_KEYS = ['mind', 'physique', 'charisma', 'familyBackground'] as const

/** 当前没有凡人锁定属性；气运由角色状态独立管理。 */
export const MORTAL_LOCKED_ATTR_KEYS = [] as const

/**
 * 属性硬上限/下限（防止数值溢出与 AI 失控；远超任何正常叙事所需）
 * 可超凡属性钳制到 [-ATTR_HARD_CAP, ATTR_HARD_CAP]，实际"无上限"体验由映射档位覆盖。
 */
export const ATTR_HARD_CAP = 100000

/**
 * 超凡领域档位阈值（正向；负向对称取绝对值）
 * 凡人：|v|≤10（沿用 -10..+10 的 21 档 ATTR_TIER_DESCRIPTIONS）
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
  mind: '心智',
  physique: '体魄',
  charisma: '魅力',
  familyBackground: '财富',
}
/** 4 项基础属性 key 数组 */
export const ATTR_KEYS = ['mind', 'physique', 'charisma', 'familyBackground',] as const

/** 属性图标映射 */
export const ATTRIBUTE_ICONS: Record<string, string> = {
  mind: '\u{1F9E0}',
  physique: '\u{1F4AA}',
  charisma: '\u{1F4AB}',
  familyBackground: '\u{1F3E0}',
}
/** 属性中文别名 → 英文 key 映射（用于从叙事文本中反向提取属性变化） */
export const ATTR_CN_ALIAS_TO_KEY: Record<string, string> = {
  '体魄': 'physique', '力量': 'physique', '体质': 'physique', '身体': 'physique',
  '心智': 'mind', '智力': 'mind', '智慧': 'mind', '头脑': 'mind',
  '财富': 'familyBackground', '家庭': 'familyBackground', '出身': 'familyBackground',
  '资源': 'familyBackground',
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

/** 首批五类普通候选总数：每类各四条。 */
export const DESTINY_PATTERN_DISPLAY_COUNT = 20

/** 默认候选数量。 */
export const DEFAULT_DESTINY_PATTERN_COUNT = DESTINY_PATTERN_DISPLAY_COUNT

/** 普通命格与轮回天赋共用的每局携带槽位数。 */
export const PATTERN_LOADOUT_SLOT_COUNT = 4

/** 每个分类 AI 请求生成的命格数。 */
export const AI_DESTINY_PATTERN_BATCH_SIZE = 4

/** 首批每个分类必须发布的普通候选数；不足时不交接到选择页。 */
export const DESTINY_PATTERN_CATEGORY_INITIAL_COUNT = AI_DESTINY_PATTERN_BATCH_SIZE

/** 普通命格的固定分类顺序。 */
export const DESTINY_PATTERN_CATEGORY_ORDER: readonly DestinyPatternCategory[] = [
  'action',
  'cognition',
  'expression',
  'stewardship',
  'misc',
] as const

/** 每个分类的后台候选目标数。 */
export const DESTINY_PATTERN_CATEGORY_TARGET_COUNT = 12

/** 一批命格生成的五个独立分类任务。 */
export const AI_DESTINY_PATTERN_THREAD_ASSIGNMENTS: readonly (readonly DestinyPatternCategory[])[] = [
  ['action'],
  ['cognition'],
  ['expression'],
  ['stewardship'],
  ['misc'],
] as const

/** 命格类别名称与说明；类别只用于候选整理，不限制天赋题材或作用类型。 */
export const DESTINY_PATTERN_CATEGORY_CONFIG: Record<DestinyPatternCategory, { label: string; guidance: string }> = {
  action: { label: '根基', guidance: '表示能力的底层倾向或成长根基；不限制天赋类型，可以表现为身体、心智、感知、技艺、关系、资源、运势或轻微异常，不能把本标签收窄为身体类。' },
  cognition: { label: '专精', guidance: '表示可被调用、练习或深化的明确优势；不限制天赋类型，题材、载体和作用对象不限，可以是战斗、知识、创造、社交、经营、探索或其他稳定机制。' },
  expression: { label: '特质', guidance: '表示角色稳定的能力特性或行为机制；不限制天赋类型，允许生成主动技能、被动倾向、条件效果、感知方式或关系影响，不限定为表达或性格。' },
  stewardship: { label: '规则', guidance: '表示一条清晰可观察的触发—作用—结果规则；不限制天赋类型，可以作用于行动、认知、关系、资源、环境或特殊现象，不要求属于经营或生产。' },
  misc: { label: '机缘', guidance: '表示机会、适配、共鸣或轻微偏转等高层天赋原型；不限制天赋类型，仍可生成任意类型的有限能力，不得把机缘写成必然成功、全知全能或决定命运。' },
}

/** 普通级命格的属性净分配与负属性绝对值上限。 */
export const DESTINY_PATTERN_COMMON_ATTRIBUTE_CAP = 2

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
  { name: '稳息行军', description: '开始持续移动或负重后，可主动调整步幅、呼吸和停歇，把体力消耗维持在可控制的节奏；连续透支仍会正常力竭。', rarity: 'common', effect: '长程行动中更容易保持稳定', attrBonus: { physique: 1, }, },
  { name: '承诺印记', description: '明确答应一件事后，会自然记住承诺内容并在交涉中主动回报进度；承诺过多时仍会分散时间与精力。', rarity: 'common', effect: '履行承诺时更容易建立信任', attrBonus: { charisma: 1, }, },
  { name: '察隙', description: '主动观察人、物或环境时，能先锁定不协调的细节，再沿着异常寻找线索；信息不足时不能直接还原全貌。', rarity: 'common', effect: '发现局部变化与线索略占优势', attrBonus: { mind: 1, }, },
  { name: '稳手校准', description: '开始重复操作后，可用固定手势和节奏及时修正偏差，让连续工序保持在较小误差内；陌生技艺仍需练习。', rarity: 'common', effect: '重复制作与操作更稳定', attrBonus: { physique: 1, }, },
  { name: '定势回稳', description: '遭遇压力、冲撞或对抗时，先固定呼吸与重心再作判断，能减少被第一轮情绪带偏；连续惊变仍需经验应对。', rarity: 'common', effect: '承压时较易保持判断', attrBonus: { mind: 1, }, },
  { name: '火候调谐', description: '处理火候或配比时，可通过气味、声音和表面变化主动微调步骤，把普通材料做得更妥帖；器具和材料不足时仍受限制。', rarity: 'common', effect: '烹饪与日常制作略占优势', attrBonus: { }, },
  { name: '察言应对', description: '初次交涉时，可先读取场合分寸再选择语气和动作，减少明显失礼；陌生规矩仍需观察学习。', rarity: 'common', effect: '初次相处更容易留下好印象', attrBonus: { charisma: 1, }, },
  { name: '流程归位', description: '开始整理住处、器具或事务时，能按固定顺序把物件和步骤归回位置，减少遗漏；长期混乱仍需持续投入。', rarity: 'common', effect: '日常整理与维护略占优势', attrBonus: { physique: 1, }, },
  { name: '定念校验', description: '面对互相矛盾的说法时，可主动复述依据并检查自己的判断，不易被一句话带偏；先入为主仍可能漏掉提醒。', rarity: 'common', effect: '复杂信息中较能保持判断', attrBonus: { charisma: 1, }, },
  { name: '记痕回放', description: '主动回想见过的人事或路径时，能先抓住关键顺序和显眼细节再复述；久远细节仍会淡去。', rarity: 'common', effect: '记忆与复述略占优势', attrBonus: { mind: 1, }, },
  { name: '晨息定位', description: '在清晨开始探索或整理线索时，可借更稳定的感知节奏确认方向和细节；作息被打乱时，效果会减弱。', rarity: 'common', effect: '清晨探索与观察更有效率', attrBonus: { physique: 1, }, },
  { name: '进度守恒', description: '面对重复、等待或缓慢事务时，可把任务拆成连续的小步并维持执行；需要立即转向时可能慢半拍。', rarity: 'common', effect: '耐心事务更容易完成', attrBonus: { mind: 1, }, },
  { name: '共情回响', description: '认真倾听他人时，能复述对方真正关心的部分并给出对应回应；过度投入时容易被对方处境牵住。', rarity: 'common', effect: '更容易取得他人好感', attrBonus: { charisma: 1, }, },

  { name: '风险预读', description: '作出重要决定前，可主动列出一层直接后果再选择，较少犯轻率的错；局势骤变时准备过程会拖慢反应。', rarity: 'common', effect: '复杂选择较少轻率失误', attrBonus: { mind: -1, }, },
  { name: '旧痕索引', description: '检查旧物或旧事时，能主动把细节与熟人关系对应起来，较快找回线索；过度回看旧事会拖慢当前行动。', rarity: 'common', effect: '旧关系与旧物线索更易被记起', attrBonus: { mind: -1, }, },
  { name: '信任蓄力', description: '初次相处时先观察而不急于靠近，一旦确认对方可靠便会持续投入并稳定回应；关系启动会比旁人更慢。', rarity: 'common', effect: '长期关系更稳定，初期推进较慢', attrBonus: {}, },
  { name: '复核成品', description: '交付前主动回看关键细节，可让成品更完整可靠；反复确认会额外消耗时间，急事中未必占优。', rarity: 'common', effect: '作品更完整，但耗时更长', attrBonus: { mind: -1, }, },
  { name: '夜间聚焦', description: '在安静环境中开始处理细事时，可维持较长的专注节奏；若用休息换取专注，次日体力与反应会受影响。', rarity: 'common', effect: '夜间专注较强，恢复较慢', attrBonus: { mind: 1, physique: -1, }, },

  { name: '拼接灵感', description: '遇到卡住的小问题时，可主动把两个不相干的细节并置，偶尔得到有限的新思路；灵感不能替代持续思考。', rarity: 'common', effect: '偶发获得有限的新思路', attrBonus: {}, },
  { name: '顺手时机', description: '处理小事前先观察周围条件，偶尔能抓住刚好空出的路径、工具或顺路机会；这种偏移无法左右重大结果。', rarity: 'common', effect: '小事偶尔得到轻微便利', attrBonus: {}, },
  { name: '环境回响', description: '主动留意冷热、明暗或空气变化时，能较早捕捉到局部异常；感觉模糊时仍需实际确认。', rarity: 'common', effect: '对环境细微异常略敏感', attrBonus: { physique: 1, }, },
  { name: '迁移入门', description: '接触陌生话题时，可主动借用相近领域的零碎经验找到入手步骤；没有基础时仍须按部学习。', rarity: 'common', effect: '跨领域入门略快一些', attrBonus: { }, },

  // ===================== 其余备用命格 =====================
  { name: '标记回收', description: '未主动留下标记的细节容易从记忆中滑走，但给物件、地点或任务做出明显标记后，能较快沿标记找回相关线索；没有标记时仍可能遗漏。', rarity: 'common', effect: '有标记时更容易找回遗忘线索', attrBonus: { mind: -1, }, },
  { name: '路痴', description: '在地图上看懂路线是一回事，走着走着又是另一回事了；明明来过的地方换个方向就不认识了，导航是你出门最离不开的东西。', rarity: 'common', effect: '容易迷路', attrBonus: {}, },
  { name: '拖延症', description: '作业和任务总是等到截止日期前才开始动手，前期各种磨蹭找理由，后期疯狂赶工；虽然最后总能完成，但过程中的焦虑一点也没少受。', rarity: 'common', effect: '经常赶工', attrBonus: { mind: -1, }, },
  { name: '粗心大意', description: '做题时思路是对的但计算总出错，写字一不留神就多一笔少一画；出门忘关灯、洗完忘拔插头，这些小失误在你的生活中频繁上演。', rarity: 'common', effect: '容易出错', attrBonus: {}, },
  { name: '情绪过载', description: '冲突升高时，你能迅速察觉对方的态度并直接亮明立场，避免长时间含糊拉扯；情绪一旦越过承受线，关系缓和会更困难。', rarity: 'common', effect: '冲突中立场更直接，但关系修复较慢', attrBonus: { charisma: -1, }, },
  { name: '运气一般', description: '抽奖永远抽不到大奖，排队总是排到最慢的那一队，赶公交总是差那么几步；不是特别倒霉，但好事也很少自己落到你头上。', rarity: 'common', effect: '随机事件略差', attrBonus: {}, },
  { name: '后手识变', description: '突发变化时会先捕捉模式再行动，复杂场面中较少被第一眼假象带偏；需要立即抢先时，准备过程会让你慢半拍。', rarity: 'common', effect: '复杂突发场面判断略稳，但抢先行动较慢', attrBonus: { mind: -1, }, },
  { name: '挑食', description: '盘子里不喜欢的菜会一根根挑出来放边上，味道奇怪的东西尝一口就不肯再碰了；吃饭这件事上你有一套自己的规矩，换个地方吃饭经常吃不惯。', rarity: 'common', effect: '容易吃不好', attrBonus: { physique: -1, }, },
  { name: '坐不住', description: '在椅子上坐不到二十分钟就想站起来走一走，看书看一会儿就忍不住摸手机；让你长时间安安静静地做同一件事简直是一种折磨，屁股像长了刺。', rarity: 'common', effect: '需要专注的任务困难', attrBonus: { mind: -1, }, },
  { name: '胆子小', description: '一个人走夜路总觉得身后有脚步声，看恐怖片会好几天不敢关灯睡觉；遇到冲突和争吵时第一反应是想躲开，心跳加速手心冒汗是常态。', rarity: 'common', effect: '容易害怕', attrBonus: { mind: -1, }, },
  { name: '预热蓄势', description: '静止后直接加速会明显吃力，但先完成短暂热身并找到节奏后，能把有限体力稳定投入持续行动；临场起步仍不占优。', rarity: 'common', effect: '进入节奏后持续行动更稳，但起步较慢', attrBonus: { physique: -1, }, },
  { name: '脸皮薄', description: '在众人面前说话脸会红到耳根，被老师点名回答问题声音小得像蚊子叫；向陌生人求助或者跟人讨价还价对你来说尤其艰难，宁可不做也不愿开口。', rarity: 'common', effect: '社交困难', attrBonus: { charisma: -1, }, },
  { name: '丢三落四', description: '钥匙、钱包、学生证——这三样东西你轮流丢，每学期至少补办一次；明明出门时还记得带上的东西，到地方一摸口袋发现不知什么时候弄丢了。', rarity: 'common', effect: '经常找不到东西', attrBonus: {}, },
]

/** 非 AI 模式使用的人工分类；未列入的旧预设不进入新分类抽取。 */
export const PRESET_DESTINY_PATTERN_CATEGORY_BY_NAME: Readonly<Record<string, DestinyPatternCategory>> = {
  稳息行军: 'action',
  定势回稳: 'action',
  预热蓄势: 'action',
  后手识变: 'action',
  察隙: 'cognition',
  记痕回放: 'cognition',
  晨息定位: 'cognition',
  定念校验: 'cognition',
  标记回收: 'cognition',
  承诺印记: 'expression',
  察言应对: 'expression',
  共情回响: 'expression',
  信任蓄力: 'expression',
  情绪过载: 'expression',
  稳手校准: 'stewardship',
  火候调谐: 'stewardship',
  流程归位: 'stewardship',
  进度守恒: 'stewardship',
  复核成品: 'stewardship',
  风险预读: 'stewardship',
  拼接灵感: 'misc',
  顺手时机: 'misc',
  环境回响: 'misc',
  迁移入门: 'misc',
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
  elf:          { name: '精灵',     baseLifespanYears: 1000, clockMode: 'aging',  attrBaselines: { mind: 2, charisma: 2, physique: -1, }, },
  highElf:      { name: '高等精灵',  baseLifespanYears: 3000, clockMode: 'aging', attrBaselines: { mind: 4, charisma: 3, }, },
  nightElf:     { name: '暗夜精灵',  baseLifespanYears: 1500, clockMode: 'aging', attrBaselines: { mind: 2, charisma: 2, }, },
  bloodElf:     { name: '血精灵',   baseLifespanYears: 800,  clockMode: 'aging', attrBaselines: { mind: 2, charisma: 3, }, },
  darkelf:      { name: '暗精灵',   baseLifespanYears: 800,  clockMode: 'aging', attrBaselines: { mind: 2, charisma: 2, }, },

  // ---- 矮人（坚韧强壮，体魄高，魅力略低）----
  dwarf: { name: '矮人', baseLifespanYears: 350, clockMode: 'aging', attrBaselines: { physique: 3, charisma: -1, }, },

  // ---- 兽人/哥布林（体魄强，心智/悟性/魅力偏低）----
  orc:      { name: '兽人',   baseLifespanYears: 80,  clockMode: 'aging', attrBaselines: { physique: 4, mind: -1, charisma: -2, }, },
  halfOrc:  { name: '半兽人',  baseLifespanYears: 60,  clockMode: 'aging', attrBaselines: { physique: 2, charisma: -1, }, },
  goblin:   { name: '哥布林',  baseLifespanYears: 50,  clockMode: 'aging', attrBaselines: { physique: -1, charisma: -3, }, },
  beastman: { name: '兽人（兽化）', baseLifespanYears: 70, clockMode: 'aging', attrBaselines: { physique: 3, charisma: -1, }, },
  gnome:    { name: '地精',   baseLifespanYears: 60,  clockMode: 'aging', attrBaselines: { mind: 2, physique: -2, }, },
  gnomeDeep:{ name: '侏儒',   baseLifespanYears: 150, clockMode: 'aging', attrBaselines: { mind: 2, physique: -1, }, },

  // ---- 龙族（顶级种族，体魄/心智/威仪极高）----
  dragon:    { name: '龙族',  baseLifespanYears: 50000, clockMode: 'aging', attrBaselines: { physique: 8, mind: 6, charisma: 6, }, },
  dragonkin: { name: '龙裔',  baseLifespanYears: 1500,  clockMode: 'aging',  attrBaselines: { physique: 4, mind: 2, charisma: 3, }, },
  halfDragon:{ name: '半龙',  baseLifespanYears: 500,   clockMode: 'aging',  attrBaselines: { physique: 3, charisma: 2, }, },

  // ---- 仙神（顶级种族，悟性/心智/威仪极高）----
  immortal: { name: '仙人',  baseLifespanYears: 10000,  clockMode: 'ageless',     attrBaselines: { mind: 5, charisma: 4, physique: 3, }, },
  divine:   { name: '神族',  baseLifespanYears: 100000, clockMode: 'aging', attrBaselines: { physique: 6, mind: 7, charisma: 7, }, },
  celestial:{ name: '仙族',  baseLifespanYears: 50000,  clockMode: 'aging', attrBaselines: { mind: 6, charisma: 6, physique: 4, }, },

  // ---- 魔族/妖族/鬼族（强大偏邪，体魄/威仪高，视亚种而定）----
  demon:  { name: '魔族', baseLifespanYears: 3000, clockMode: 'aging', attrBaselines: { physique: 5, mind: 3, charisma: 4, }, },
  monster:{ name: '妖族', baseLifespanYears: 2000, clockMode: 'aging', attrBaselines: { physique: 4, charisma: 2, }, },
  ghost:  { name: '鬼族', baseLifespanYears: 5000, clockMode: 'aging', attrBaselines: { mind: 3, physique: -3, charisma: -2, }, },

  // ---- 不死族（无生机，体魄视形态而定，魅力多为负）----
  undead:  { name: '不死族', baseLifespanYears: 999999, clockMode: 'ageless', attrBaselines: { physique: 2, charisma: -3, }, },
  undeadZombie:{ name: '僵尸', baseLifespanYears: 5000, clockMode: 'ageless', attrBaselines: { physique: 3, mind: -5, charisma: -5, }, },
  undeadLich:  { name: '亡灵', baseLifespanYears: 10000, clockMode: 'ageless', attrBaselines: { mind: 5, physique: -2, charisma: -3, }, },

  // ---- 吸血鬼/狼人（魅力/体魄突出）----
  vampire:     { name: '吸血鬼',  baseLifespanYears: 5000,  clockMode: 'aging',  attrBaselines: { charisma: 5, physique: 4, mind: 3, }, },
  halfVampire: { name: '半吸血鬼', baseLifespanYears: 500,   clockMode: 'aging',   attrBaselines: { charisma: 3, physique: 2, }, },
  bloodline:   { name: '血族',    baseLifespanYears: 10000, clockMode: 'aging', attrBaselines: { charisma: 6, physique: 5, mind: 4, }, },
  werewolf:    { name: '狼人',    baseLifespanYears: 150,   clockMode: 'aging',   attrBaselines: { physique: 5, mind: -1, }, },

  // ---- 天使/恶魔（顶级种族，威仪/心智极高）----
  angel:     { name: '天使',   baseLifespanYears: 50000, clockMode: 'aging', attrBaselines: { charisma: 8, mind: 6, physique: 5, }, },
  fallenAngel:{ name: '堕天使', baseLifespanYears: 30000, clockMode: 'aging', attrBaselines: { charisma: 6, physique: 6, mind: 5, }, },
  archdemon: { name: '恶魔',   baseLifespanYears: 10000, clockMode: 'aging', attrBaselines: { physique: 7, mind: 5, charisma: 5, }, },

  // ---- 妖精/人鱼/巨人 ----
  fairy:   { name: '妖精', baseLifespanYears: 300, clockMode: 'aging', attrBaselines: { charisma: 3, physique: -3, }, },
  merfolk: { name: '人鱼', baseLifespanYears: 250, clockMode: 'aging', attrBaselines: { charisma: 4, mind: 1, }, },
  giant:   { name: '巨人', baseLifespanYears: 300, clockMode: 'aging', attrBaselines: { physique: 6, mind: -2, }, },

  // ---- AI / 机械 / 数字生命（心智/悟性高，魅力低，体魄视形态）----
  aiEntity:      { name: 'AI 意识体',  baseLifespanYears: 50000,  clockMode: 'ageless',   attrBaselines: { mind: 6, charisma: -2, }, },
  android:       { name: '仿生人',     baseLifespanYears: 300,    clockMode: 'aging', attrBaselines: { physique: 3, mind: 2, charisma: 1, }, },
  cyborg:        { name: '机械改造人',  baseLifespanYears: 200,    clockMode: 'aging', attrBaselines: { physique: 4, mind: 1, charisma: -1, }, },
  machineLife:   { name: '机械生命',   baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { physique: 5, mind: 4, charisma: -3, }, },
  digitalLife:   { name: '数字生命',   baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { mind: 6, physique: -2, charisma: -2, }, },

  // ---- 其他科幻/奇幻 ----
  clone:        { name: '克隆体',   baseLifespanYears: 80,  clockMode: 'aging', },
  alienHybrid:  { name: '外星混血', baseLifespanYears: 200, clockMode: 'aging', attrBaselines: { mind: 2, }, },
  alien:        { name: '外星人',   baseLifespanYears: 500, clockMode: 'aging', attrBaselines: { mind: 3, charisma: -1, }, },
  elemental:    { name: '元素生物', baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { physique: 4, charisma: -2, }, },
  energyBeing:  { name: '能量体',   baseLifespanYears: 100000, clockMode: 'ageless', attrBaselines: { mind: 5, physique: -3, charisma: -3, }, },
  alchemyGolem: { name: '炼金造物', baseLifespanYears: 500, clockMode: 'aging', attrBaselines: { physique: 4, mind: -2, charisma: -3, }, },
  magicBeast:   { name: '魔法生物', baseLifespanYears: 1000, clockMode: 'aging', attrBaselines: { physique: 3, }, },
}
