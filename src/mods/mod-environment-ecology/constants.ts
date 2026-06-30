/**
 * @module constants.ts
 * @description mod-environment-ecology 常量 —— 气候带/灾害池/10种地形/物种池/污染等级
 * @mod mod-environment-ecology
 */

import type { ClimateZone, TerrainType, DisasterType, NaturalResourceType, PollutionLevel, SeasonEffect, SpecialSeason, SpeciesTemplate, IndustryType, } from './types'

// ============================================================
// §0 通用工具（已迁移至 utils.ts）
// ============================================================

// ============================================================
// §1 气候常量
// ============================================================

/** 季节顺序 */
export const SEASON_ORDER: readonly string[] = ['spring', 'summer', 'autumn', 'winter',]

/** 季节中文标签 */
export const SEASON_LABELS: Record<string, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

/** 气候带中文标签 */
export const CLIMATE_ZONE_LABELS: Record<ClimateZone, string> = {
  tropical: '热带',
  subtropical: '亚热带',
  temperate: '温带',
  boreal: '寒带',
  polar: '极地',
  arid: '干旱带',
  mediterranean: '地中海气候',
}

/** 灾害类型中文标签 */
export const DISASTER_LABELS: Record<DisasterType, string> = {
  flood: '洪水',
  drought: '干旱',
  earthquake: '地震',
  tsunami: '海啸',
  volcano: '火山喷发',
  storm: '暴风',
  blizzard: '暴雪',
  wildfire: '野火',
  plague: '瘟疫',
  locust: '蝗灾',
}

/** 灾害基础严重程度 */
export const DISASTER_BASE_SEVERITY: Record<DisasterType, number> = {
  flood: 50,
  drought: 45,
  earthquake: 70,
  tsunami: 85,
  volcano: 80,
  storm: 55,
  blizzard: 40,
  wildfire: 55,
  plague: 60,
  locust: 30,
}

/** 灾害池（按世界观） */
export const DISASTER_POOL_BY_WORLDVIEW: Record<string, readonly DisasterType[]> = {
  default: ['flood', 'drought', 'earthquake', 'storm', 'blizzard', 'wildfire', 'locust',],
  cultivation: ['flood', 'drought', 'earthquake', 'storm', 'wildfire', 'locust', 'volcano', 'tsunami',],
  scifi: ['earthquake', 'tsunami', 'volcano', 'storm', 'plague',],
  apocalypse: ['earthquake', 'volcano', 'wildfire', 'plague', 'tsunami', 'storm',],
}

/** 季节持续时间（回合） */
export const SEASON_DURATION = 25

/** 四季效果乘数 */
export const SEASON_EFFECTS: Record<string, SeasonEffect> = {
  spring: {
    diseaseRiskMultiplier: 1.2,
    incomeMultiplier: 1.0,
    staminaCostMultiplier: 1.0,
    healthRegenMultiplier: 1.1,
    narrativeTheme: '万物复苏',
  },
  summer: {
    diseaseRiskMultiplier: 1.0,
    incomeMultiplier: 1.1,
    staminaCostMultiplier: 1.3,
    healthRegenMultiplier: 0.9,
    narrativeTheme: '酷暑劳作',
  },
  autumn: {
    diseaseRiskMultiplier: 0.8,
    incomeMultiplier: 1.5,
    staminaCostMultiplier: 1.0,
    healthRegenMultiplier: 1.0,
    narrativeTheme: '丰收金秋',
  },
  winter: {
    diseaseRiskMultiplier: 1.5,
    incomeMultiplier: 0.7,
    staminaCostMultiplier: 1.5,
    healthRegenMultiplier: 0.7,
    narrativeTheme: '严寒凛冬',
  },
} as const

/** 世界观特殊季节 */
export const WORLD_SPECIAL_SEASONS: Record<string, readonly SpecialSeason[]> = {
  cultivation: [
    { name: '灵气潮汐', description: '灵气浓度上升，修炼事半功倍', },
  ],
  apocalypse: [
    { name: '辐射风暴', description: '辐射风暴肆虐，危险与机遇并存', },
  ],
  scifi: [
    { name: '量子波动', description: '量子场不稳定，科技设备异常频发', },
  ],
} as const

// ============================================================
// §2 地理常量
// ============================================================

/** 地形中文标签 */
export const TERRAIN_LABELS: Record<TerrainType, string> = {
  plain: '平原',
  mountain: '山脉',
  desert: '沙漠',
  forest: '森林',
  tundra: '冻土',
  ocean: '海洋',
  swamp: '沼泽',
  volcanic: '火山',
  underground: '地下',
  skyIsland: '空岛',
}

/** 地形行军难度 */
export const TERRAIN_MARCH_DIFFICULTY: Record<TerrainType, number> = {
  plain: 10,
  mountain: 85,
  desert: 55,
  forest: 40,
  tundra: 60,
  ocean: 90,
  swamp: 70,
  volcanic: 75,
  underground: 65,
  skyIsland: 95,
}

/** 地形基础海拔 */
export const TERRAIN_ELEVATION: Record<TerrainType, number> = {
  plain: 100,
  mountain: 3000,
  desert: 500,
  forest: 300,
  tundra: 200,
  ocean: -500,
  swamp: 50,
  volcanic: 2000,
  underground: -200,
  skyIsland: 5000,
}

/** 板块活动概率/年 */
export const TECTONIC_ACTIVITY_PROBABILITY = 0.05

/** 气候带迁移速率 */
export const CLIMATE_SHIFT_RATE = 0.1

/** 洪水→平原变沼泽概率 */
export const FLOOD_TO_SWAMP_CHANCE = 0.2

/** 火山喷发→地形变火山概率 */
export const VOLCANIC_ERUPTION_TERRAIN_CHANCE = 0.3

/** 人类活动→森林/沼泽变平原概率（每年） */
export const HUMAN_ACTIVITY_TERRAIN_CHANCE = 0.02

/** 陨石撞击→变火山概率（每年，选一个区域判定） */
export const METEOR_STRIKE_PROBABILITY = 0.005

/** 陨石撞击→该区域变火山概率 */
export const METEOR_TO_VOLCANIC_CHANCE = 0.5

// ============================================================
// §3 生态常量
// ============================================================

/** 世界观物种池（含多世界观分层） */
export const WORLDVIEW_SPECIES_POOL: readonly SpeciesTemplate[] = [
  // === 写实 / default ===
  { name: '虎', category: 'animal', rarity: 'rare', region: '森林', maxPopulation: 50, compatibleWorldviews: ['default', 'ancient_china',], role: 'predator', },
  { name: '狼', category: 'animal', rarity: 'uncommon', region: '森林/草原', maxPopulation: 100, compatibleWorldviews: ['default', 'ancient_china',], role: 'predator', },
  { name: '鹿', category: 'animal', rarity: 'common', region: '森林', maxPopulation: 300, compatibleWorldviews: ['default', 'ancient_china',], role: 'prey', },
  { name: '兔', category: 'animal', rarity: 'common', region: '草原', maxPopulation: 500, compatibleWorldviews: ['default', 'ancient_china',], role: 'prey', },
  { name: '橡树', category: 'plant', rarity: 'common', region: '温带', maxPopulation: 1000, compatibleWorldviews: ['default', 'ancient_china', 'cultivation',], role: 'producer', },
  { name: '草', category: 'plant', rarity: 'common', region: '全域', maxPopulation: 5000, compatibleWorldviews: ['default', 'ancient_china', 'cultivation',], role: 'producer', },
  { name: '蘑菇', category: 'plant', rarity: 'common', region: '森林', maxPopulation: 500, compatibleWorldviews: ['default', 'ancient_china',], role: 'decomposer', },
  { name: '蚯蚓', category: 'animal', rarity: 'common', region: '土壤', maxPopulation: 2000, compatibleWorldviews: ['default', 'ancient_china',], role: 'decomposer', },
  { name: '蜜蜂', category: 'animal', rarity: 'common', region: '花海', maxPopulation: 1000, compatibleWorldviews: ['default', 'ancient_china',], role: 'keystone', },
  { name: '海狸', category: 'animal', rarity: 'uncommon', region: '河流', maxPopulation: 80, compatibleWorldviews: ['default', 'ancient_china',], role: 'keystone', },
  { name: '鹰', category: 'animal', rarity: 'uncommon', region: '山脉', maxPopulation: 60, compatibleWorldviews: ['default', 'ancient_china',], role: 'predator', },
  { name: '蛇', category: 'animal', rarity: 'common', region: '森林/沙漠', maxPopulation: 200, compatibleWorldviews: ['default', 'ancient_china',], role: 'predator', },
  { name: '鼠', category: 'animal', rarity: 'common', region: '全域', maxPopulation: 1000, compatibleWorldviews: ['default', 'ancient_china', 'post_apocalyptic',], role: 'prey', },
  { name: '鱼', category: 'animal', rarity: 'common', region: '水域', maxPopulation: 2000, compatibleWorldviews: ['default', 'ancient_china',], role: 'prey', },
  { name: '松树', category: 'plant', rarity: 'common', region: '寒带', maxPopulation: 800, compatibleWorldviews: ['default', 'ancient_china',], role: 'producer', },
  { name: '藻类', category: 'plant', rarity: 'common', region: '水域', maxPopulation: 3000, compatibleWorldviews: ['default', 'ancient_china', 'sci_fi',], role: 'producer', },
  // === 修仙 ===
  { name: '灵鹿', category: 'spirit', rarity: 'uncommon', region: '灵脉森林', maxPopulation: 50, compatibleWorldviews: ['cultivation',], role: 'prey', },
  { name: '玉兔', category: 'spirit', rarity: 'common', region: '月华草原', maxPopulation: 200, compatibleWorldviews: ['cultivation',], role: 'prey', },
  { name: '九尾妖狐', category: 'monster', rarity: 'legendary', region: '青丘秘境', maxPopulation: 5, compatibleWorldviews: ['cultivation',], role: 'predator', },
  { name: '千年灵芝', category: 'plant', rarity: 'rare', region: '深山老林', maxPopulation: 20, compatibleWorldviews: ['cultivation',], role: 'producer', },
  { name: '龙血树', category: 'plant', rarity: 'legendary', region: '龙脉', maxPopulation: 3, compatibleWorldviews: ['cultivation',], role: 'producer', },
  { name: '灵气雀', category: 'spirit', rarity: 'common', region: '灵气充沛区', maxPopulation: 300, compatibleWorldviews: ['cultivation',], role: 'prey', },
  // === 奇幻 ===
  { name: '独角兽', category: 'animal', rarity: 'rare', region: '圣洁森林', maxPopulation: 15, compatibleWorldviews: ['western_fantasy', 'medieval_fantasy',], role: 'prey', },
  { name: '巨龙', category: 'monster', rarity: 'legendary', region: '龙脊山脉', maxPopulation: 8, compatibleWorldviews: ['western_fantasy', 'medieval_fantasy',], role: 'predator', },
  { name: '不死鸟', category: 'monster', rarity: 'legendary', region: '火山', maxPopulation: 3, compatibleWorldviews: ['western_fantasy', 'medieval_fantasy',], role: 'keystone', },
  { name: '树人', category: 'plant', rarity: 'rare', region: '古木森林', maxPopulation: 20, compatibleWorldviews: ['western_fantasy', 'medieval_fantasy',], role: 'producer', },
  { name: '狮鹫', category: 'animal', rarity: 'uncommon', region: '高山峭壁', maxPopulation: 40, compatibleWorldviews: ['western_fantasy', 'medieval_fantasy',], role: 'predator', },
  // === 科幻 ===
  { name: '蟹形异形生物', category: 'alien', rarity: 'uncommon', region: '异星湿地', maxPopulation: 60, compatibleWorldviews: ['sci_fi',], role: 'prey', },
  { name: '硅基生命体', category: 'alien', rarity: 'rare', region: '高辐射行星', maxPopulation: 10, compatibleWorldviews: ['sci_fi',], role: 'keystone', },
  { name: '能量鳗', category: 'alien', rarity: 'rare', region: '气态巨行星', maxPopulation: 25, compatibleWorldviews: ['sci_fi',], role: 'predator', },
  { name: '生物荧光藤', category: 'plant', rarity: 'common', region: '洞穴生态系统', maxPopulation: 200, compatibleWorldviews: ['sci_fi',], role: 'producer', },
  // === 废土 ===
  { name: '辐射巨猪', category: 'mutant', rarity: 'common', region: '辐射废土', maxPopulation: 80, compatibleWorldviews: ['post_apocalyptic', 'apocalypse',], role: 'prey', },
  { name: '食尸鬼', category: 'mutant', rarity: 'uncommon', region: '废弃城市', maxPopulation: 50, compatibleWorldviews: ['post_apocalyptic', 'apocalypse',], role: 'predator', },
  { name: '变异食人花', category: 'plant', rarity: 'uncommon', region: '辐射沼泽', maxPopulation: 30, compatibleWorldviews: ['post_apocalyptic', 'apocalypse',], role: 'predator', },
  { name: '辐射蟑螂', category: 'mutant', rarity: 'common', region: '废墟地道', maxPopulation: 500, compatibleWorldviews: ['post_apocalyptic', 'apocalypse',], role: 'decomposer', },
]

/** 默认物种池（向后兼容旧调用） */
export const SPECIES_POOL: readonly { name: string; role: SpeciesTemplate['role']; category: SpeciesTemplate['category']; rarity: SpeciesTemplate['rarity']; region: string; maxPopulation: number }[] =
  WORLDVIEW_SPECIES_POOL.filter((t,) => t.compatibleWorldviews.includes('default',),)

/** 生态健康范围 */
export const ECOLOGY_RANGE = { min: 0, max: 100, }

/** 生物多样性基准恢复率 */
export const BASE_BIODIVERSITY_RECOVERY = 0.5

/** 栖息地破坏影响系数 */
export const HABITAT_DAMAGE_FACTOR = 0.3

/** 入侵物种扩散概率 */
export const INVASIVE_SPREAD_PROBABILITY = 0.02

/** 灭绝威胁阈值 */
export const EXTINCTION_THREAT_THRESHOLD = 80

/** 灭绝概率（每次判定） */
export const EXTINCTION_PROBABILITY = 0.1

/** 每次灭绝，生物多样性指数下降值 */
export const EXTINCTION_INDEX_PENALTY = 3

/** 灭绝威胁上限 */
export const EXTINCTION_THREAT_MAX = 100

/** 生态阶段阈值 */
export const ECOLOGY_PHASE_THRIVING_THRESHOLD = 80
export const ECOLOGY_PHASE_DECLINING_THRESHOLD = 40
export const ECOLOGY_PHASE_COLLAPSE_THRESHOLD = 20

/** 生态阶段健康修正值 */
export const ECOLOGY_HEALTH_MODIFIERS: Record<string, number> = {
  thriving: 5,
  stable: 0,
  declining: -3,
  collapse: -8,
}

/** 过度开发：人口阈值（从 RoundContext 的 population 子系统读取） */

/** 过度开发警告触发年数 */
export const OVEREXPLOITATION_WARNING_YEARS = 3

/** 外部因素影响系数 */
export const EXTERNAL_DISASTER_PENALTY = 0.5
export const EXTERNAL_POPULATION_PRESSURE_FACTOR = 0.01

// ============================================================
// §4 自然资源常量
// ============================================================

/** 资源类型中文标签 */
export const RESOURCE_TYPE_LABELS: Record<NaturalResourceType, string> = {
  mineral: '矿产',
  forest: '森林',
  water: '水源',
  farmland: '耕地',
  energy: '能源',
  special: '特殊资源',
}

/** 资源初始储量 */
export const INITIAL_RESOURCE_RESERVES: Record<NaturalResourceType, number> = {
  mineral: 80,
  forest: 75,
  water: 70,
  farmland: 65,
  energy: 60,
  special: 30,
}

/** 基础再生速率 */
export const BASE_REGENERATION_RATE: Record<NaturalResourceType, number> = {
  mineral: 0.1,
  forest: 2.0,
  water: 1.5,
  farmland: 1.0,
  energy: 0.5,
  special: 0.2,
}

/** 基础消耗速率 */
export const BASE_CONSUMPTION_RATE: Record<NaturalResourceType, number> = {
  mineral: 1.5,
  forest: 1.0,
  water: 2.0,
  farmland: 1.5,
  energy: 1.0,
  special: 0.1,
}

/** 资源耗尽阈值 */
export const RESOURCE_DEPLETION_THRESHOLD = 10

/** 过度开发阈值：储量超过此值时消耗速率 ×1.5 */
export const OVEREXPLOITATION_THRESHOLD = 80

/** 低储量阈值：储量低于此值时再生速率 ×0.8 */
export const LOW_RESERVE_THRESHOLD = 30

// ============================================================
// §5 污染常量
// ============================================================

/** 污染等级标签 */
export const POLLUTION_LEVEL_LABELS: Record<PollutionLevel, string> = {
  0: '洁净',
  1: '轻微',
  2: '中等',
  3: '严重',
  4: '危险',
  5: '致命',
}

/** 污染等级阈值 */
export const POLLUTION_LEVEL_THRESHOLDS: readonly { max: number; level: PollutionLevel }[] = [
  { max: 20, level: 0, },
  { max: 35, level: 1, },
  { max: 50, level: 2, },
  { max: 65, level: 3, },
  { max: 80, level: 4, },
  { max: Infinity, level: 5, },
]

/** 自然衰减速率 */
export const NATURAL_DECAY_RATE = 1.5

/** 每点工业排放的污染增量 */
export const EMISSION_PER_INDUSTRY = 0.5

/** 产业类型排放系数映射（各区域按产业类型取不同排放值） */
export const INDUSTRY_EMISSION_MAP: Record<IndustryType, number> = {
  agriculture: 0.5,
  mining: 2,
  manufacturing: 3,
  magic: 1,
  military: 2.5,
  trade: 0.5,
  service: 0.5,
  mixed: 1.5,
}
