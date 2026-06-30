/**
 * @module constants.ts
 * @description mod-tech-level 常量定义 —— 产业阈值+标签+污染因子、地形资源范围+世界观特殊资源、54 思潮名池、技术等级常量、工具函数
 * @mod mod-tech-level
 */

import type { PrimaryFocus, CultureTrendCategory, TerrainType, ResourceRangeEntry, } from './types'

// ============================================================
// §1 产业 — 主导产业阈值与标签
// ============================================================

/** 主导产业判定阈值（科技水平%）→ 产业类型 */
export const FOCUS_THRESHOLDS: readonly { max: number; focus: PrimaryFocus }[] = [
  { max: 15, focus: 'agriculture', },
  { max: 30, focus: 'mining', },
  { max: 50, focus: 'manufacturing', },
  { max: 70, focus: 'service', },
  { max: Infinity, focus: 'mixed', },
]

/** 主导产业中文标签 */
export const FOCUS_LABELS_ZH: Record<PrimaryFocus, string> = {
  agriculture: '农业',
  mining: '矿业',
  manufacturing: '制造业',
  service: '服务业',
  magic: '魔法',
  military: '军事',
  trade: '贸易',
  mixed: '多元化',
} as const

/** 各产业污染因子（供 B2.8 PollutionSystem 消费） */
export const POLLUTION_FACTORS: Record<PrimaryFocus, number> = {
  agriculture: 1.8,
  mining: 2.5,
  manufacturing: 3,
  service: 1,
  magic: 0.5,
  military: 2,
  trade: 1,
  mixed: 0.3,
} as const

/** 产业数值范围 */
export const TECH_LEVEL_RANGE = { min: 0, max: 100, } as const
export const RESOURCES_RANGE = { min: 0, max: 100, } as const
export const PRODUCTIVITY_RANGE = { min: 0.1, max: 100, } as const
export const ADOPTION_RANGE = { min: 0, max: 1, } as const

// ============================================================
// §2 资源 — 地形资源范围 + 世界观特殊资源 + 基础资源类型
// ============================================================

/** 基础资源类型 */
export const BASE_RESOURCES = {
  FOOD: 'food',
  WOOD: 'wood',
  STONE: 'stone',
  IRON: 'iron',
  COPPER: 'copper',
  COAL: 'coal',
  GOLD: 'gold',
} as const

/** 可再生资源列表 */
export const RENEWABLE_RESOURCES: readonly string[] = ['food', 'wood',]

/** 可再生资源恢复速率 */
export const RECOVERY_RATES: Record<string, number> = {
  food: 5,
  wood: 3,
} as const

/** 新矿脉发现概率（3%/轮） */
export const DISCOVERY_PROBABILITY = 0.03

/** 资源枯竭阈值（丰度 < 20 判定为枯竭） */
export const DEPLETION_THRESHOLD = 20

/** 基础地形类型（已迁移至 types.ts） */
/** 基础地形→资源范围映射表 */
export const BASE_TERRAIN_RESOURCE_RANGES: Record<TerrainType, readonly ResourceRangeEntry[]> = {
  plain: [
    { type: 'food', abundance: [60, 90,], },
    { type: 'wood', abundance: [20, 40,], },
    { type: 'stone', abundance: [10, 30,], },
    { type: 'iron', abundance: [5, 15,], },
    { type: 'copper', abundance: [5, 10,], },
    { type: 'coal', abundance: [5, 15,], },
  ],
  mountain: [
    { type: 'stone', abundance: [60, 90,], },
    { type: 'iron', abundance: [40, 70,], },
    { type: 'copper', abundance: [20, 40,], },
    { type: 'coal', abundance: [20, 40,], },
    { type: 'gold', abundance: [10, 30,], },
  ],
  desert: [
    { type: 'stone', abundance: [30, 50,], },
    { type: 'gold', abundance: [10, 20,], },
    { type: 'iron', abundance: [5, 10,], },
    { type: 'copper', abundance: [5, 15,], },
  ],
  forest: [
    { type: 'wood', abundance: [70, 100,], },
    { type: 'food', abundance: [30, 50,], },
    { type: 'iron', abundance: [5, 10,], },
    { type: 'coal', abundance: [10, 20,], },
  ],
  tundra: [
    { type: 'iron', abundance: [20, 40,], },
    { type: 'stone', abundance: [20, 40,], },
    { type: 'coal', abundance: [15, 30,], },
  ],
  ocean: [
    { type: 'food', abundance: [50, 80,], },
    { type: 'gold', abundance: [5, 10,], },
  ],
  swamp: [
    { type: 'wood', abundance: [30, 50,], },
    { type: 'coal', abundance: [20, 40,], },
  ],
  volcanic: [
    { type: 'iron', abundance: [50, 80,], },
    { type: 'gold', abundance: [20, 40,], },
    { type: 'coal', abundance: [10, 20,], },
  ],
  underground: [
    { type: 'stone', abundance: [50, 80,], },
    { type: 'iron', abundance: [30, 60,], },
    { type: 'gold', abundance: [15, 40,], },
    { type: 'coal', abundance: [20, 40,], },
  ],
  skyIsland: [
    { type: 'wood', abundance: [20, 40,], },
    { type: 'stone', abundance: [10, 20,], },
  ],
} as const

/** 世界观特殊资源附加表 */
export const WORLDVIEW_TERRAIN_EXTRAS: Record<string, Partial<Record<string, ResourceRangeEntry[]>>> = {
  cultivation: {
    mountain: [{ type: 'spiritOre', abundance: [5, 20,], },],
    forest: [{ type: 'herb', abundance: [40, 70,], },],
    swamp: [{ type: 'herb', abundance: [40, 60,], },],
    volcanic: [{ type: 'spiritOre', abundance: [10, 30,], },],
    underground: [{ type: 'spiritOre', abundance: [10, 30,], },],
    skyIsland: [{ type: 'spiritOre', abundance: [10, 25,], }, { type: 'herb', abundance: [30, 50,], },],
    plain: [{ type: 'herb', abundance: [10, 30,], },],
  },
  scifi: {
    underground: [{ type: 'rareEarth', abundance: [10, 30,], }, { type: 'plasmaCrystal', abundance: [3, 10,], },],
    mountain: [{ type: 'rareEarth', abundance: [5, 20,], }, { type: 'darkMatter', abundance: [1, 5,], },],
    desert: [{ type: 'rareEarth', abundance: [5, 15,], },],
    forest: [{ type: 'antimatter', abundance: [1, 5,], },],
  },
  materialist: {
    desert: [{ type: 'oil', abundance: [20, 50,], },],
    plain: [{ type: 'oil', abundance: [10, 30,], }, { type: 'naturalGas', abundance: [5, 20,], },],
    ocean: [{ type: 'oil', abundance: [15, 40,], },],
    tundra: [{ type: 'naturalGas', abundance: [20, 50,], }, { type: 'uranium', abundance: [2, 8,], },],
    underground: [{ type: 'rareEarth', abundance: [5, 15,], }, { type: 'lithium', abundance: [10, 25,], },],
    mountain: [{ type: 'uranium', abundance: [3, 10,], }, { type: 'lithium', abundance: [5, 15,], },],
  },
  western_fantasy: {
    mountain: [{ type: 'mithril', abundance: [5, 15,], }, { type: 'adamantite', abundance: [3, 10,], },],
    forest: [{ type: 'herb', abundance: [20, 50,], },],
    underground: [{ type: 'mithril', abundance: [3, 10,], }, { type: 'dragonScale', abundance: [1, 5,], },],
    swamp: [{ type: 'herb', abundance: [10, 30,], },],
    volcanic: [{ type: 'adamantite', abundance: [5, 15,], }, { type: 'dragonScale', abundance: [2, 8,], },],
  },
}

/** 资源中文标签 */
export const RESOURCE_LABELS: Record<string, string> = {
  food: '粮食', wood: '木材', stone: '石料',
  iron: '铁矿', copper: '铜矿', coal: '煤矿', gold: '金矿',
  spiritOre: '灵石', herb: '灵草',
  rareEarth: '稀土', plasmaCrystal: '等离子晶体', darkMatter: '暗物质', antimatter: '反物质',
  oil: '石油', naturalGas: '天然气', uranium: '铀矿', lithium: '锂矿',
  mithril: '秘银', adamantite: '精金', manaCrystal: '魔力水晶', dragonScale: '龙鳞',
  scrapMetal: '废金属', ammo: '弹药', fuel: '燃料', cleanWater: '净水',
  medicine: '药品', battery: '电池',
}

// ============================================================
// §3 文化技术 — 技术等级 + 思潮常量
// ============================================================

/** 技术等级范围 */
export const TECH_LEVEL_MIN = 1
export const TECH_LEVEL_MAX = 10
export const DEFAULT_TECH_LEVEL = 3

/** 技术突破概率（每轮 4%） */
export const TECH_BREAKTHROUGH_PROBABILITY = 0.04

/** 每轮基础进度 */
export const BASE_TECH_PROGRESS = 0.03

/** 贸易活动乘数 */
export const TRADE_BOOST_MULTIPLIER = 0.04

/** 知识总量乘数上限 */
export const KNOWLEDGE_BOOST_MAX = 0.05

/** 知识总量换算除率 */
export const KNOWLEDGE_DIVISOR = 0.001

/** 战争惩罚 */
export const WAR_TECH_PENALTY = -0.02

/** 活跃思潮上限（超过 3 个不再触发） */
export const MAX_ACTIVE_TRENDS = 3

/** 思潮持续时间范围 */
export const CULTURE_TREND_DURATION_MIN = 5
export const CULTURE_TREND_DURATION_MAX = 15

/** 知识修正：techLevel × 0.02 */
export const KNOWLEDGE_BONUS_PER_LEVEL = 0.02

/** 工作质量修正：活跃文艺/哲学思潮数 × 0.05 */
export const WORK_QUALITY_PER_TREND = 0.05

/** 6 大类 54 个思潮名称池（对齐废弃项目 CULTURE_TREND_POOL） */
export const CULTURE_TREND_POOL: Record<CultureTrendCategory, readonly string[]> = {
  art: ['文艺复兴', '古典主义', '浪漫主义', '印象派', '巴洛克', '新艺术运动',],
  philosophy: ['百家争鸣', '理学兴起', '心学流派', '启蒙运动', '实证主义', '存在主义',],
  science: ['算学革新', '天文观测', '医学突破', '冶金术', '火药研发', '航海技术',],
  military: ['阵法革新', '骑兵战术', '攻城术', '火器应用', '兵法总结', '水军建设',],
  commerce: ['钱庄体系', '海禁开放', '商帮崛起', '票号盛行', '市舶司', '契约制度',],
  religion: ['佛学东渐', '道教革新', '禅宗兴盛', '密宗传播', '景教东来', '民间信仰',],
} as const

/** 思潮类别中文标签 */
export const TREND_CATEGORY_LABELS: Record<CultureTrendCategory, string> = {
  art: '艺术',
  philosophy: '哲学',
  science: '科学',
  military: '军事',
  commerce: '商业',
  religion: '宗教',
} as const

// ============================================================
// §4 浮点精度 + 通用工具函数（已迁移至 utils.ts）
// ============================================================
