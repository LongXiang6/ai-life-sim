/**
 * @module constants.ts
 * @description MOD 常量定义 —— 战力 23 阶可达体系 + 动态无限阶 + 经济价值映射 + 怪物世界观池 + 气运修正系数
 * @mod mod-power-system
 */

// ============================================================
// §1 战力 — 23 阶中文大数单位 + 不可达真无限
// ============================================================

/** 主阶段单位名 1-23（玩家可达）；24 为不可达的"真无限"概念 */
export const UNIT_NAMES: Record<number, string> = {
  1: '尘', 2: '万', 3: '亿',
  4: '兆', 5: '京', 6: '垓',
  7: '秭', 8: '穰', 9: '沟',
  10: '涧', 11: '正', 12: '载',
  13: '极', 14: '恒河沙', 15: '阿僧祇', 16: '那由它',
  17: '不可思议', 18: '无量', 19: '大数',
  20: '无量大数', 21: '虚空',
  22: '混沌', 23: '道',
  // 24 保留为"真无限"——不可达，仅作为概念存在于 AI Prompt 中
  24: '真无限',
} as const

/** 子阶段标签 1-5 */
export const SUB_STAGE_LABELS: Record<number, string> = {
  1: '初入', 2: '小成', 3: '大成', 4: '巅峰', 5: '登峰造极',
} as const

/** 子阶段跨越阈值 */
export const SUB_STAGE_THRESHOLDS: Record<number, number> = {
  1: 2000, 2: 4500, 3: 7000, 4: 9000, 5: 10000,
} as const

/** 修炼衰减系数（1-23 阶固定；23 阶之后动态计算） */
export const STAGE_DECAY: Record<number, number> = {
  1: 1.00, 2: 1.00, 3: 1.00,
  4: 0.60, 5: 0.60, 6: 0.60, 7: 0.60, 8: 0.60,
  9: 0.30, 10: 0.30, 11: 0.30, 12: 0.30,
  13: 0.10, 14: 0.10, 15: 0.10, 16: 0.10,
  17: 0.03, 18: 0.03, 19: 0.03, 20: 0.03,
  21: 0.005, 22: 0.005,
  23: 0.001,
  // 23 阶之后无固定衰减——由 getDynamicStageDecay() 动态计算
} as const

/** 基础修炼收益（每次修炼的基础 gain，受衰减系数调节） */
export const BASE_POWER_GAIN = 200

/** 顿悟加速倍数 — 子阶段突破后 50 次修炼内生效 */
export const INSIGHT_MULTIPLIER = 3

/** 顿悟持续修炼次数 */
export const INSIGHT_DURATION = 50

/** 玩家可达的最高战力阶位 */
export const MAX_REACHABLE_STAGE = 23

/** 战力上限最大等级（兼容旧代码，同 MAX_REACHABLE_STAGE） */
export const MAX_POWER_CEILING = 23

// ============================================================
// §2 战力 — 1~23 阶三层级量级描述
//
//   五个递进层级（世界观中立、通用框架）：
//     1-8  单一宇宙    — 同规则体系下，从个体到宇宙之巅
//     9-11 平行宇宙    — 同规异事，跨世界线不跨物理法则
//     12-14 多元宇宙   — 异规，不同规则体系的多元宇宙
//     15-17 无限宇宙   — 数量本身不再构成约束
//     18-22 叙事层级   — 一切存在的底层是叙事
//     23    完善之极   — 一切圆满，进入战力膨胀竞争
//
//   适配方式：每个阶段描述量级结果而非达成手段，AI 根据世界观自行映射具体表现。
// ============================================================

/** 1~23 阶战力描述（世界观中立，AI prompt 消费 + 名称适配的核心数据源） */
export const RATING_DESCRIPTIONS: Record<number, string> = {
  // ── 单一宇宙（1-8）──────────────────────────────────────
  1:  '个体级；生理极限内，影响米级',
  2:  '小队级；以一当十，影响百米级',
  3:  '战术级；凡俗数量优势失效，影响公里级',
  4:  '城邦级；常规军队难以压制，影响城市级',
  5:  '文明级；可覆灭小国或文明，寿命百年级',
  6:  '大陆级；可改写大陆地貌，寿命千年级',
  7:  '行星级；可支配全球自然现象，短期生存于虚空',
  8:  '宇宙级；影响恒星系至星系团，可自由生存于虚空',

  // ── 平行宇宙 — 同规异事（9-11）─────────────────────────
  9:  '平行感知；感知同规则、不同历史的平行世界',
  10: '平行穿行；跨平行世界线穿行、干预与重组',
  11: '平行聚合；存在规模覆盖完整平行世界体系',

  // ── 多元宇宙 — 异规（12-14）─────────────────────────────
  12: '多元感知；感知规则各异的多元宇宙',
  13: '多元穿行；跨异规则宇宙穿行并适应其规则',
  14: '高维存在；自定规则，可创造或毁灭单一宇宙',

  // ── 无限宇宙（15-17）────────────────────────────────────
  15: '跨无限意识；同时感知并干预无限宇宙',
  16: '无限聚合；无限宇宙信息汇为统一意识',
  17: '集体意志；成为所有世界与规则的共同意志',

  // ── 叙事层级（18-22）────────────────────────────────────
  18: '叙事感知；感知存在背后的叙事结构',
  19: '叙事干涉；改写叙事、因果与既定走向',
  20: '叙事之源；成为叙事源头及承载结构',
  21: '体系自洽；自身构成完备、独立的叙事宇宙',
  22: '万善之极；一切体系与结构均已完善',

  // ── 完善之极（23）──────────────────────────────────────
  23: '完善之极；所有维度圆满，仅余信息质量增速竞争',
} as const

/** 不可达的真无限概念描述（仅用于 AI Prompt，不作为玩家状态） */
export const TRUE_INFINITE_DESCRIPTION = '超越阶位与一切有限量级；不可达到，仅作边界概念'

// ============================================================
// §2b 动态无限阶：23 阶之后（信息质量军备竞赛）
//   23 阶之后不再比拼"谁更强"——一切体系已完善。
//   唯一剩下的竞争维度是信息质量膨胀速率：谁的增速更陡、谁的膨胀曲线更不可超越。
//   衰减公式 1/(n-22)^2 保证修炼永不为零，但增速渐近于停滞——"无限"永远在前方，永不可达。
// ============================================================

/** 23 阶之后的无限修饰词循环池 */
export const INFINITE_ADJECTIVES = [
  '无垠', '无边', '无穷', '无尽', '无极',
  '太虚', '混元', '鸿蒙', '元初', '终极',
  '无限之', '永恒之', '超越之', '不可名状之',
] as const

/** 动态阶位描述 */
export interface DynamicStage {
  /** 阶位编号（从 24 开始） */
  stageNumber: number
  /** 阶位名称 */
  name: string
  /** 修炼衰减系数（渐近于 0，永不为 0） */
  decay: number
  /** 战力表现描述 */
  description: string
}

/**
 * 23 阶之后的动态阶位生成（信息质量膨胀竞争）
 * @param currentStage - 当前阶位编号
 * @returns 下一阶位的动态信息（名称、衰减、描述）
 */
export function generateNextStage(currentStage: number): DynamicStage {
  const stageNumber = currentStage + 1
  const adjectiveIndex = (stageNumber - 24) % INFINITE_ADJECTIVES.length
  const adj = INFINITE_ADJECTIVES[adjectiveIndex]
  const cycles = Math.floor((stageNumber - 24) / INFINITE_ADJECTIVES.length) + 1
  const name = cycles === 1 ? `${adj}道` : `${adj}${cycles}重道`

  // 衰减 = 1 / (stageNumber - 22)^2 —— 渐近于 0，永不为 0
  const decay = 1 / Math.pow(stageNumber - 22, 2)

  const description =
    `超越了第${stageNumber - 1}阶的信息膨胀极限。` +
    `增长的速率自身也已开始加速增长。` +
    `真正的无限仍在更远的方向——它是一个方向，不是一个目标。`

  return { stageNumber, name, decay, description }
}

/**
 * 获取动态阶位的衰减系数（23 阶以下用固定表，23 阶以上动态计算）
 * @param stage - 阶位编号
 */
export function getDynamicStageDecay(stage: number): number {
  if (stage <= 23) return (STAGE_DECAY as Record<number, number>)[stage] ?? 1.0
  return 1 / Math.pow(stage - 22, 2)
}

// ============================================================
// §3 战力 — 工具函数（已迁移至 utils.ts，此处重新导出以保持兼容）
// ============================================================

export {
  getUnitName,
  getSubStageLabel,
  getStageDecay,
  getSubStageThreshold,
  isUltimateStage,
  isTrueInfinite,
} from './utils'

// ============================================================
// §4 战力 — 世界容器上限表（对齐废弃项目 getEstimatedWorldCapacity）
// ============================================================

/** 世界容器容量上限映射 */
export const WORLD_CAPACITY_MAP: Record<string, number> = {
  '位面': 8,
  '宇宙': 12,
  '位面晶壁群系': 18,
  '多元宇宙群系': 21,
  '诸天万界': 23,
} as const

/** 统一评级标签（1-23 阶 + 动态阶用 N+ 表示） */
export const UNIFIED_RATING_LABELS: Record<number, string> = {
  1: '1阶', 2: '2阶', 3: '3阶', 4: '4阶', 5: '5阶', 6: '6阶',
  7: '7阶', 8: '8阶', 9: '9阶', 10: '10阶', 11: '11阶', 12: '12阶',
  13: '13阶', 14: '14阶', 15: '15阶', 16: '16阶', 17: '17阶', 18: '18阶',
  19: '19阶', 20: '20阶', 21: '21阶', 22: '22阶', 23: '23阶',
  // 23 阶以上动态生成标签
} as const

export { getWorldCapacity, parsePowerCeilingLevel, getRatingLabel, formatCombatPower, } from './utils'

// ============================================================
// §5 怪物 — 世界观种类池（对齐废弃项目 MONSTER_TYPES_BY_WORLDVIEW）
// ============================================================

/** 按世界观区分的怪物种类池 */
export const MONSTER_TYPES_BY_WORLDVIEW: Record<string, readonly string[]> = {
  cultivation: ['妖兽', '妖魔', '阴魂', '邪祟', '古魔',],
  eastern_fantasy: ['妖兽', '妖魔', '阴魂', '邪祟', '古魔',],
  idealist: ['妖兽', '妖魔', '阴魂', '邪祟', '古魔',],
  western_fantasy: ['巨龙', '地精', '巨魔', '亡灵', '恶魔',],
  mixed: ['巨龙', '地精', '巨魔', '亡灵', '恶魔',],
  survival_horror: ['变异体', '丧尸', '寄生体', '深渊生物',],
  scifi: ['突变体', '失控AI', '异形生物', '外星掠食者', '纳米集群', '实验体', '机械叛军',],
  post_apocalyptic: ['变异兽', '丧尸', '掠夺者', '辐射畸变体', '机器残骸', '生化武器', '污染者',],
  materialist: ['野兽', '猛兽', '掠食者', '危险动物',],
}

/** 默认怪物种类（不匹配任何已知世界观时使用） */
export const DEFAULT_MONSTER_TYPES: readonly string[] = ['野兽', '精灵', '幽魂',]

// ============================================================
// §6 怪物 — 生态影响常量（对齐废弃项目 THREAT_* / SPAWN_* / EVOLUTION_*）
// ============================================================

/** 生态恶化 → 威胁 +10 */
export const THREAT_ECOLOGY_PENALTY = 10

/** 污染高 → 30% 概率威胁 +20 */
export const THREAT_POLLUTION_PENALTY = 20

/** 人口高 → 威胁 -5（人类聚居压制） */
export const THREAT_POPULATION_BONUS = -5

/** 人口对威胁的绝对影响值（配合 populationThreatDirection 使用） */
export const POPULATION_THREAT_MAGNITUDE = 5

/** 生态低阈值（< 30 判定为恶化） */
export const ECOLOGY_LOW_THRESHOLD = 30

/** 污染高阈值（> 60 触发污染惩罚） */
export const POLLUTION_HIGH_THRESHOLD = 60

/** 人口高阈值（> 50万 触发聚居压制） */
export const POPULATION_HIGH_THRESHOLD = 500000

/** 刷新频率基础值 */
export const SPAWN_FREQUENCY_BASE = 0.05

/** 刷新频率乘数 */
export const SPAWN_FREQUENCY_MULTIPLIER = 0.01

/** 新种类演化阈值（平均威胁 > 50 时可能演化） */
export const NEW_TYPE_THREAT_THRESHOLD = 50

/** 演化概率基础 */
export const EVOLUTION_CHANCE_BASE = 0.15

/** 变异怪物出现概率（污染触发时） */
export const MUTANT_MONSTER_CHANCE = 0.3

/** 怪物对战修正系数范围 */
export const MONSTER_MODIFIER_MIN = 0.3
export const MONSTER_MODIFIER_MAX = 2.0

/** 威胁等级范围 */
export const THREAT_MIN = 0
export const THREAT_MAX = 100

/** 刷新频率范围 */
export const SPAWN_FREQ_MIN = 0
export const SPAWN_FREQ_MAX = 1

// ============================================================
// §7 气运 — 修正系数常量（对齐废弃项目 luck-config.ts）
// ============================================================

/** 每点气运 → 疾病躲避概率修正 */
export const LUCK_DISEASE_AVOIDANCE_PER_POINT = 0.03

/** 每点气运 → 死亡回避概率修正 */
export const LUCK_DEATH_AVOID_CHANCE_PER_POINT = 0.02

/** 每点气运 → 叙事方向权重偏移 */
export const LUCK_EVENT_WEIGHT_PER_POINT = 0.05

/** 每点气运 → 衰老衰减修正 */
export const LUCK_AGE_DECAY_MODIFIER_PER_POINT = 0.01

/** 气运值范围 */
export const LUCK_MIN = 0
export const LUCK_MAX = 10

/** 大幅运气变化判定阈值（变化 ≥ ± 此值时触发通知） */
export const LUCK_MAJOR_CHANGE_THRESHOLD = 3

/** 大幅运气变化通知持续轮数 */
export const LUCK_NOTIFICATION_DURATION = 5

// ============================================================
// §8 浮点精度 + 通用工具函数（已迁移至 utils.ts，此处重新导出以保持兼容）
// ============================================================

export { round, clamp, pickRandom, computeAverage, ROUND_DECIMALS, } from './utils'

// ============================================================
// §9 材料 — 中文标签
// ============================================================

/** 稀有度中文标签 */
export const RARITY_LABELS: Record<string, string> = {
  common: '普通',
  uncommon: '稀有',
  rare: '罕见',
  fine: '精良',
  epic: '史诗',
  legendary: '传说',
} as const

/** 材料类别中文标签 */
export const CATEGORY_LABELS: Record<string, string> = {
  cultivation: '修仙',
  magic: '奇幻',
  scifi: '科幻',
  wasteland: '废土',
} as const

// ============================================================
// §10 至尊物品 — 世界观 → 物品池映射
// ============================================================

/** 世界观 → 至尊物品池映射（别名 → 实际池键） */
export const WORLDVIEW_TO_ITEM_TYPE: Record<string, string> = {
  cultivation: 'cultivation',
  eastern_fantasy: 'cultivation',
  idealist: 'cultivation',
  wuxia: 'cultivation',
  western_fantasy: 'western_fantasy',
  mixed: 'western_fantasy',
  scifi: 'scifi',
  cyberpunk: 'scifi',
  materialist: 'scifi',
  post_apocalyptic: 'crafted',
  survival_horror: 'crafted',
}

// ============================================================
// §11 战力→经济价值映射规则
// ============================================================

/** 经济层级描述 */
export interface EconomicTierInfo {
  label: string
  priceMultiplier: number  // -1 = 有价无市
  rarity: string
  availability: string
}

/** 战力阶段→经济层级映射 */
export const STAGE_ECONOMIC_TIER = {
  /**
   * 计算物品在当前世界观中的经济层级
   * @param itemStage    物品对应的战力阶位
   * @param worldCeiling 世界天花板（1-23）
   * @returns 经济层级 1-5（凡品→至尊）
   */
  calculateTier(itemStage: number, worldCeiling: number): number {
    const ratio = itemStage / worldCeiling
    if (ratio <= 0.25) return 1  // 凡品
    if (ratio <= 0.45) return 2  // 灵品
    if (ratio <= 0.65) return 3  // 仙品
    if (ratio <= 0.85) return 4  // 圣品
    return 5                      // 至尊
  },
} as const

/** 经济层级→价格系数表（注入 AI Prompt） */
export const ECONOMIC_TIER_CONFIG: Record<number, EconomicTierInfo> = {
  1: { label: '层级1', priceMultiplier: 1,    rarity: '随处可见', availability: '任何常规市场均可获得' },
  2: { label: '层级2', priceMultiplier: 10,   rarity: '较少见',     availability: '区域中心或专业渠道可获得' },
  3: { label: '层级3', priceMultiplier: 100,  rarity: '稀缺',       availability: '大型交易中心或拍卖场所' },
  4: { label: '层级4', priceMultiplier: 1000, rarity: '极罕见',     availability: '需特殊渠道或重大机缘' },
  5: { label: '层级5', priceMultiplier: -1,   rarity: '独一无二',   availability: '非常规手段难以取得' },
}

// ============================================================
// §12 存储键
// ============================================================

/** 存储键 */

export const STORAGE_KEYS = {
  /** 世界自定义：力量上限 */
  POWER_CEILING: 'mod-power-system:config:power-ceiling',
} as const
