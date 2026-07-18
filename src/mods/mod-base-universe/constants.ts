/**
 * @module constants
 * @description mod-base-universe 常量定义 —— 天象/纪元/世界地图/命运预言 4 组常量
 * @mod mod-base-universe
 */

import type {
  CelestialPhase,
  CelestialEvent,
  EraHints,
  MapTemplate,
  TerrainType,
  ProphecySource,
  ProphecyOmenStage,
  ProphecyTemplate,
  TerrainWeight,
  CelestialProbabilityConfig,
} from './types'

export { round, } from './utils'

// ============================================================
// §4.0 STORAGE_KEYS（存档持久化键）
// ============================================================

export const STORAGE_KEYS = {
  /** 世界地图状态（含 regions、narrativeBackground、factionRelations） */
  WORLD_MAP: 'mod-base-universe:world-map',
} as const

// ============================================================
// §4.2.1 天象常量
// ============================================================

export const CELESTIAL_PHASE_LABELS: Record<CelestialPhase, string> = {
  normal: '星象平稳',
  auspicious: '吉兆降临',
  omen: '凶兆示警',
  anomaly: '天地异象',
}

/** 世界观术语适配：materialist/scifi 下避免迷信术语 */
export const CELESTIAL_PHASE_LABELS_BY_WORLDVIEW: Record<string, Partial<Record<CelestialPhase, string>>> = {
  materialist: { omen: '异常天文现象', },
  scifi: { omen: '异常天文现象', },
}

export const CELESTIAL_LUCK_MODS: Record<CelestialPhase, number> = {
  normal: 0,
  auspicious: 15,
  omen: -10,
  anomaly: 5,
}

export const CELESTIAL_PHASE_DURATION_RANGE: [number, number] = [1, 3,]

export const CELESTIAL_COOLDOWN_RANGE: [number, number] = [2, 4,]

export const CELESTIAL_PROBABILITIES: Record<string, CelestialProbabilityConfig> = {
  scifi: { anomaly: 0.03, auspicious: 0.12, omen: 0.20, },
  cultivation: { anomaly: 0.04, auspicious: 0.12, omen: 0.20, },
  eastern_fantasy: { anomaly: 0.04, auspicious: 0.12, omen: 0.20, },
  western_fantasy: { anomaly: 0.03, auspicious: 0.12, omen: 0.22, },
  post_apocalyptic: { anomaly: 0.04, auspicious: 0.08, omen: 0.25, },
  survival_horror: { anomaly: 0.05, auspicious: 0.05, omen: 0.30, },
  default: { anomaly: 0.02, auspicious: 0.10, omen: 0.18, },
}

/** 稀有度权重：掷骰选中概率 = 权重 / 同阶段所有权重之和 */
export const CELESTIAL_RARITY_WEIGHTS: Record<string, number> = {
  common: 5,
  rare: 2,
  epic: 1,
}

export const CELESTIAL_EVENT_POOL: Record<CelestialPhase, CelestialEvent[]> = {
  normal: [
    { name: '天象平稳', hint: '星辰运转如常', luckMod: 0, skillMod: 0, healthMod: 0, rarity: 'common', },
  ],
  auspicious: [
    { name: '紫微星亮', hint: '紫微星格外明亮，主贵人相助', luckMod: 15, skillMod: 0.1, healthMod: 0, rarity: 'common', },
    {
      name: '九星连珠', hint: '九星排成一线，天地灵气大盛', luckMod: 20, skillMod: 0.2, healthMod: 5, rarity: 'epic',
      prerequisites: [
        { type: 'worldAge', value: '>1000', },
        { type: 'worldview', value: 'cultivation,eastern_fantasy', },
        { type: 'previousPhase', value: 'anomaly', },
      ],
    },
    { name: '荧惑守心', hint: '火星停留心宿，主战事获胜', luckMod: 10, skillMod: 0, healthMod: 0, rarity: 'rare', },
  ],
  omen: [
    { name: '彗星过境', hint: '扫帚星划过天际，人心惶惶', luckMod: -10, skillMod: 0, healthMod: -3, rarity: 'common', },
    { name: '日食', hint: '天狗食日，阴阳失衡', luckMod: -8, skillMod: 0, healthMod: -5, rarity: 'rare', },
    { name: '血月', hint: '赤月当空，不祥之兆', luckMod: -12, skillMod: 0, healthMod: -8, rarity: 'epic', },
  ],
  anomaly: [
    { name: '双日同天', hint: '天现二日，必有妖异', luckMod: 5, skillMod: 0.3, healthMod: -5, rarity: 'rare', },
    { name: '天裂', hint: '苍穹裂开缝隙，异域气息涌入', luckMod: 0, skillMod: 0.25, healthMod: -10, rarity: 'epic', },
    { name: '星河倒转', hint: '银河逆转方向，时空紊乱', luckMod: -5, skillMod: 0.15, healthMod: 0, rarity: 'epic', },
  ],
}

export const CELESTIAL_EVENT_POOL_BY_WORLDVIEW: Record<string, Record<CelestialPhase, CelestialEvent[]>> = {
  western_fantasy: {
    normal: [{ name: '星辰平稳', hint: '夜空如常', luckMod: 0, skillMod: 0, healthMod: 0, rarity: 'common', },],
    auspicious: [
      { name: '双月交汇', hint: '双月排成一线，魔法潮汐涌动', luckMod: 15, skillMod: 0.12, healthMod: 0, rarity: 'common', },
      { name: '龙星当空', hint: '龙之星格外明亮，龙裔力量增强', luckMod: 20, skillMod: 0.15, healthMod: 5, rarity: 'rare', },
      { name: '元素潮汐', hint: '元素位面与主世界接近，魔法增幅', luckMod: 10, skillMod: 0.25, healthMod: 0, rarity: 'common', },
    ],
    omen: [
      { name: '暗月', hint: '月亮消失于天空，不祥之兆', luckMod: -10, skillMod: 0, healthMod: -3, rarity: 'common', },
      { name: '星辰陨落', hint: '有星辰坠落天际，灾祸将至', luckMod: -12, skillMod: 0, healthMod: -5, rarity: 'rare', },
      { name: '暗影蔽日', hint: '暗影位面侵蚀日光', luckMod: -8, skillMod: 0, healthMod: -5, rarity: 'rare', },
    ],
    anomaly: [
      {
        name: '神谕降临', hint: '神明直接降下旨意', luckMod: 10, skillMod: 0.2, healthMod: 0, rarity: 'epic',
        prerequisites: [
          { type: 'worldAge', value: '>800', },
          { type: 'previousPhase', value: 'anomaly', },
        ],
      },
      { name: '位面裂隙', hint: '异位面裂缝打开', luckMod: 0, skillMod: 0.3, healthMod: -5, rarity: 'rare', },
      {
        name: '龙怒', hint: '远古巨龙苏醒引发天地异变', luckMod: -5, skillMod: 0.1, healthMod: -10, rarity: 'epic',
        prerequisites: [
          { type: 'worldAge', value: '>1000', },
        ],
      },
    ],
  },
  scifi: {
    normal: [{ name: '空间稳定', hint: '宇宙射线正常，航行安全', luckMod: 0, skillMod: 0, healthMod: 0, rarity: 'common', },],
    auspicious: [
      { name: '恒星风暴', hint: '主序星活跃期，能量充沛', luckMod: 12, skillMod: 0.15, healthMod: 0, rarity: 'common', },
      { name: '虫洞平稳', hint: '空间褶皱舒展，超光速航行效率提升', luckMod: 18, skillMod: 0.2, healthMod: 0, rarity: 'rare', },
    ],
    omen: [
      { name: '引力波异常', hint: '空间扭曲加剧，航行风险增大', luckMod: -10, skillMod: 0, healthMod: -3, rarity: 'common', },
      {
        name: '黑洞逼近', hint: '巨型黑洞正在接近星系', luckMod: -15, skillMod: 0, healthMod: -5, rarity: 'epic',
        prerequisites: [
          { type: 'worldAge', value: '>500', },
        ],
      },
    ],
    anomaly: [
      {
        name: '暗能量爆发', hint: '暗能量突然喷涌，物理法则不稳', luckMod: 5, skillMod: 0.3, healthMod: -5, rarity: 'epic',
        prerequisites: [
          { type: 'previousPhase', value: 'anomaly', },
        ],
      },
      { name: '维度裂痕', hint: '高维空间出现裂缝，异维度生物渗入', luckMod: 0, skillMod: 0.25, healthMod: -10, rarity: 'epic', },
    ],
  },
  post_apocalyptic: {
    normal: [{ name: '天空平静', hint: '辐射水平正常', luckMod: 0, skillMod: 0, healthMod: 0, rarity: 'common', },],
    auspicious: [
      { name: '晴空万里', hint: '罕见的晴朗天气，适合外出探索', luckMod: 10, skillMod: 0.05, healthMod: 3, rarity: 'common', },
    ],
    omen: [
      { name: '辐射风暴', hint: '强辐射风暴席卷大地', luckMod: -12, skillMod: 0, healthMod: -8, rarity: 'rare', },
      { name: '电磁脉冲', hint: '太阳风暴引发电磁脉冲，设备大面积瘫痪', luckMod: -10, skillMod: -0.1, healthMod: -3, rarity: 'common', },
      { name: '酸雨', hint: '腐蚀性酸雨从天而降', luckMod: -8, skillMod: 0, healthMod: -5, rarity: 'common', },
    ],
    anomaly: [
      {
        name: '极光异常', hint: '不该出现的极光覆盖天空', luckMod: 5, skillMod: 0.1, healthMod: -5, rarity: 'rare',
        prerequisites: [
          { type: 'previousPhase', value: 'anomaly', },
        ],
      },
      {
        name: '陨石雨', hint: '陨石群掠过大气层', luckMod: -5, skillMod: 0.2, healthMod: -10, rarity: 'epic',
        prerequisites: [
          { type: 'worldAge', value: '>300', },
        ],
      },
    ],
  },
  materialist: {
    normal: [{ name: '天象平稳', hint: '天文观测正常', luckMod: 0, skillMod: 0, healthMod: 0, rarity: 'common', },],
    auspicious: [],
    omen: [],
    anomaly: [],
  },
  survival_horror: {
    normal: [{ name: '天空沉寂', hint: '诡异的寂静笼罩苍穹', luckMod: 0, skillMod: 0, healthMod: 0, rarity: 'common', },],
    auspicious: [
      { name: '驱魔星现', hint: '猎户座格外明亮，邪祟退避', luckMod: 12, skillMod: 0.1, healthMod: 3, rarity: 'rare', },
      { name: '圣月当空', hint: '月光带有净化之力，亡灵削弱', luckMod: 15, skillMod: 0.15, healthMod: 5, rarity: 'rare', },
    ],
    omen: [
      { name: '黑日', hint: '太阳被黑暗吞噬一半，恶兆降临', luckMod: -15, skillMod: 0, healthMod: -8, rarity: 'epic', },
      { name: '亡灵星现', hint: '紫黑色妖星划过天际，死者躁动', luckMod: -12, skillMod: 0, healthMod: -5, rarity: 'rare', },
      { name: '无尽暗夜', hint: '白昼迟迟不来，黑夜持续数日', luckMod: -10, skillMod: -0.1, healthMod: -3, rarity: 'common', },
    ],
    anomaly: [
      {
        name: '古神苏醒', hint: '群星归位，沉眠的古神开始呼吸', luckMod: -5, skillMod: 0.3, healthMod: -15, rarity: 'epic',
        prerequisites: [
          { type: 'worldAge', value: '>1000', },
          { type: 'previousPhase', value: 'anomaly', },
        ],
      },
      {
        name: '血海天幕', hint: '天空变成深红血色，理智持续流失', luckMod: 0, skillMod: 0.15, healthMod: -10, rarity: 'rare',
        prerequisites: [
          { type: 'worldAge', value: '>500', },
        ],
      },
      { name: '次元裂缝', hint: '现实与梦境的边界破碎', luckMod: 5, skillMod: 0.25, healthMod: -8, rarity: 'epic', },
    ],
  },
}

// ============================================================
// §4.2.2 纪元常量
// ============================================================

export const ERA_OPENING_YEARS = 3

export const ERA_TRANSITION_YEARS = 5

export const ERA_LATE_RATIO = 0.7

export const ERA_DEFAULT_SPAN = 60

export const ERA_HINTS_ANCIENT: EraHints = {
  opening: '{name}元年初立，百官述职，朝廷颁布新政，万民翘首以待',
  mid: '{name}年间，国运平稳，百业循环',
  late: '{name}末年，朝政松弛，怨声渐起',
  transition: '{current}将尽，{next}将至，时局动荡，天下人心惶惶',
  transition_no_next: '{name}末期，新旧交替之际',
}

export const ERA_HINTS_XIANXIA: EraHints = {
  opening: '{name}纪元开启，天地灵气涌动，新一代修士踏上修真之途',
  mid: '{name}正值鼎盛，大道争锋，天才辈出，宗门林立',
  late: '{name}末期，天道紊乱、魔修横行，万物竞逐一线生机',
  transition: '{current}将尽，{next}将至，天地阴阳失序，大劫在即',
  transition_no_next: '{name}纪元终结，天道寂灭，万物归于虚无',
}

export const ERA_HINTS_MODERN: EraHints = {
  opening: '{name}时代开启，社会变革带来新机遇',
  mid: '{name}时代稳定发展，技术与社会稳步演进',
  late: '{name}末期，社会矛盾尖锐，变革呼声高涨',
  transition: '{current}谢幕，{next}来临，社会动荡与机遇并存',
  transition_no_next: '{name}时代终结，文明将走向未知',
}

/** 世界观 → 纪元提示模板 映射（AI 不可用时的 fallback） */
export const ERA_HINTS_BY_WORLDVIEW: Record<string, EraHints> = {
  cultivation: ERA_HINTS_XIANXIA,
  eastern_fantasy: ERA_HINTS_XIANXIA,
  materialist: ERA_HINTS_MODERN,
  scifi: ERA_HINTS_MODERN,
  post_apocalyptic: ERA_HINTS_MODERN,
}

// ============================================================
// §4.2.3 世界地图常量
// ============================================================

export const REGION_NAME_PREFIXES: readonly string[] = [
  '龙', '凤', '金', '银', '铁', '黑', '白', '青',
  '赤', '紫', '苍', '辉', '流', '星', '天', '光', '玄',
]

export const REGION_NAME_SUFFIXES: readonly string[] = [
  '山', '谷', '岭', '原', '川', '湖', '海', '河',
  '峰', '渊', '崖', '丘', '林', '泽', '漠', '岛', '城', '关', '穴', '洞',
]

export const MAP_TEMPLATE_LABELS: Record<MapTemplate, string> = {
  continental: '大陆型',
  archipelago: '群岛型',
  pangea: '盘古型',
  multicontinental: '多大陆型',
  oceanWorld: '海洋型',
  planar: '位面型',
  stellar: '星际型',
  ringWorld: '环形世界型',
  hollowEarth: '地心世界型',
  nebula: '星云型',
}

export const TERRAIN_ZH_MAP: Record<TerrainType, string> = {
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

export const COORD_RANGE = 1000

export const ADJACENT_DISTANCE = 180

export const BORDER_CHANGE_CHANCE = 0.10

export const NEW_REGION_CHANCE = 0.05

export const REGION_MERGE_CHANCE = 0.03

export const FACTION_ATTRITION_CHANCE = 0.02

export const POPULATION_MIN = 2000000

export const POPULATION_MAX = 30000000

export const TEMPERATURE_MIN = -30

export const TEMPERATURE_MAX = 40

export const HUMIDITY_MIN = 10

export const HUMIDITY_MAX = 90

export const TERRAIN_DEVELOPMENT_RANGES: Record<TerrainType, { min: number; max: number }> = {
  plain: { min: 30, max: 80, },
  forest: { min: 15, max: 50, },
  mountain: { min: 10, max: 35, },
  desert: { min: 10, max: 30, },
  tundra: { min: 10, max: 25, },
  ocean: { min: 5, max: 20, },
  swamp: { min: 10, max: 30, },
  volcanic: { min: 5, max: 25, },
  underground: { min: 10, max: 40, },
  skyIsland: { min: 20, max: 60, },
}

export const MAP_TEMPLATE_TERRAINS: Record<MapTemplate, TerrainWeight[]> = {
  continental: [
    { terrain: 'plain', weight: 0.3, },
    { terrain: 'forest', weight: 0.2, },
    { terrain: 'mountain', weight: 0.15, },
    { terrain: 'desert', weight: 0.1, },
    { terrain: 'ocean', weight: 0.1, },
    { terrain: 'tundra', weight: 0.05, },
    { terrain: 'swamp', weight: 0.05, },
    { terrain: 'volcanic', weight: 0.05, },
  ],
  archipelago: [
    { terrain: 'ocean', weight: 0.35, },
    { terrain: 'plain', weight: 0.2, },
    { terrain: 'forest', weight: 0.15, },
    { terrain: 'mountain', weight: 0.1, },
    { terrain: 'swamp', weight: 0.08, },
    { terrain: 'volcanic', weight: 0.07, },
    { terrain: 'desert', weight: 0.05, },
  ],
  pangea: [
    { terrain: 'plain', weight: 0.3, },
    { terrain: 'forest', weight: 0.2, },
    { terrain: 'desert', weight: 0.15, },
    { terrain: 'mountain', weight: 0.15, },
    { terrain: 'tundra', weight: 0.08, },
    { terrain: 'swamp', weight: 0.07, },
    { terrain: 'volcanic', weight: 0.05, },
  ],
  multicontinental: [
    { terrain: 'plain', weight: 0.22, },
    { terrain: 'forest', weight: 0.18, },
    { terrain: 'ocean', weight: 0.16, },
    { terrain: 'mountain', weight: 0.12, },
    { terrain: 'desert', weight: 0.1, },
    { terrain: 'tundra', weight: 0.1, },
    { terrain: 'swamp', weight: 0.07, },
    { terrain: 'volcanic', weight: 0.05, },
  ],
  oceanWorld: [
    { terrain: 'ocean', weight: 0.5, },
    { terrain: 'plain', weight: 0.2, },
    { terrain: 'swamp', weight: 0.1, },
    { terrain: 'forest', weight: 0.1, },
    { terrain: 'volcanic', weight: 0.1, },
  ],
  planar: [
    { terrain: 'skyIsland', weight: 0.4, },
    { terrain: 'plain', weight: 0.15, },
    { terrain: 'forest', weight: 0.15, },
    { terrain: 'mountain', weight: 0.15, },
    { terrain: 'volcanic', weight: 0.1, },
    { terrain: 'desert', weight: 0.05, },
  ],
  stellar: [
    { terrain: 'volcanic', weight: 0.3, },
    { terrain: 'desert', weight: 0.2, },
    { terrain: 'mountain', weight: 0.2, },
    { terrain: 'plain', weight: 0.15, },
    { terrain: 'tundra', weight: 0.15, },
  ],
  ringWorld: [
    { terrain: 'plain', weight: 0.3, },
    { terrain: 'ocean', weight: 0.2, },
    { terrain: 'forest', weight: 0.2, },
    { terrain: 'mountain', weight: 0.15, },
    { terrain: 'desert', weight: 0.1, },
    { terrain: 'skyIsland', weight: 0.05, },
  ],
  hollowEarth: [
    { terrain: 'underground', weight: 0.35, },
    { terrain: 'volcanic', weight: 0.2, },
    { terrain: 'ocean', weight: 0.15, },
    { terrain: 'mountain', weight: 0.12, },
    { terrain: 'swamp', weight: 0.1, },
    { terrain: 'forest', weight: 0.08, },
  ],
  nebula: [
    { terrain: 'skyIsland', weight: 0.3, },
    { terrain: 'volcanic', weight: 0.25, },
    { terrain: 'desert', weight: 0.2, },
    { terrain: 'ocean', weight: 0.15, },
    { terrain: 'plain', weight: 0.1, },
  ],
}

export const MAP_TEMPLATE_REGION_COUNT: Record<MapTemplate, number> = {
  continental: 18,
  archipelago: 30,
  pangea: 12,
  multicontinental: 25,
  oceanWorld: 8,
  planar: 15,
  stellar: 6,
  ringWorld: 12,
  hollowEarth: 20,
  nebula: 16,
}

export const TERRAIN_RESOURCE_POOL: Record<TerrainType, string[]> = {
  plain: ['粮食', '木材', '石料',],
  forest: ['木材', '药材', '兽皮',],
  mountain: ['矿石', '石料', '宝石',],
  desert: ['石英', '香料', '矿物',],
  tundra: ['毛皮', '冰晶', '冻矿',],
  ocean: ['鱼类', '珍珠', '珊瑚',],
  swamp: ['药材', '泥炭', '毒物',],
  volcanic: ['硫磺', '黑曜石', '地热',],
  underground: ['暗矿', '菌类', '晶簇',],
  skyIsland: ['浮石', '云晶', '灵禽',],
}

// ============================================================
// §4.2.3a 世界观适配 —— 命名体系
// ============================================================

/** 世界观 → 区域名前缀池映射 */
export const REGION_NAME_PREFIXES_BY_WORLDVIEW: Record<string, readonly string[]> = {
  // 东方奇幻组（修仙/武侠/古代）
  cultivation: ['龙', '凤', '金', '银', '铁', '黑', '白', '青', '赤', '紫', '苍', '辉', '流', '星', '天', '光', '玄',],
  'martial-arts': ['武', '剑', '侠', '江', '湖', '山', '林', '风', '云', '龙', '虎', '凤', '麒麟', '鹤', '燕', '狼', '鹰', '蛇',],
  'ancient-history': ['金', '玉', '长', '永', '太', '大', '洛', '咸', '安', '建', '郢', '蓟', '邺', '晋', '齐', '楚', '秦', '燕',],

  // 西方奇幻组
  'western-fantasy': ['银', '金', '暗', '光', '龙', '魔', '神', '圣', '铁', '霜', '火', '风', '雷', '月', '星', '影', '血', '古',],
  'dark-fantasy': ['暗', '血', '影', '死', '虚', '咒', '黑', '骨', '幽', '亡', '腐', '毒', '寒', '夜', '魔', '鬼', '恶', '冥',],

  // 科幻组（星际/科幻/赛博朋克）
  'sci-fi': ['新', '星', '铁', '银', '光', '速', '量', '暗', '虚', '空', '极', '冷', '钛', '铬', '硅', '氦', '氖', '等离子',],
  interstellar: ['星', '银', '光', '暗', '空', '虚', '极', '远', '超', '亚', '曲', '折', '虫', '奇', '脉冲', '暗物质', '反物质', '重元素',],
  cyberpunk: ['霓', '铬', '铁', '硅', '暗', '光', '虚', '流', '速', '数', '码', '网', '电', '脉', '晶', '钛', '仿生', '合成',],

  // 现代/末世
  modern: ['新', '金', '银', '铁', '光', '风', '云', '海', '山', '河', '天', '流', '星', '春', '秋', '东', '西', '南',],
  'post-apocalyptic': ['废', '锈', '暗', '灰', '毒', '酸', '残', '断', '荒', '死', '骨', '焦', '辐射', '变异', '残存', '末', '毁', '灭',],

  // 默认回退 → 东方仙侠
  default: ['龙', '凤', '金', '银', '铁', '黑', '白', '青', '赤', '紫', '苍', '辉', '流', '星', '天', '光', '玄',],
}

/** 世界观 → 区域名后缀池映射 */
export const REGION_NAME_SUFFIXES_BY_WORLDVIEW: Record<string, readonly string[]> = {
  // 东方奇幻组
  cultivation: ['山', '谷', '岭', '原', '川', '湖', '海', '河', '峰', '渊', '崖', '丘', '林', '泽', '漠', '岛', '城', '关', '穴', '洞',],
  'martial-arts': ['山', '谷', '岭', '庄', '寨', '堡', '镇', '城', '阁', '楼', '湖', '江', '河', '林', '岛', '峰', '崖', '关',],
  'ancient-history': ['京', '都', '城', '郡', '县', '关', '原', '山', '河', '湖', '海', '谷', '岭', '丘', '泽', '林', '漠', '岛',],

  // 西方奇幻组
  'western-fantasy': ['山脉', '森林', '平原', '沼泽', '沙漠', '荒原', '冰原', '裂谷', '高地', '海湾', '岛屿', '深渊', '火山', '丘陵', '冻土', '林地', '海岸', '峰',],
  'dark-fantasy': ['深渊', '墓场', '荒原', '暗林', '废墟', '诅咒地', '血沼', '枯骨地', '亡灵地', '腐地', '毒沼', '暗礁', '死域', '幽谷', '冥河', '黑山', '影林', '枯漠',],

  // 科幻组
  'sci-fi': ['星区', '殖民地', '空间站', '基地', '矿区', '实验室', '穹顶城', '轨道港', '研究站', '前哨', '要塞', '浮城', '冷冻区', '辐射区', '工业区', '净化区', '改造区', '生态区',],
  interstellar: ['星系', '星区', '星团', '星云', '空间站', '轨道城', '殖民地', '要塞', '前哨', '虫洞区', '曲速枢纽', '暗物质区', '脉冲星域', '零素区', '戴森环', '宏世界', '虚空', '量子域',],
  cyberpunk: ['区', '层', '塔', '街区', '网格', '节点', '机房', '枢纽', '市场', '码头', '工厂', '实验室', '数据中心', '能源站', '霓虹区', '暗网域', '合成区', '地下层',],

  // 现代/末世
  modern: ['市', '区', '镇', '县', '山', '湖', '河', '海', '港', '岛', '林', '原', '谷', '城', '新区', '开发区', '特区', '湾',],
  'post-apocalyptic': ['废墟', '荒原', '废土', '残骸', '锈地', '辐射区', '死域', '焦土', '毒沼', '避难所', '前哨', '要塞', '遗迹', '地下城', '变异区', '废墟带', '净水区', '残存地',],

  // 默认回退
  default: ['山', '谷', '岭', '原', '川', '湖', '海', '河', '峰', '渊', '崖', '丘', '林', '泽', '漠', '岛', '城', '关', '穴', '洞',],
}

// ============================================================
// §4.2.3b 世界观适配 —— 势力名
// ============================================================

/** 世界观 → 势力名前缀池映射 */
export const FACTION_PREFIXES_BY_WORLDVIEW: Record<string, readonly string[]> = {
  // 东方奇幻
  cultivation: ['天', '炎', '金', '暗', '苍', '灵', '血', '紫', '黑', '圣',],
  'martial-arts': ['剑', '刀', '拳', '掌', '暗', '飞', '铁', '血', '天', '地',],
  'ancient-history': ['大', '天', '神', '龙', '凤', '虎', '黄', '赤', '玄', '圣',],

  // 西方奇幻
  'western-fantasy': ['暗', '光', '龙', '魔', '神', '圣', '铁', '霜', '火', '风',],
  'dark-fantasy': ['暗', '血', '影', '死', '虚', '咒', '黑', '幽', '冥', '毒',],

  // 科幻组
  'sci-fi': ['星', '银', '铁', '光', '暗', '钛', '硅', '量', '速', '合成',],
  interstellar: ['星', '银', '光', '暗', '超', '曲', '虫', '虚空', '脉冲', '零素',],
  cyberpunk: ['霓', '铬', '硅', '暗', '数', '网', '晶', '钛', '合成', '仿生',],

  // 现代/末世
  modern: ['新', '金', '银', '铁', '光', '风', '天', '星', '海', '山',],
  'post-apocalyptic': ['废', '锈', '暗', '灰', '毒', '辐射', '残', '焦', '骨', '末',],

  // 默认
  default: ['天', '炎', '金', '暗', '苍', '灵', '血', '紫', '黑', '圣',],
}

/** 世界观 → 势力名后缀池映射 */
export const FACTION_SUFFIXES_BY_WORLDVIEW: Record<string, readonly string[]> = {
  // 东方奇幻
  cultivation: ['龙派', '凤阁', '影会', '星团', '月教', '云门', '雷宗', '剑盟',],
  'martial-arts': ['派', '门', '帮', '会', '谷', '庄', '楼', '阁',],
  'ancient-history': ['国', '王朝', '帝国', '联盟', '部族', '城邦', '藩', '侯',],

  // 西方奇幻
  'western-fantasy': ['王国', '帝国', '联盟', '议会', '骑士团', '法师塔', '神殿', '龙巢',],
  'dark-fantasy': ['邪教', '亡灵军', '暗影会', '血族', '诅咒团', '冥府', '死灵塔', '疫军',],

  // 科幻组
  'sci-fi': ['联盟', '企业', '实验室', '殖民团', '科学院', '舰队', '前哨', '网络',],
  interstellar: ['帝国', '联邦', '联盟', '共同体', '舰队', '文明', '星域', '贸易体',],
  cyberpunk: ['企业', '集团', '帮派', '黑客组', '实验室', 'AI网络', '合成团', '芯片商',],

  // 现代/末世
  modern: ['公司', '集团', '机构', '协会', '联盟', '组织', '基金', '实验室',],
  'post-apocalyptic': ['幸存者', '拾荒者', '掠夺者', '据点', '净化者', '变异族', '机械教', '重建军',],

  // 默认
  default: ['龙派', '凤阁', '影会', '星团', '月教', '云门', '雷宗', '剑盟',],
}

// ============================================================
// §4.2.3c 世界观适配 —— 资源池
// ============================================================

/** 世界观 → 地形资源池映射 */
export const TERRAIN_RESOURCE_POOL_BY_WORLDVIEW: Record<string, Record<TerrainType, string[]>> = {
  cultivation: {
    plain: ['灵谷', '灵木', '灵脉石',],
    forest: ['灵木', '灵药', '妖兽皮',],
    mountain: ['灵石', '仙矿', '灵玉',],
    desert: ['炎晶', '灵砂', '烈阳石',],
    tundra: ['冰灵石', '寒玉', '雪兽皮',],
    ocean: ['灵水', '龙珠', '仙贝',],
    swamp: ['毒灵草', '沼泽玉', '妖兽骨',],
    volcanic: ['地火精', '熔岩玉', '火灵石',],
    underground: ['暗灵矿', '阴泉', '龙脉晶',],
    skyIsland: ['浮灵玉', '天云晶', '仙禽羽',],
  },
  'martial-arts': {
    plain: ['五谷', '药材', '石料',],
    forest: ['木材', '草药', '兽皮',],
    mountain: ['铁矿', '铜矿', '玉石',],
    desert: ['盐矿', '石英', '硝石',],
    tundra: ['毛皮', '冰泉', '冻石',],
    ocean: ['鱼类', '珍珠', '盐',],
    swamp: ['草药', '毒物', '泥炭',],
    volcanic: ['硫磺', '地火石', '火铜',],
    underground: ['暗矿', '寒铁', '夜明珠',],
    skyIsland: ['陨铁', '云燕羽', '高空冰露',],
  },
  'ancient-history': {
    plain: ['五谷', '麻布', '陶土',],
    forest: ['木材', '野味', '草药',],
    mountain: ['铜矿', '铁矿', '玉料',],
    desert: ['盐', '硝石', '石英',],
    tundra: ['毛皮', '冰玉', '冻药',],
    ocean: ['鱼获', '珍珠', '珊瑚',],
    swamp: ['泥炭', '毒药', '菌菇',],
    volcanic: ['硫磺', '火铜', '火山灰',],
    underground: ['铜矿', '玉料', '暗泉',],
    skyIsland: ['天降铁', '云燕羽', '风鸣石',],
  },
  'western-fantasy': {
    plain: ['谷物', '马匹', '亚麻',],
    forest: ['木材', '兽皮', '魔草',],
    mountain: ['铁矿', '秘银', '宝石',],
    desert: ['石英', '香料', '火盐',],
    tundra: ['毛皮', '冰晶', '霜矿',],
    ocean: ['鱼类', '珍珠', '珊瑚',],
    swamp: ['魔草', '泥炭', '毒菇',],
    volcanic: ['硫磺', '黑曜石', '火元素',],
    underground: ['暗矿', '菌类', '发光晶',],
    skyIsland: ['浮石', '风元素', '天羽',],
  },
  'dark-fantasy': {
    plain: ['枯谷', '腐皮', '黑麻',],
    forest: ['枯木', '毒菌', '暗草',],
    mountain: ['暗铁', '骨矿', '黑晶',],
    desert: ['骨沙', '毒盐', '诅咒石',],
    tundra: ['朽皮', '冻骨', '暗冰',],
    ocean: ['腐鱼', '黑珍珠', '亡灵珊瑚',],
    swamp: ['毒液', '诅咒泥', '死菇',],
    volcanic: ['硫磺', '岩浆', '暗火',],
    underground: ['暗矿', '幽灵菌', '灾厄晶',],
    skyIsland: ['陨石', '死风', '堕落羽',],
  },
  'sci-fi': {
    plain: ['合成食物', '生物质', '淡水',],
    forest: ['木材', '药用植物', '基因样本',],
    mountain: ['铁矿石', '稀土', '工业宝石',],
    desert: ['硅砂', '锂矿', '太阳能',],
    tundra: ['冻淡水', '甲烷水合物', '稀有气体',],
    ocean: ['海水', '氘', '海底锰结核',],
    swamp: ['沼气', '泥炭', '微生物',],
    volcanic: ['地热能', '硫磺', '玄武岩',],
    underground: ['铀矿', '稀土矿', '晶洞',],
    skyIsland: ['轻质气体', '大气采样', '高空冰晶',],
  },
  interstellar: {
    plain: ['可殖民土地', '水资源', '生物质',],
    forest: ['氧气林', '异星药材', '基因库',],
    mountain: ['稀有金属', '能量水晶', '工业矿物',],
    desert: ['硅基矿', '氦-3', '太阳能晶体',],
    tundra: ['冷冻甲烷', '稀有气体', '冰矿物',],
    ocean: ['液态水', '重水', '海底矿床',],
    swamp: ['有机淤泥', '微生物', '生物燃料',],
    volcanic: ['地热能源', '岩浆矿物', '火山玻璃',],
    underground: ['超导矿', '反物质矿', '零点能源晶',],
    skyIsland: ['反重力矿', '大气元素', '高能粒子',],
  },
  cyberpunk: {
    plain: ['生物质', '淡水', '合成食物',],
    forest: ['木材', '药用植物', '生物芯片原料',],
    mountain: ['稀土', '半导体矿', '工业硅',],
    desert: ['硅砂', '铜矿', '废弃电子元件',],
    tundra: ['冷却液', '稀有气体', '数据冰晶',],
    ocean: ['冷却水', '海底光缆', '海洋塑料',],
    swamp: ['生物质', '发酵气体', '基因废料',],
    volcanic: ['地热能', '玄武岩纤维', '工业热源',],
    underground: ['数据矿场', '冷却隧道', '暗网光纤',],
    skyIsland: ['通信节点', '大气能源', '高空数据流',],
  },
  modern: {
    plain: ['粮食', '淡水', '木材',],
    forest: ['木材', '药材', '野味',],
    mountain: ['铁矿石', '石料', '煤炭',],
    desert: ['石油', '天然气', '石英砂',],
    tundra: ['石油', '天然气', '矿藏',],
    ocean: ['鱼类', '石油', '天然气',],
    swamp: ['泥炭', '木材', '药材',],
    volcanic: ['地热', '硫磺', '火山岩',],
    underground: ['煤矿', '铁矿', '地下水源',],
    skyIsland: ['轻质岩', '气象数据', '高空能源',],
  },
  'post-apocalyptic': {
    plain: ['废土', '辐射水', '变异作物',],
    forest: ['变异木材', '辐射菌', '废铁',],
    mountain: ['废铁', '残存矿', '避难所零件',],
    desert: ['玻璃', '废金属', '骨料',],
    tundra: ['冻结废料', '残存燃料', '冰下物',],
    ocean: ['污染鱼', '废塑料', '沉船物',],
    swamp: ['毒水', '变异菌', '化工残渣',],
    volcanic: ['熔渣', '硫磺', '地热',],
    underground: ['避难所', '旧科技', '残存物资',],
    skyIsland: ['残存卫星', '高空净水', '辐射云',],
  },
}

// ============================================================
// §4.2.3d 世界观适配 —— 人口量级 / 气候范围 / 模板可用性
// ============================================================

/** 世界观 → 人口范围映射（[min, max]） */
export const POPULATION_RANGE_BY_WORLDVIEW: Record<string, [number, number]> = {
  cultivation: [2000000, 30000000,],
  'martial-arts': [500000, 20000000,],
  'ancient-history': [500000, 15000000,],
  'western-fantasy': [500000, 20000000,],
  'dark-fantasy': [100000, 8000000,],
  'sci-fi': [5000000, 500000000,],
  interstellar: [10000000, 1000000000,],
  cyberpunk: [10000000, 200000000,],
  modern: [5000000, 500000000,],
  'post-apocalyptic': [1000, 500000,],
  default: [2000000, 30000000,],
}

/** 世界观 → 温度范围映射（[min, max]） */
export const TEMPERATURE_RANGE_BY_WORLDVIEW: Record<string, [number, number]> = {
  cultivation: [-30, 40,],
  'martial-arts': [-20, 45,],
  'ancient-history': [-20, 40,],
  'western-fantasy': [-30, 40,],
  'dark-fantasy': [-40, 30,],
  'sci-fi': [-50, 50,],
  interstellar: [-100, 80,],
  cyberpunk: [-10, 50,],
  modern: [-30, 45,],
  'post-apocalyptic': [-40, 60,],
  default: [-30, 40,],
}

/** 世界观 → 湿度范围映射（[min, max]） */
export const HUMIDITY_RANGE_BY_WORLDVIEW: Record<string, [number, number]> = {
  cultivation: [10, 90,],
  'martial-arts': [10, 90,],
  'ancient-history': [10, 90,],
  'western-fantasy': [10, 90,],
  'dark-fantasy': [5, 85,],
  'sci-fi': [0, 100,],
  interstellar: [0, 100,],
  cyberpunk: [5, 95,],
  modern: [10, 90,],
  'post-apocalyptic': [0, 100,],
  default: [10, 90,],
}

/** 世界观 → 允许的地图模板列表（undefined = 全部可用） */
export const AVAILABLE_TEMPLATES_BY_WORLDVIEW: Record<string, readonly MapTemplate[] | undefined> = {
  cultivation: ['continental', 'archipelago', 'pangea', 'multicontinental', 'oceanWorld', 'planar', 'stellar', 'ringWorld', 'hollowEarth', 'nebula',],
  'martial-arts': ['continental', 'archipelago', 'pangea', 'multicontinental', 'oceanWorld',],
  'ancient-history': ['continental', 'archipelago', 'pangea', 'multicontinental',],
  'western-fantasy': ['continental', 'archipelago', 'pangea', 'multicontinental', 'oceanWorld', 'hollowEarth',],
  'dark-fantasy': ['continental', 'pangea', 'multicontinental', 'hollowEarth',],
  'sci-fi': ['continental', 'multicontinental', 'oceanWorld', 'stellar', 'ringWorld',],
  interstellar: ['stellar', 'nebula', 'ringWorld',],
  cyberpunk: ['continental', 'multicontinental', 'stellar',],
  modern: ['continental', 'archipelago', 'pangea', 'multicontinental', 'oceanWorld',],
  'post-apocalyptic': ['continental', 'pangea', 'multicontinental', 'oceanWorld', 'hollowEarth',],
  default: undefined, // 全部可用,
}

// ============================================================
// §4.2.3e 算法变体选项
// ============================================================

/** stellar 线性排列参数 */
export const STELLAR_LINEAR_PARAMS = {
  /** 线性排列间距 (COORD_RANGE 比例) */
  spacing: 0.08,
  /** 正弦波振幅 */
  sineAmplitude: 0.15,
  /** 正弦波频率 */
  sineFrequency: 2.5,
} as const

/** planar 动态层数参数 */
export const PLANAR_LAYER_PARAMS = {
  /** 默认层数 */
  defaultLayers: 3,
  /** 最小层数 */
  minLayers: 2,
  /** 最大层数 */
  maxLayers: 5,
} as const

/** 双频螺旋变体参数 */
export const ARCHIPELAGO_SPIRAL_PARAMS = {
  /** 斐波那契螺旋黄金角 (弧度) */
  goldenAngle: Math.PI * (3 - Math.sqrt(5,)),
  /** 扩散系数 */
  spreadFactor: 0.35,
} as const

// ============================================================
// §4.2.3f 势力外交关系常量
// ============================================================

/** 势力关系类型 → 标签映射 */
export const FACTION_RELATION_LABELS: Record<string, string> = {
  alliance: '同盟',
  war: '战争',
  neutral: '中立',
  vassal: '附庸',
  trade: '贸易',
}

/** 势力关系 → 对应图标标记（用于 formatForPrompt 紧凑输出） */
export const FACTION_RELATION_MARKS: Record<string, string> = {
  alliance: '🤝',
  war: '⚔️',
  neutral: '—',
  vassal: '🏴',
  trade: '💰',
}

/** 初始关系生成：每种关系类型权重（权重越高越常见） */
export const FACTION_RELATION_GENERATION_WEIGHTS: Record<string, number> = {
  neutral: 0.50,
  trade: 0.18,
  alliance: 0.12,
  war: 0.12,
  vassal: 0.08,
}

/** 每 10 年关系演变概率 */
export const FACTION_RELATION_EVOLVE_CHANCE = 0.08

/** 初始 tension 范围（按关系类型） */
export const FACTION_TENSION_INITIAL: Record<string, [number, number]> = {
  alliance: [5, 25,],
  war: [65, 95,],
  neutral: [30, 60,],
  vassal: [10, 30,],
  trade: [15, 40,],
}

/** 每 10 年 tension 随机漂移范围 */
export const FACTION_TENSION_DRIFT = 8

/** tension 超过此阈值 → 触发 war 转换 */
export const FACTION_TENSION_WAR_THRESHOLD = 70

/** tension 低于此阈值 → 触发 alliance 转换 */
export const FACTION_TENSION_ALLIANCE_THRESHOLD = 15

/** 天象不稳定时 tension 额外漂移加成 */
export const FACTION_TENSION_CELESTIAL_BONUS = 3

export const PROPHECY_MIN_COUNT = 1

export const PROPHECY_MAX_COUNT = 2

export const PROPHECY_PROGRESS_MAX = 100

export const PROPHECY_NATURAL_CHANCE = 0.05

export const PROPHECY_GENERATION_INTERVAL = 12

export const PROPHECY_PENALTY_MAX = 200

export const PROPHECY_BREAK_PENALTY_MULT = 50

/** 预言每季度应验进度推进量 */
export const PROPHECY_PROGRESS_STEP = 5

/** 预兆事件触发阈值 */
export const PROPHECY_OMEN_THRESHOLDS: readonly number[] = [25, 50, 75,]

/** 预兆阶段 → 文本描述 */
export const PROPHECY_OMEN_LABELS: Record<ProphecyOmenStage, string> = {
  omen_25: '预兆初现',
  omen_50: '征兆明显',
  omen_75: '应验在即',
}

export const PROPHECY_SOURCE_LABELS: Record<ProphecySource, string> = {
  celestial: '星象',
  oracle: '神谕',
  dream: '梦境',
  divine: '天启',
  artifact: '器物',
}

export const PROPHECY_TEMPLATES: ProphecyTemplate[] = [
  {
    id: 'chosen_one', title: '天选之人',
    description: '天地异象预示一位修士将突破至高境界',
    source: 'celestial', defaultMutability: 0.2,
    targetQuartersMin: 20, targetQuartersMax: 40,
    compatibleWorldviews: ['cultivation',],
  },
  {
    id: 'dao_tribulation', title: '万劫天劫',
    description: '千年一遇的天地大劫即将降临，唯有大机缘者可渡',
    source: 'divine', defaultMutability: 0.1,
    targetQuartersMin: 30, targetQuartersMax: 60,
    compatibleWorldviews: ['cultivation',],
  },
  {
    id: 'sword_emperor', title: '剑帝转世',
    description: '上古剑帝元神转世，将再统剑道',
    source: 'oracle', defaultMutability: 0.3,
    targetQuartersMin: 16, targetQuartersMax: 32,
    compatibleWorldviews: ['cultivation', 'wuxia',],
  },
  {
    id: 'dragon_return', title: '巨龙归来',
    description: '沉睡千年的太古龙族即将苏醒，世界将为之震怖',
    source: 'dream', defaultMutability: 0.15,
    targetQuartersMin: 24, targetQuartersMax: 48,
    compatibleWorldviews: ['western_fantasy', 'medieval_fantasy',],
  },
  {
    id: 'dark_lord', title: '暗影之王',
    description: '古老预言说暗影将再度笼罩大地，除非勇者举起圣剑',
    source: 'oracle', defaultMutability: 0.25,
    targetQuartersMin: 20, targetQuartersMax: 40,
    compatibleWorldviews: ['western_fantasy', 'medieval_fantasy',],
  },
  {
    id: 'elder_sign', title: '古神印记',
    description: '群星归位之时，沉眠的古神将从深海苏醒',
    source: 'celestial', defaultMutability: 0.05,
    targetQuartersMin: 40, targetQuartersMax: 80,
    compatibleWorldviews: ['western_fantasy', 'horror',],
  },
  {
    id: 'mandate_of_heaven', title: '天命所归',
    description: '紫微星动，新帝星现，王朝更替之兆',
    source: 'celestial', defaultMutability: 0.3,
    targetQuartersMin: 16, targetQuartersMax: 36,
    compatibleWorldviews: ['ancient_china',],
  },
  {
    id: 'dynasty_cycle', title: '五百年之数',
    description: '阴阳家推算：五百年必有王者兴',
    source: 'oracle', defaultMutability: 0.4,
    targetQuartersMin: 20, targetQuartersMax: 50,
    compatibleWorldviews: ['ancient_china',],
  },
  {
    id: 'singularity', title: '技术奇点',
    description: 'AI觉醒预言：三十年内机器智能将超越人类总和',
    source: 'artifact', defaultMutability: 0.5,
    targetQuartersMin: 12, targetQuartersMax: 30,
    compatibleWorldviews: ['sci_fi', 'cyberpunk',],
  },
  {
    id: 'first_contact', title: '第一类接触',
    description: '射电望远镜收到明确的外星文明信号',
    source: 'celestial', defaultMutability: 0.6,
    targetQuartersMin: 8, targetQuartersMax: 24,
    compatibleWorldviews: ['sci_fi',],
  },
  {
    id: 'extinction_event', title: '灭绝预言',
    description: '超级计算机推算：文明在百年内有73%概率自我毁灭',
    source: 'artifact', defaultMutability: 0.3,
    targetQuartersMin: 30, targetQuartersMax: 60,
    compatibleWorldviews: ['sci_fi', 'cyberpunk', 'post_apocalyptic',],
  },
  {
    id: 'green_earth', title: '大地的呼吸',
    description: '传说中有一个地方，辐射消散，草木重生',
    source: 'dream', defaultMutability: 0.4,
    targetQuartersMin: 20, targetQuartersMax: 40,
    compatibleWorldviews: ['post_apocalyptic', 'wasteland',],
  },
]

// ============================================================
// §4.2.5 浮点精度工具（已迁移至 utils.ts）
// ============================================================

