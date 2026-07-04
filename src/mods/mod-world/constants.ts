/**
 * @module constants.ts
 * @description 常量定义 —— 阶段跨度、世界观标签映射、地图模板、存储键
 * @mod mod-world
 */

// ========== 世界观事件风格提示（12 种，对齐废弃项目） ==========

const UNIVERSAL_EPIC = '诸天无尽寰宇降临、主神空间开启、多元宇宙战争、异界灵魂入侵、维度裂缝撕裂、跨位面征服、混沌纪元开端、万界融合'

/** 世界观 → AI 事件风格提示映射 */
export const WORLDVIEW_STYLE_HINTS: Record<string, string> = {
  cultivation:
    `${UNIVERSAL_EPIC}、天道崩裂、域外天魔入侵、灵气潮汐、飞升浩劫、上古遗迹现世、万族大战、轮回之劫、因果反噬、天劫降临、混沌至宝出世` +
    ` | 低级事件示例：散修突破、小宗门崛起、灵石矿脉发现、江湖帮派纷争、凡人间坊市交易` +
    ` | 高级事件示例：仙帝陨落、纪元重启、诸天万界归墟`,
  eastern_fantasy:
    `${UNIVERSAL_EPIC}、天道崩裂、万妖侵袭、灵气复苏、仙魔大战、上古秘境、轮回劫难` +
    ` | 高级事件示例：万界归一、造物主苏醒`,
  western_fantasy:
    `${UNIVERSAL_EPIC}、龙族苏醒、亡灵天灾、神魔战争、位面融合、上古神器现世、预言应验、诸神黄昏`,
  scifi:
    `${UNIVERSAL_EPIC}、虫族入侵、AI觉醒、技术奇点、星际帝国崩塌、外星文明首次接触、纳米灾难、量子坍缩、戴森球建成`,
  post_apocalyptic:
    `${UNIVERSAL_EPIC}、辐射风暴、变异兽潮、避难所崩溃、旧日支配者苏醒、资源枯竭、基因突变`,
  survival_horror:
    `${UNIVERSAL_EPIC}、旧日支配者苏醒、SAN值崩塌、不可名状之物降临、异界渗透`,
  materialist:
    '世界大战、经济崩溃、技术革命、文明崩塌、大瘟疫、意识形态决战',
  historical:
    '帝国崛起、王朝崩塌、大征服、宗教战争、大航海、工业革命',
  modern:
    '世界大战、核危机、技术革命、经济大萧条、文明冲突',
  wuxia:
    '武林盟主之争、绝世武功出世、魔教入侵、正邪大战',
  mythological:
    '诸神战争、创世洪水、英雄传说、巨兽苏醒',
  steampunk:
    '蒸汽革命、飞艇战争、机械觉醒、能源危机',
}

// ========== 世界观本质标签映射（UI 显示标签，非 AI 内容约束） ==========

export const ESSENCE_TAGS: Record<string, string> = {
  cultivation: '仙侠修真',
  wuxia: '武侠江湖',
  scifi: '科幻未来',
  westernFantasy: '西方奇幻',
  easternFantasy: '东方玄幻',
  modern: '现代都市',
  postApocalyptic: '末日废土',
  survivalHorror: '生存恐怖',
  steampunk: '蒸汽朋克',
  lovecraftian: '克苏鲁神话',
  mythological: '神话时代',
  historical: '历史演义',
  materialist: '唯物主义',
} as const satisfies Record<string, string>

// ========== 空间形态 → 世界容器上限 ==========

export const SPACE_POWER_CAP: Record<string, number> = {
  plane: 8,
  universe: 12,
  crystalSphere: 18,
  multiverse: 21,
  omniverse: 24,
} as const satisfies Record<string, number>

// ========== 7 种地图模板（区域生成起点，AI 可叠加变更） ==========

// GenerationStrategy 和 MapTemplateConfig 类型定义已迁移至 types.ts
import type { MapTemplateConfig, } from './types'

export const MAP_TEMPLATES: Record<string, MapTemplateConfig> = {
  continent: {
    label: '大陆',
    regionCount: 12,
    description: '中央大陆被海洋环抱，区域从中心向外辐射',
    generationStrategy: 'climateLatitude',
  },
  archipelago: {
    label: '群岛',
    regionCount: 8,
    description: '星罗棋布的岛屿，每岛为一个独立区域',
    generationStrategy: 'climateLatitude',
  },
  pangaea: {
    label: '盘古',
    regionCount: 16,
    description: '一整块超级大陆，区域沿纬度带划分',
    generationStrategy: 'climateLatitude',
  },
  multiContinent: {
    label: '多大陆',
    regionCount: 18,
    description: '多块大陆分散在海洋中，每块含 3-4 个区域',
    generationStrategy: 'climateLatitude',
  },
  oceanWorld: {
    label: '海洋',
    regionCount: 6,
    description: '以海洋为主的世界，区域为洋流系统和水下城邦',
    generationStrategy: 'climateLatitude',
  },
  plane: {
    label: '位面',
    regionCount: 4,
    description: '多个位面层叠，每层为一个独立空间区域',
    generationStrategy: 'discrete',
  },
  starSystems: {
    label: '星际',
    regionCount: 10,
    description: '恒星系网络，每星系为独立区域',
    generationStrategy: 'cosmic',
  },
  /** 天圆地方 — 平坦大地被穹顶天空覆盖，区域从中央圣地向边缘荒野呈同心环分布 */
  flatDiscWorld: {
    label: '天圆地方',
    regionCount: 5,
    description: '平坦大地被穹顶覆盖，区域从中央向边缘呈同心环分布：中央圣地→内环→中环→外环→边缘绝域',
    generationStrategy: 'concentricRings',
  },
  /** 虚空 — 抽象概念空间，无物理"区域"概念 */
  void: {
    label: '虚空',
    regionCount: 1,
    description: '抽象概念空间，无传统物理区域，仅以原点标识世界中心',
    generationStrategy: 'abstract',
  },
} as const satisfies Record<string, MapTemplateConfig>

// ========== 实体生成：建议数量范围 ==========

export const ENTITY_GENERATION_COUNTS = {
  nations: { min: 1, max: 15, },
  factions: { min: 2, max: 8, },
  nobleHouses: { min: 0, max: 15, },
  settlements: { min: 3, max: 30, },
  tradeRoutes: { min: 3, max: 6, },
} as const

// ========== 存储键（符合 {mod}:{category}:{key} 格式） ==========

export const STORAGE_KEYS = {
  /** 具名实体：mod-world:entities:{worldCode} */
  ENTITIES: 'mod-world:entities',
  /** 世界快照：mod-world:snapshot:{worldCode} */
  SNAPSHOT: 'mod-world:snapshot',
} as const
