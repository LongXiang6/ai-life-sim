/**
 * Purpose: Define shared character-system constants and static configuration.
 * Owner: mod-character
 * Responsibility: Immutable character defaults, labels, and limits only.
 */

import type {
  BaseAttributes,
  DestinyPattern,
  DestinyPatternCategory,
  DestinyPatternAptitudeTier,
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
// 命格候选与携带槽
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
  'enhancement',
  'control',
  'perception',
  'summoning',
  'creation',
] as const

/** 每个分类的后台候选目标数。 */
export const DESTINY_PATTERN_CATEGORY_TARGET_COUNT = 12

/** 一批命格生成的五个独立分类任务。 */
export const AI_DESTINY_PATTERN_THREAD_ASSIGNMENTS: readonly (readonly DestinyPatternCategory[])[] = [
  ['enhancement'],
  ['control'],
  ['perception'],
  ['summoning'],
  ['creation'],
] as const

/** 命格类别名称与说明；类别只用于候选整理，不限制天赋题材或作用类型。 */
export const DESTINY_PATTERN_CATEGORY_CONFIG: Record<DestinyPatternCategory, { label: string; guidance: string }> = {
  enhancement: { label: '灵躯蜕变', guidance: '以身体、精神、形态、属性或成长进化产生直接改变为主；可包含再生、适应、熟练度和变身子型，但不限制其他能力类型。' },
  control: { label: '万象听令', guidance: '以主动影响外物、能量、元素、空间、时间或因果关系为主；可包含念动力、元素、矢量和时空子型，但不限制其他能力类型。' },
  perception: { label: '洞察天机', guidance: '以获得、解析、标记、预测或呈现信息为主；可包含鉴定、预感、读心、记忆和系统面板子型，但不限制其他能力类型。' },
  summoning: { label: '万灵随行', guidance: '以召唤、契约、复制体、伙伴或独立行动单元为主；可包含任务、契约和临时借用子型，但不限制其他能力类型。' },
  creation: { label: '造化成形', guidance: '以创造、合成、炼化、复制、提取或改变对象性质为主；可包含制造、资源转化和能力获取子型，但不限制其他能力类型。' },
}

/** 属性净加成与负属性绝对值均按资质阶位乘以此值封顶。 */
export const DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER = 2

/** 自定义世界编码起始偏移（对齐废弃项目 CUSTOM_WORLD_CODE_START） */
export const CUSTOM_WORLD_CODE_START = 10000

/** ID 编码前缀（预设/ AI 生成区分） */
export const DESTINY_PATTERN_ID_PREFIX = {
  PRESET: 'preset',
  AI: 'ai',
} as const

// ============================================================
// 命格资质展示配置
// ============================================================

export const DESTINY_PATTERN_APTITUDE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export const DESTINY_PATTERN_APTITUDE_CONFIG: Record<
  DestinyPatternAptitudeTier,
  { label: string; color: string }
> = {
  1: { label: '普通', color: '#64748b' },
  2: { label: '良好', color: '#15803d' },
  3: { label: '优秀', color: '#0369a1' },
  4: { label: '卓越', color: '#0f766e' },
  5: { label: '史诗', color: '#b45309' },
  6: { label: '传说', color: '#be123c' },
  7: { label: '神话', color: '#7e22ce' },
  8: { label: '本源', color: '#c2410c' },
  9: { label: '至高', color: '#1f2937' },
}

export const DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG = {
  awakening: { label: '初醒' },
  mastery: { label: '掌握' },
  complete: { label: '圆满' },
} as const

/** 自动进阶机缘的叙事气质；只影响路线表现，不改变阶段或资质。 */
export const DESTINY_PATTERN_OPPORTUNITY_CONFIG = {
  insight: { label: '顿悟', description: '长期积累后突然想通。' },
  crisis: { label: '危机觉醒', description: '在危险、失败或失去中被迫突破。' },
  legacy: { label: '传承回响', description: '师承、遗物、旧地或前史在关键时刻回应。' },
  mutation: { label: '异变', description: '力量失控、世界规则冲突或未知机缘改变了形态。' },
} as const

/** 内置原创能力池，模型不可用时仍保持开局资质与阶段契约。 */
export const PRESET_DESTINY_PATTERNS: Omit<DestinyPattern, 'id' | 'category' | 'lineageId' | 'version'>[] = [
  { name: '骨鸣换力', description: '撞击落在身上，骨节反而响起低鸣；下一拳挥出时，刚才吞下的冲力也沿指骨一并砸出。', aptitudeTier: 2, developmentStage: 'awakening', effect: '主动绷紧身体承受钝击时，可将身体承受范围内的一部分冲力暂存于骨节，再由下一次肢体动作释放；未被吸收的伤害照常成立，不能储存穿刺伤、叠存多次冲击或永久保留力量，骨骼受伤时无法使用。', attrBonus: { physique: 1 } },
  { name: '影衣蜕形', description: '闭眼屏息三息后，衣角与轮廓一同沉入暗处，让守望者更难看清你的动作。', aptitudeTier: 1, developmentStage: 'awakening', effect: '在有遮蔽的昏暗处屏息片刻，可让自身轮廓短暂融入邻近阴影；移动、受光或发出明显声响都会暴露位置，不能隐去实体。', attrBonus: { physique: 1 } },
  { name: '回伤织骨', description: '掌心贴住新鲜伤口，细密暖意沿裂口收拢，让浅伤止血结痂，却留不住流失的血。', aptitudeTier: 2, developmentStage: 'awakening', effect: '以手掌持续接触自身新鲜浅表伤口时，可加快止血和组织闭合；无法恢复失血、断肢或旧伤，持续施力与深度创口会打断效果。', attrBonus: { physique: 1 } },
  { name: '猎步借势', description: '追着同一个目标疾奔，脚下会接连亮起落点；踩中亮痕，下一步便借着上一踏的余劲弹出。', aptitudeTier: 2, developmentStage: 'awakening', effect: '锁定可见的移动目标后，落脚处会浮现适合自身步幅的追逐亮痕，踩中可回收部分上一踏的冲力；亮痕不保证道路安全，目标脱离视线即断开，不能凭空飞行或超过身体承受。', attrBonus: { physique: 1 } },
  { name: '碎雨牵丝', description: '雨水在指间绷成透明丝线，绕过栏杆缠住刀柄；手腕一收，整片雨帘都朝你的方向倾斜。', aptitudeTier: 1, developmentStage: 'awakening', effect: '以指尖接触现存清水后，可将相连水体拉成能牵引物件的水丝；拉力不超过自身手臂承受，必须保持接触与专注，水丝断裂或蒸散即失效，不能控制生物体内液体。', attrBonus: { mind: 1 } },
  { name: '折风回刃', description: '掷出的刃片越过门框，忽然在半空折向；它沿你目光划出的弧线，撞向躲在侧面的目标。', aptitudeTier: 1, developmentStage: 'awakening', effect: '亲手投出的物件尚在视线内时，可主动改变一次飞行方向；不能增加其动能或穿过实体，过重物体、失去视线和已有束缚都会使改向失败，回收时仍须自行接住。', attrBonus: { physique: 1 } },
  { name: '静默之握', description: '凝视并合拢五指，无形的手便扣住远处器物；锁舌缓缓退开，悬着的利刃停在半空。', aptitudeTier: 1, developmentStage: 'awakening', effect: '在看清对象并保持专注时，可用一道无形握力推拉或固定近处单件物体，受力不超过自身单手力量；不能伸入遮蔽内部或直接捏压活体器官，目标反抗与持续施力都会消耗体力。', attrBonus: {} },
  { name: '迟影寸步', description: '迈步后，旧位置还留着一道迟迟未散的人影；再扣响指节，身体便沿那一步的痕迹退回。', aptitudeTier: 3, developmentStage: 'awakening', effect: '主动迈步时可在原处留下一道误导视线的残影，在残影消散前主动沿刚走过的路径退回该落点；一次只保留一个落点，不能穿越新障碍、倒转受伤或带回已松手物品，路径被占据时无法退回。', attrBonus: { physique: 1 } },
  { name: '残音寻踪', description: '敲过门框再闭眼倾听，回声会把空腔与暗门的位置描出一圈薄亮边缘。', aptitudeTier: 2, developmentStage: 'awakening', effect: '在安静环境敲击相邻表面并专注聆听，可辨出近处空腔、夹层或明显结构差异；无法读出内部物件，也会受厚软材料和持续噪声干扰。', attrBonus: { mind: 1 } },
  { name: '血温识谎', description: '听完一句回答，对方的声音便在耳中分出冷暖；刻意违背所知的话，会留下一道刺耳杂音。', aptitudeTier: 1, developmentStage: 'awakening', effect: '面对面听清对象主动说出的完整陈述时，可听见其是否刻意违背自身认知的异常音色；不能读取真实答案、判断自以为真的错误或识别未说出口的隐瞒，模糊和歧义回答也可能无法分辨。', attrBonus: { mind: 1 } },
  { name: '一眼析隙', description: '目光沿器物边缘扫过，最先承力的裂纹会浮亮一瞬，提醒你从何处下手。', aptitudeTier: 1, developmentStage: 'awakening', effect: '专注检查一件可见器物时，可短暂标出最明显的松动、裂损或受力薄弱处；不能透视、判断成因，也不能发现被遮住的缺陷。', attrBonus: { mind: 1 } },
  { name: '梦痕预警', description: '临睡前握住一件牵挂之物，梦里会闪过它将遇险的碎片；醒来再见相同景象，耳边便响起碎裂声。', aptitudeTier: 3, developmentStage: 'awakening', effect: '入睡前持续接触一件具体物品，可在梦中接收它近期可能遭遇危险的一段感官碎片，现实线索吻合时触发提醒；只能牵挂一件物品，梦不提供完整时间、因果或必然结果，行动改变后原片段可能不再发生。', attrBonus: { luck: 1 } },
  { name: '纸鹤传信', description: '写下一句短话折成纸鹤，它便沿你看得见的路飞向熟悉的人，送达后落地。', aptitudeTier: 1, developmentStage: 'awakening', effect: '将一条简短信息写在纸上折成纸鹤，可使它沿可见且畅通的路线飞向熟悉对象；无法穿墙、避开守卫或确认收信者是否阅读。', attrBonus: { charisma: 1 } },
  { name: '灯下替身', description: '脚下影子站起身，替你推开门扇；你刚做完的动作，它会在另一处原样做出，连停顿也不差。', aptitudeTier: 2, developmentStage: 'awakening', effect: '在稳定光源下可分出一个具有触物力量的影身，令它在近处重复自己刚完成的一组简单动作；影身力量不超过本体，不能独立思考，需持续分神维持，光源消失或影身被击散即结束。', attrBonus: {} },
  { name: '回声役灵', description: '一句命令在墙间来回碰撞，空处便站起透明人形；它听完吩咐，抬起重箱穿过尘土。', aptitudeTier: 1, developmentStage: 'awakening', effect: '在有清晰回声的空间说出一个具体动作，可凝成单个役灵执行搬运、推拉或守住某处等简单指令；力量不超过本体，无法自行解释复杂意图，声音被持续噪声盖过或离开回声空间便消散。', attrBonus: { mind: 1 } },
  { name: '借感之约', description: '与愿意靠近的动物交换一个呼吸，随后片刻，你能感到它听见的方向与闻到的气息。', aptitudeTier: 2, developmentStage: 'awakening', effect: '与愿意接近的动物短暂对视并触碰后，可借用其一种感官片刻；只能接收模糊感觉，不能操纵动物或理解其记忆。', attrBonus: { charisma: 1 } },
  { name: '铜屑生刃', description: '散落的铜屑沿掌纹聚起，拉成锋亮的刃与钩；攥紧时金属低鸣，松手又碎成一捧细砂。', aptitudeTier: 1, developmentStage: 'awakening', effect: '接触铜质材料并集中精神，可把等量铜塑成自己理解的简单实心工具或刃器；不能增加材料、改变金属性质或制造复杂机关，持续维持会消耗体力，松手后形体逐渐碎散。', attrBonus: { physique: 1 } },
  { name: '旧物复新', description: '掌心按住坏掉的器具，裂缝便倒着合拢；旧齿轮再度咬合，重新走完本已停住的那一程。', aptitudeTier: 2, developmentStage: 'awakening', effect: '持续接触损坏但主要部件仍在的器具，可使其暂时恢复最近一次完好时的结构并正常使用；松手后逐步回到损坏状态，不能补出缺失的大块材料、凭空补充燃料或作用于活物。', attrBonus: { mind: 1 } },
  { name: '盐火炼印', description: '把火焰压进一撮盐里，晶粒便藏起暗红火光；捻碎撒出时，那口热意重新扑向眼前。', aptitudeTier: 2, developmentStage: 'awakening', effect: '用盐接触现存热源，可将一部分热量封入结晶，捻碎时在撒落处释放；热量来自原热源，盐会逐渐散热且受潮失效，不能借此制造无限火焰，过热结晶同样会烫伤持有者。', attrBonus: {} },
  { name: '影墨成形', description: '纸上画出的黑色阶梯忽然立起，墨迹托住脚底；你踏过它之后，身后的台阶逐层洇回纸面。', aptitudeTier: 3, developmentStage: 'awakening', effect: '以墨画出自己理解的简单物体，可从连续笔画中立起短暂实体供触碰和承重，并在维持期间调整已画出的连接处；材料来自墨迹与自身精力，形体须与原画相连，无法复制生命、精密机关或未知性质，断笔与力竭会使其坍散。', attrBonus: { mind: 1 } },
]

/** 预设候选按主要机制族编排。 */
export const PRESET_DESTINY_PATTERN_CATEGORY_BY_NAME: Readonly<Record<string, DestinyPatternCategory>> = {
  骨鸣换力: 'enhancement',
  影衣蜕形: 'enhancement',
  回伤织骨: 'enhancement',
  猎步借势: 'enhancement',
  碎雨牵丝: 'control',
  折风回刃: 'control',
  静默之握: 'control',
  迟影寸步: 'control',
  残音寻踪: 'perception',
  血温识谎: 'perception',
  一眼析隙: 'perception',
  梦痕预警: 'perception',
  纸鹤传信: 'summoning',
  灯下替身: 'summoning',
  回声役灵: 'summoning',
  借感之约: 'summoning',
  铜屑生刃: 'creation',
  旧物复新: 'creation',
  盐火炼印: 'creation',
  影墨成形: 'creation',
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
