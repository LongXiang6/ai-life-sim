/**
 * @module constants.ts
 * @description mod-economy 常量 —— 经济/定居/工作/物品/人口 5 个子系统常量
 * @mod mod-economy
 */

import type {
  CurrencyType,
  MarketCyclePhase,
  SettlementType,
  Profession,
  ItemQuality,
  ItemCategory,
  RacePoolEntry,
  SettlementTierHint,
} from './types'

import type { DecimalInteger } from '@/foundation'

// 工具函数 Re-export
export { round, clamp, pickRandom, calculateItemPrice, calculateItemTier, getItemEconomicTier } from './utils'

// ============================================================
// §1 经济常量
// ============================================================

/** 默认货币类型 */
export const DEFAULT_CURRENCY: CurrencyType = 'coin'

/** 货币类型标签 */
export const CURRENCY_LABELS: Record<CurrencyType, string> = {
  barter: '以物易物',
  coin: '铸币',
  paper: '纸币',
  credit: '信用货币',
  crystal: '晶石货币',
  spirit: '灵石',
  energy: '能量货币',
}

/** 市场周期阶段标签 */
export const MARKET_PHASE_LABELS: Record<MarketCyclePhase, string> = {
  boom: '繁荣',
  normal: '平稳',
  recession: '衰退',
  depression: '萧条',
  recovery: '复苏',
}

/** 市场周期各阶段持续回合范围 */
export const MARKET_PHASE_DURATION: Record<MarketCyclePhase, [number, number]> = {
  boom: [3, 8],
  normal: [5, 15],
  recession: [3, 6],
  depression: [2, 5],
  recovery: [3, 7],
}

/** 市场周期推进序列 */
export const MARKET_PHASE_ORDER: readonly MarketCyclePhase[] = [
  'boom', 'normal', 'recession', 'depression', 'recovery',
]

/** 初始玩家财富 */
export const INITIAL_WEALTH: DecimalInteger = '100'

/** 税率范围 */
export const TAX_RANGE = { min: 0, max: 50 } as const

/** 市场阶段概率跳转表（每个阶段到各阶段的概率数组，按 MARKET_PHASE_ORDER 顺序） */
export const PHASE_TRANSITION_PROBABILITIES: Record<MarketCyclePhase, number[]> = {
  boom: [0.0, 0.7, 0.2, 0.0, 0.1],       // boom→normal 70%, →recession 20%, →recovery 10%
  normal: [0.2, 0.2, 0.4, 0.1, 0.1],      // normal→boom 20%, →normal 20%, →recession 40%, →depression 10%, →recovery 10%
  recession: [0.0, 0.2, 0.2, 0.4, 0.2],   // recession→normal 20%, →recession 20%, →depression 40%, →recovery 20%
  depression: [0.0, 0.1, 0.2, 0.3, 0.4],  // depression→normal 10%, →recession 20%, →depression 30%, →recovery 40%
  recovery: [0.3, 0.3, 0.1, 0.0, 0.3],     // recovery→boom 30%, →normal 30%, →recession 10%, →recovery 30%
}

/** 市场阶段叙事提示 */
export const MARKET_PHASE_HINT: Record<MarketCyclePhase, string> = {
  boom: '经济繁荣，百业兴旺，财富快速积累',
  normal: '物价平稳，交易公平，经济运行正常',
  recession: '市场需求下降，企业利润下滑，失业率上升',
  depression: '百业凋敝，货币贬值，大量人口失业',
  recovery: '经济触底回升，信心逐步恢复',
}

/** 季节价格修正（key = 季节名，value = 物价乘数） */
export const SEASONAL_PRICE_MODIFIERS: Record<string, number> = {
  spring: 0.95,
  summer: 1.0,
  autumn: 0.85,
  winter: 1.1,
}

/** 难度乘数 */
export const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  normal: 1.0,
  hard: 1.15,
  nightmare: 1.5,
  hell: 2.0,
}

/** 商路状态阈值（prosperity → status 映射） */
export const TRADE_ROUTE_STATUS_BLOCKED_MAX = 15
export const TRADE_ROUTE_STATUS_DECLINING_MAX = 30
export const TRADE_ROUTE_STATUS_FLOURISHING_MIN = 75

/** 商路状态中文标签 */
export const TRADE_ROUTE_STATUS_LABELS: Record<string, string> = {
  flourishing: '繁荣', normal: '正常', declining: '衰落', blocked: '中断',
}

/** 货币稳定性：自动演化阈值（stabilityIndex → 货币类型） */
export const CURRENCY_EVOLVE_THRESHOLDS: { threshold: number; type: CurrencyType }[] = [
  { threshold: 80, type: 'energy' },
  { threshold: 60, type: 'credit' },
  { threshold: 40, type: 'paper' },
  { threshold: 20, type: 'coin' },
  { threshold: -Infinity, type: 'barter' },
]

/** 依据稳定性获取对应货币类型
 * @param stabilityIndex 稳定性指数
 * @returns 货币类型
 */
export function getCurrencyTypeForStability(stabilityIndex: number): CurrencyType {
  for (const t of CURRENCY_EVOLVE_THRESHOLDS) {
    if (stabilityIndex >= t.threshold) return t.type
  }
  return 'barter'
}

/** 货币稳定性乘数范围 */
export const CURRENCY_STABILITY_MIN = 0.5
export const CURRENCY_STABILITY_MAX = 1.5

// ============================================================
// §2 定居常量
// ============================================================

/** 定居点类型标签 */
export const SETTLEMENT_TYPE_LABELS: Record<SettlementType, string> = {
  village: '村庄',
  town: '城镇',
  city: '城市',
  capital: '都城',
  fortress: '要塞',
  monastery: '修道院',
}

/** 定居点类型人口范围 */
export const SETTLEMENT_POPULATION_RANGE: Record<SettlementType, [number, number]> = {
  village: [50, 2_000],
  town: [2_000, 20_000],
  city: [20_000, 500_000],
  capital: [100_000, 20_000_000],
  fortress: [100, 20_000],
  monastery: [10, 5_000],
}

// ============================================================
// §3 定居点等级标签 + 叙事提示
// ============================================================

/**
 * 世界观分层标签（key = worldview，value = 4 级标签 + 叙事提示）
 * 映射规则：historical/wuxia/mythology → ancient 风格
 *          cultivation/xuanhuan → cultivation 风格
 *          scifi → scifi 风格
 *          post_apocalyptic/western_fantasy → modern 风格
 */
export const SETTLEMENT_TIER_HINTS: Record<string, Record<string, SettlementTierHint>> = {
  ancient: {
    village: { label: '乡野村寨', hint: '灵脉稀薄、散修林立，事件多围绕采药/猎妖/小型秘境/邻里械斗' },
    town: { label: '集镇市坊', hint: '灵气初聚、坊市初成，事件多围绕灵材交易/低阶法器/宗门招收/地头蛇之争' },
    city: { label: '州府大城', hint: '灵脉汇聚、世家盘踞，事件多围绕高阶坊市/宗门大比/上古遗迹/势力洗牌' },
    capital: { label: '京都帝阙', hint: '龙脉枢纽、皇权至上，事件多围绕朝堂风云/帝位更迭/国战/天灾预警/圣地开启' },
  },
  cultivation: {
    village: { label: '散修山居', hint: '灵气稀薄、散修聚居，事件多围绕采药炼丹/猎妖/秘境探索/散修争斗' },
    town: { label: '修士坊市', hint: '灵脉初成、坊市渐兴，事件多围绕灵材交易/法器铸造/宗门收徒/洞府争夺' },
    city: { label: '宗门驻地', hint: '灵脉汇聚、大能坐镇，事件多围绕宗门大比/秘境开启/渡劫异象/正魔交锋' },
    capital: { label: '仙城圣域', hint: '仙城浮空、灵气澎湃，事件多围绕大能驻足/天劫预兆/上古遗迹/飞升前夕' },
  },
  scifi: {
    village: { label: '殖民前哨', hint: '资源有限、环境严苛，事件多围绕殖民勘探/异星生物/设备故障/补给争夺' },
    town: { label: '星港城镇', hint: '商路交汇、人口流动，事件多围绕星际贸易/科技黑市/难民潮/间谍活动' },
    city: { label: '巢都', hint: '层层叠叠、秩序混乱，事件多围绕帮派火并/基因改造/AI叛乱/上层阴谋' },
    capital: { label: '首都世界', hint: '银河枢纽、文明核心，事件多围绕议会博弈/星际战争/远古遗物/文明存亡' },
  },
  modern: {
    village: { label: '乡镇郊区', hint: '宁静祥和、邻里相熟，事件多围绕生活琐事/季节变化/小商贩/乡村节日' },
    town: { label: '县城区域', hint: '设施齐全、交通便利，事件多围绕本地新闻/商业竞争/社交活动/教育改革' },
    city: { label: '大城市中心', hint: '高楼林立、机会众多，事件多围绕职场竞争/都市传说/文化盛事/资本博弈' },
    capital: { label: '首都直辖市', hint: '权力中心、全国焦点，事件多围绕政治风云/经济政策/国际关系/科技突破' },
  },
}

/** 世界观 → 标签集映射 */
export const WORLDVIEW_TIER_MAP: Record<string, string> = {
  historical: 'ancient',
  wuxia: 'ancient',
  mythology: 'ancient',
  cultivation: 'cultivation',
  xuanhuan: 'cultivation',
  scifi: 'scifi',
  post_apocalyptic: 'modern',
  western_fantasy: 'modern',
}

/** 默认标签集 */
export const DEFAULT_TIER_SET = 'modern'

// ============================================================
// §4 工作常量
// ============================================================

/** 职业标签 */
export const PROFESSION_LABELS: Record<Profession, string> = {
  farmer: '农夫',
  merchant: '商人',
  artisan: '工匠',
  scholar: '学者',
  soldier: '士兵',
  official: '官员',
  priest: '祭司',
  artist: '艺术家',
  doctor: '医师',
  explorer: '探险家',
}

/** 职业基础收入 */
export const PROFESSION_BASE_INCOME: Record<Profession, number> = {
  farmer: 5,
  merchant: 15,
  artisan: 10,
  scholar: 8,
  soldier: 8,
  official: 20,
  priest: 6,
  artist: 7,
  doctor: 12,
  explorer: 5,
}

/** 晋升所需经验 */
export const PROMOTION_XP_THRESHOLD = 100

// ============================================================
// §5 物品常量
// ============================================================

/** 品质标签 */
export const ITEM_QUALITY_LABELS: Record<ItemQuality, string> = {
  common: '普通',
  uncommon: '精良',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}

/** 类别标签 */
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: '武器',
  armor: '防具',
  accessory: '饰品',
  consumable: '消耗品',
  material: '材料',
  quest: '任务物品',
  treasure: '宝物',
}

/** 默认背包容量 */
export const DEFAULT_INVENTORY_CAPACITY = 20

/** 世界观 → 可用物品类别映射（未列出的类别视为通用） */
export const WORLDVIEW_ITEM_CATEGORIES: Record<string, ItemCategory[]> = {
  historical: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
  wuxia: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
  cultivation: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
  xuanhuan: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
  western_fantasy: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
  scifi: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
  post_apocalyptic: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
  mythology: ['weapon', 'armor', 'accessory', 'consumable', 'material', 'quest', 'treasure'],
}

/** 世界观物品模板池（预设物品，AI 可基于此添加） */
export const WORLDVIEW_ITEM_POOLS: Record<string, Array<{
  name: string; category: ItemCategory; quality: ItemQuality; value: number; description: string; narrativeEffect?: string; economicTierHint?: number
}>> = {
  // ── 通用 ──
  default: [
    { name: '干粮', category: 'consumable', quality: 'common', value: 1, description: '最基本的口粮', narrativeEffect: '回复体力', economicTierHint: 1 },
    { name: '水囊', category: 'consumable', quality: 'common', value: 1, description: '装水的皮囊', narrativeEffect: '解渴', economicTierHint: 1 },
    { name: '火把', category: 'consumable', quality: 'common', value: 1, description: '照明用的火把', narrativeEffect: '照亮黑暗', economicTierHint: 1 },
    { name: '麻绳', category: 'material', quality: 'common', value: 2, description: '结实的麻绳', narrativeEffect: '攀爬/捆绑', economicTierHint: 1 },
    { name: '布匹', category: 'material', quality: 'common', value: 3, description: '普通布料', narrativeEffect: '制作衣物', economicTierHint: 1 },
    { name: '草药', category: 'consumable', quality: 'common', value: 2, description: '基础疗伤草药', narrativeEffect: '回复少量生命', economicTierHint: 1 },
    { name: '铜钱', category: 'treasure', quality: 'common', value: 1, description: '通用货币', narrativeEffect: '购买物品', economicTierHint: 1 },
  ],
  // ── historical ──
  historical: [
    { name: '青铜剑', category: 'weapon', quality: 'common', value: 10, description: '青铜铸造的短剑', narrativeEffect: '近战攻击+2', economicTierHint: 1 },
    { name: '铁甲', category: 'armor', quality: 'common', value: 15, description: '铁片编制铠甲', narrativeEffect: '防御+3', economicTierHint: 1 },
    { name: '竹简', category: 'material', quality: 'common', value: 3, description: '刻有文字的竹简', narrativeEffect: '知识+1', economicTierHint: 1 },
    { name: '玉佩', category: 'accessory', quality: 'uncommon', value: 20, description: '温润玉佩', narrativeEffect: '魅力+1', economicTierHint: 1 },
    { name: '孙子兵法', category: 'quest', quality: 'rare', value: 50, description: '兵法奇书', narrativeEffect: '谋略+5', economicTierHint: 1 },
    { name: '传国玉玺', category: 'treasure', quality: 'legendary', value: 1000, description: '皇权象征', narrativeEffect: '号令天下', economicTierHint: 1 },
  ],
  // ── wuxia ──
  wuxia: [
    { name: '长剑', category: 'weapon', quality: 'common', value: 8, description: '三尺青锋', narrativeEffect: '剑法+2', economicTierHint: 2 },
    { name: '飞镖', category: 'weapon', quality: 'common', value: 3, description: '暗器飞镖', narrativeEffect: '远程攻击+1', economicTierHint: 1 },
    { name: '夜行衣', category: 'armor', quality: 'uncommon', value: 15, description: '便于潜行的黑衣', narrativeEffect: '潜行+3', economicTierHint: 2 },
    { name: '金疮药', category: 'consumable', quality: 'common', value: 5, description: '疗伤圣药', narrativeEffect: '回复大量生命', economicTierHint: 2 },
    { name: '易容面具', category: 'accessory', quality: 'rare', value: 30, description: '精妙的人皮面具', narrativeEffect: '伪装+4', economicTierHint: 2 },
    { name: '武林秘籍', category: 'quest', quality: 'epic', value: 100, description: '失传的武林绝学', narrativeEffect: '武功+10', economicTierHint: 3 },
  ],
  // ── cultivation ──
  cultivation: [
    { name: '飞剑', category: 'weapon', quality: 'rare', value: 50, description: '御剑飞行/攻敌', narrativeEffect: '攻击+8, 飞行', economicTierHint: 4 },
    { name: '炼丹炉', category: 'treasure', quality: 'uncommon', value: 40, description: '炼丹法器', narrativeEffect: '丹药品质+2', economicTierHint: 3 },
    { name: '灵石', category: 'material', quality: 'common', value: 10, description: '蕴含灵气的石头', narrativeEffect: '修炼加速', economicTierHint: 2 },
    { name: '筑基丹', category: 'consumable', quality: 'rare', value: 60, description: '筑基突破丹药', narrativeEffect: '突破筑基期', economicTierHint: 3 },
    { name: '储物袋', category: 'accessory', quality: 'uncommon', value: 30, description: '空间法器', narrativeEffect: '背包容量+10', economicTierHint: 3 },
    { name: '上古法宝', category: 'treasure', quality: 'legendary', value: 500, description: '上古大能遗留的法宝', narrativeEffect: '战力+20', economicTierHint: 7 },
    { name: '灵草', category: 'material', quality: 'common', value: 5, description: '蕴含灵气的草药', narrativeEffect: '炼丹材料', economicTierHint: 2 },
  ],
  // ── xuanhuan ──
  xuanhuan: [
    { name: '魂器', category: 'weapon', quality: 'rare', value: 60, description: '灵魂绑定武器', narrativeEffect: '灵魂攻击+10', economicTierHint: 5 },
    { name: '妖兽内丹', category: 'material', quality: 'uncommon', value: 25, description: '妖兽修炼精华', narrativeEffect: '炼化吸收+5', economicTierHint: 4 },
    { name: '灵符', category: 'consumable', quality: 'common', value: 5, description: '蕴含术法的符箓', narrativeEffect: '法术+2', economicTierHint: 2 },
    { name: '轮回盘', category: 'treasure', quality: 'epic', value: 200, description: '参悟轮回的秘宝', narrativeEffect: '悟道+10', economicTierHint: 6 },
    { name: '星辰砂', category: 'material', quality: 'rare', value: 50, description: '蕴含星辰之力的砂砾', narrativeEffect: '炼器材料+8', economicTierHint: 5 },
  ],
  // ── western_fantasy ──
  western_fantasy: [
    { name: '长剑', category: 'weapon', quality: 'common', value: 10, description: '精钢长剑', narrativeEffect: '攻击+3', economicTierHint: 2 },
    { name: '魔法杖', category: 'weapon', quality: 'uncommon', value: 30, description: '施法媒介', narrativeEffect: '魔力+5', economicTierHint: 3 },
    { name: '锁子甲', category: 'armor', quality: 'common', value: 20, description: '铁环编成的铠甲', narrativeEffect: '防御+4', economicTierHint: 2 },
    { name: '魔法药水', category: 'consumable', quality: 'common', value: 8, description: '恢复魔法的药水', narrativeEffect: '回复魔力', economicTierHint: 2 },
    { name: '龙鳞', category: 'material', quality: 'epic', value: 100, description: '真龙之鳞', narrativeEffect: '锻造传说装备', economicTierHint: 5 },
    { name: '圣杯', category: 'treasure', quality: 'legendary', value: 500, description: '传说圣物', narrativeEffect: '治愈一切', economicTierHint: 6 },
  ],
  // ── scifi ──
  scifi: [
    { name: '激光枪', category: 'weapon', quality: 'common', value: 20, description: '标准能量武器', narrativeEffect: '远程攻击+5', economicTierHint: 3 },
    { name: '能量护盾', category: 'armor', quality: 'uncommon', value: 35, description: '便携能量护盾', narrativeEffect: '防御+8', economicTierHint: 3 },
    { name: '医疗喷雾', category: 'consumable', quality: 'common', value: 10, description: '纳米医疗喷雾', narrativeEffect: '快速治疗', economicTierHint: 2 },
    { name: '全息芯片', category: 'accessory', quality: 'uncommon', value: 25, description: '存储全息信息', narrativeEffect: '知识+3', economicTierHint: 2 },
    { name: '反物质电池', category: 'material', quality: 'epic', value: 80, description: '高效能源', narrativeEffect: '能量+15', economicTierHint: 4 },
    { name: '外星遗物', category: 'treasure', quality: 'legendary', value: 1000, description: '未知文明遗物', narrativeEffect: '科技飞跃', economicTierHint: 7 },
  ],
  // ── post_apocalyptic ──
  post_apocalyptic: [
    { name: '生锈砍刀', category: 'weapon', quality: 'common', value: 5, description: '锈迹斑斑的砍刀', narrativeEffect: '攻击+2', economicTierHint: 1 },
    { name: '防弹背心', category: 'armor', quality: 'uncommon', value: 20, description: '轻度防弹', narrativeEffect: '防御+5', economicTierHint: 2 },
    { name: '净化水', category: 'consumable', quality: 'common', value: 5, description: '干净饮用水', narrativeEffect: '解渴/防疾病', economicTierHint: 1 },
    { name: '罐头食品', category: 'consumable', quality: 'common', value: 3, description: '保质期内的罐头', narrativeEffect: '充饥', economicTierHint: 1 },
    { name: '废铁', category: 'material', quality: 'common', value: 1, description: '可回收金属', narrativeEffect: '建造材料', economicTierHint: 1 },
    { name: '核能电池', category: 'treasure', quality: 'epic', value: 60, description: '持久能源', narrativeEffect: '能源+20', economicTierHint: 3 },
  ],
  // ── mythology ──
  mythology: [
    { name: '神剑', category: 'weapon', quality: 'epic', value: 200, description: '诸神铸造的神器', narrativeEffect: '神性攻击+15', economicTierHint: 7 },
    { name: '金苹果', category: 'consumable', quality: 'legendary', value: 500, description: '众神之果', narrativeEffect: '永生/神力', economicTierHint: 8 },
    { name: '神盾', category: 'armor', quality: 'epic', value: 180, description: '天神盾牌', narrativeEffect: '防御+15', economicTierHint: 7 },
    { name: '神器碎片', category: 'material', quality: 'rare', value: 50, description: '破碎神器的残片', narrativeEffect: '蕴含神力', economicTierHint: 6 },
    { name: '神力护符', category: 'accessory', quality: 'epic', value: 150, description: '附有神力的护符', narrativeEffect: '神力+10', economicTierHint: 6 },
  ],
}

/** 将物品名映射到世界观池（若无匹配则用 default 池兜底）
 * @param worldview 世界观标识
 * @returns 物品模板池数组
 */
export function getItemPoolForWorldview(worldview: string): Array<{
  name: string; category: ItemCategory; quality: ItemQuality; value: number; description: string; narrativeEffect?: string; economicTierHint?: number
}> {
  return WORLDVIEW_ITEM_POOLS[worldview] ?? WORLDVIEW_ITEM_POOLS.default
}

/** 叙事关键词 → 物品名映射（用于叙事自动检测） */
export const NARRATIVE_ITEM_KEYWORDS: Record<string, string[]> = {
  // 通用物品关键词
  干粮: ['干粮', '口粮', '饼', '馒头', '面包'],
  水: ['水囊', '水壶', '饮水', '清水'],
  草药: ['草药', '药草', '伤药'],
  铜钱: ['铜钱', '银两', '银子', '钱财', '金币'],
  // historical
  青铜剑: ['青铜剑', '铜剑', '短剑'],
  玉佩: ['玉佩', '玉饰', '玉环'],
  // wuxia
  长剑: ['长剑', '宝剑', '利剑', '钢剑'],
  飞镖: ['飞镖', '暗器', '飞刀'],
  金疮药: ['金疮药', '金创药', '疗伤药'],
  // cultivation
  飞剑: ['飞剑', '仙剑', '飞剑法宝'],
  灵石: ['灵石', '灵玉', '仙石'],
  筑基丹: ['筑基丹', '筑基丹丸', '破境丹'],
  灵草: ['灵草', '灵药', '仙草'],
  // scifi
  激光枪: ['激光枪', '激光武器', '粒子枪', '能量枪'],
  医疗喷雾: ['医疗喷雾', '治疗喷雾', '纳米医疗'],
  // post_apocalyptic
  罐头食品: ['罐头', '罐头食品', '军粮'],
  净化水: ['净水', '净化水', '清洁水'],
  // mythology
  金苹果: ['金苹果', '黄金苹果'],
}

/** 叙事中"获得"类动词模式 */
export const ITEM_ACQUIRE_VERBS = [
  '获得', '得到', '拿到', '捡到', '拾取', '获取', '收下', '接过',
  '找到', '发现', '买下', '购买', '换取', '赢取', '夺得', '缴获',
  '领取', '收到', '采到', '挖出', '锻造', '炼制', '铸造', '制作',
]

/** 叙事中"失去"类动词模式 */
export const ITEM_LOSE_VERBS = [
  '失去', '丢掉', '扔掉', '丢弃', '丢失', '遗失', '损坏', '毁掉',
  '卖出', '卖掉', '交出', '赠送', '给予', '消耗', '使用', '吃',
]

// ============================================================
// §6 人口常量
// ============================================================

/** 初始总人口 */
export const INITIAL_POPULATION: DecimalInteger = '1000000'

/** 基础年出生率 */
export const BASE_BIRTH_RATE = 0.03

/** 基础年死亡率 */
export const BASE_DEATH_RATE = 0.025

/** 最大移民人数 */
export const MAX_MIGRATION_AMOUNT: DecimalInteger = '10000'

/** 世界观分层种族池（key = worldview，value = 可选种族列表） */
export const WORLDVIEW_RACE_POOLS: Record<string, RacePoolEntry[]> = {
  historical: [
    { name: '人族', weight: 1, growthRate: 0.005 },
  ],
  cultivation: [
    { name: '人族', weight: 60, growthRate: 0.006 },
    { name: '妖族', weight: 18, growthRate: 0.004 },
    { name: '灵族', weight: 10, growthRate: 0.003 },
    { name: '魔族', weight: 8, growthRate: 0.002 },
    { name: '兽化人', weight: 3, growthRate: 0.005 },
    { name: '龙裔', weight: 1, growthRate: 0.001 },
  ],
  wuxia: [
    { name: '人族', weight: 85, growthRate: 0.005 },
    { name: '灵族', weight: 12, growthRate: 0.003 },
    { name: '魔族', weight: 3, growthRate: 0.001 },
  ],
  xuanhuan: [
    { name: '人族', weight: 55, growthRate: 0.006 },
    { name: '妖族', weight: 20, growthRate: 0.004 },
    { name: '灵族', weight: 12, growthRate: 0.003 },
    { name: '魔族', weight: 8, growthRate: 0.002 },
    { name: '兽化人', weight: 3, growthRate: 0.005 },
    { name: '龙裔', weight: 2, growthRate: 0.001 },
  ],
  western_fantasy: [
    { name: '人类', weight: 50, growthRate: 0.006 },
    { name: '精灵', weight: 15, growthRate: 0.003 },
    { name: '矮人', weight: 12, growthRate: 0.004 },
    { name: '兽人', weight: 10, growthRate: 0.005 },
    { name: '半身人', weight: 5, growthRate: 0.007 },
    { name: '龙裔', weight: 5, growthRate: 0.001 },
    { name: '亚人', weight: 3, growthRate: 0.004 },
  ],
  scifi: [
    { name: '人类', weight: 70, growthRate: 0.005 },
    { name: '天族', weight: 15, growthRate: 0.003 },
    { name: '灵族', weight: 10, growthRate: 0.002 },
    { name: '异星种', weight: 5, growthRate: 0.004 },
  ],
  post_apocalyptic: [
    { name: '人类', weight: 85, growthRate: 0.004 },
    { name: '突变种', weight: 12, growthRate: 0.003 },
    { name: '避难所民', weight: 3, growthRate: 0.006 },
  ],
  mythology: [
    { name: '凡人', weight: 70, growthRate: 0.005 },
    { name: '天族', weight: 12, growthRate: 0.002 },
    { name: '灵族', weight: 8, growthRate: 0.003 },
    { name: '魔族', weight: 6, growthRate: 0.001 },
    { name: '巨人', weight: 4, growthRate: 0.002 },
  ],
}

/** 默认种族（兜底） */
export const DEFAULT_RACE_POOL: RacePoolEntry[] = [
  { name: '人族', weight: 1, growthRate: 0.005 },
]

/** 种族融合度变化速率/年 */
export const RACE_INTEGRATION_CHANGE_RATE = 0.5
/** 种族紧张度衰减速率/年（无冲突时） */
export const RACE_TENSION_DECAY_RATE = 1
/** 紧张度触发冲突的阈值 */
export const RACE_TENSION_RIOT_THRESHOLD = 60
/** 趋势事件触发年数 */
export const POPULATION_TREND_THRESHOLD = 3

/** 人口流动性指数：城镇化权重系数 */
export const MOBILITY_URBAN_WEIGHT = 0.85
/** 人口流动性指数：基础值 */
export const MOBILITY_BASE = 0.05
