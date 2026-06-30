/**
 * @module constants.ts
 * @description mod-history-dynamics 常量 —— 预设事件池、因果捕获关键词
 * @mod mod-history-dynamics
 */

import type { EventPoolEntry, CausalActionType, } from './types'

// ============================================================
// §0 通用工具
// ============================================================

export const ROUND_DECIMALS = 4

// ============================================================
// §1 预设事件池 (43 条)
// ============================================================

export const PRESET_EVENT_POOL: readonly Omit<EventPoolEntry, 'id' | 'triggered' | 'triggeredYear' | 'expired'>[] = [
  // 天灾类
  { name: '大洪水', description: '河流泛滥，淹没大片农田', source: 'preset', triggerCondition: '连续多雨年', triggerWindow: [0, 9999,], affectedRegions: [], severity: 70, },
  { name: '大地震', description: '强烈地震摧毁城市', source: 'preset', triggerCondition: '板块活跃区域', triggerWindow: [0, 9999,], affectedRegions: [], severity: 85, },
  { name: '大饥荒', description: '连年歉收导致大规模饥荒', source: 'preset', triggerCondition: '农业减产+人口过剩', triggerWindow: [0, 9999,], affectedRegions: [], severity: 75, },
  { name: '瘟疫流行', description: '传染病蔓延，人口锐减', source: 'preset', triggerCondition: '卫生条件差+人口密集', triggerWindow: [0, 9999,], affectedRegions: [], severity: 80, },
  { name: '火山爆发', description: '火山喷发，遮天蔽日', source: 'preset', triggerCondition: '火山地形区域', triggerWindow: [0, 9999,], affectedRegions: [], severity: 90, },
  { name: '蝗灾', description: '遮天蔽日的蝗虫过境', source: 'preset', triggerCondition: '干旱后降雨', triggerWindow: [0, 9999,], affectedRegions: [], severity: 60, },
  { name: '海啸', description: '巨浪吞噬沿海地区', source: 'preset', triggerCondition: '海底地震', triggerWindow: [0, 9999,], affectedRegions: [], severity: 90, },
  // 战争类
  { name: '边境冲突', description: '邻国边境发生军事冲突', source: 'preset', triggerCondition: '领土争端', triggerWindow: [0, 9999,], affectedRegions: [], severity: 40, },
  { name: '全面战争', description: '两国之间爆发全面战争', source: 'preset', triggerCondition: '关系破裂+军事准备', triggerWindow: [0, 9999,], affectedRegions: [], severity: 95, },
  { name: '内战', description: '国内势力分裂，爆发内战', source: 'preset', triggerCondition: '政局动荡+派系对立', triggerWindow: [0, 9999,], affectedRegions: [], severity: 85, },
  { name: '农民起义', description: '农民不堪重负揭竿而起', source: 'preset', triggerCondition: '税率过高+饥荒', triggerWindow: [0, 9999,], affectedRegions: [], severity: 70, },
  { name: '蛮族入侵', description: '边境外的蛮族大举入侵', source: 'preset', triggerCondition: '边境空虚', triggerWindow: [0, 9999,], affectedRegions: [], severity: 75, },
  { name: '圣战', description: '宗教冲突升级为圣战', source: 'preset', triggerCondition: '宗教对立激烈', triggerWindow: [0, 9999,], affectedRegions: [], severity: 80, },
  // 政治类
  { name: '宫廷政变', description: '朝中权臣发动政变夺权', source: 'preset', triggerCondition: '君主暗弱', triggerWindow: [0, 9999,], affectedRegions: [], severity: 65, },
  { name: '改朝换代', description: '旧王朝覆灭新朝建立', source: 'preset', triggerCondition: '民怨沸腾+军事失败', triggerWindow: [0, 9999,], affectedRegions: [], severity: 100, },
  { name: '中兴之治', description: '明君改革，国力复兴', source: 'preset', triggerCondition: '新君即位+人才济济', triggerWindow: [0, 9999,], affectedRegions: [], severity: 30, },
  { name: '弑君事件', description: '君主遭到弑杀', source: 'preset', triggerCondition: '宫廷阴谋', triggerWindow: [0, 9999,], affectedRegions: [], severity: 75, },
  { name: '宦官干政', description: '宦官集团掌控朝政', source: 'preset', triggerCondition: '君主昏庸', triggerWindow: [0, 9999,], affectedRegions: [], severity: 50, },
  { name: '外戚专权', description: '外戚家族垄断权力', source: 'preset', triggerCondition: '幼主即位', triggerWindow: [0, 9999,], affectedRegions: [], severity: 50, },
  // 经济类
  { name: '经济繁荣', description: '商业兴旺，民生富足', source: 'preset', triggerCondition: '和平时期+政策得力', triggerWindow: [0, 9999,], affectedRegions: [], severity: 20, },
  { name: '通货膨胀', description: '货币贬值物价飞涨', source: 'preset', triggerCondition: '货币超发', triggerWindow: [0, 9999,], affectedRegions: [], severity: 45, },
  { name: '商路开辟', description: '新的贸易路线被发现', source: 'preset', triggerCondition: '探索发现', triggerWindow: [0, 9999,], affectedRegions: [], severity: 25, },
  { name: '资源枯竭', description: '重要资源矿产枯竭', source: 'preset', triggerCondition: '过度开采', triggerWindow: [0, 9999,], affectedRegions: [], severity: 55, },
  // 文化类
  { name: '百家争鸣', description: '学术思想空前活跃', source: 'preset', triggerCondition: '社会变革期', triggerWindow: [0, 9999,], affectedRegions: [], severity: 15, },
  { name: '焚书坑儒', description: '大规模文化毁灭运动', source: 'preset', triggerCondition: '专制统治加强', triggerWindow: [0, 9999,], affectedRegions: [], severity: 60, },
  { name: '宗教改革', description: '宗教内部发生重大变革', source: 'preset', triggerCondition: '教会腐败', triggerWindow: [0, 9999,], affectedRegions: [], severity: 50, },
  { name: '艺术黄金时代', description: '艺术创作达到顶峰', source: 'preset', triggerCondition: '经济繁荣+赞助充足', triggerWindow: [0, 9999,], affectedRegions: [], severity: 15, },
  { name: '大移民潮', description: '大规模人口迁徙', source: 'preset', triggerCondition: '原居地灾难/新大陆发现', triggerWindow: [0, 9999,], affectedRegions: [], severity: 45, },
  // 科技类
  { name: '技术革命', description: '重大技术突破改变生产力', source: 'preset', triggerCondition: '长期技术积累', triggerWindow: [0, 9999,], affectedRegions: [], severity: 35, },
  { name: '冶金突破', description: '新型金属冶炼技术诞生', source: 'preset', triggerCondition: '铁矿充足+战事需求', triggerWindow: [0, 9999,], affectedRegions: [], severity: 25, },
  { name: '航海大发现', description: '远洋航行发现新大陆', source: 'preset', triggerCondition: '造船技术进步', triggerWindow: [0, 9999,], affectedRegions: [], severity: 40, },
  { name: '火药应用', description: '火药被用于军事', source: 'preset', triggerCondition: '炼丹术进步', triggerWindow: [0, 9999,], affectedRegions: [], severity: 35, },
  { name: '医学突破', description: '重大医学理论或药物发现', source: 'preset', triggerCondition: '瘟疫流行+学术积累', triggerWindow: [0, 9999,], affectedRegions: [], severity: 25, },
  // 社会类
  { name: '废奴运动', description: '大规模废除奴隶制度', source: 'preset', triggerCondition: '人道主义思潮', triggerWindow: [0, 9999,], affectedRegions: [], severity: 40, },
  { name: '法律改革', description: '颁布重要法典', source: 'preset', triggerCondition: '社会矛盾激化', triggerWindow: [0, 9999,], affectedRegions: [], severity: 30, },
  { name: '科举改制', description: '选官制度重大改革', source: 'preset', triggerCondition: '人才匮乏', triggerWindow: [0, 9999,], affectedRegions: [], severity: 30, },
  { name: '城市化浪潮', description: '大量人口涌入城市', source: 'preset', triggerCondition: '商业繁荣+农业效率提升', triggerWindow: [0, 9999,], affectedRegions: [], severity: 25, },
  // 传奇类
  { name: '英雄出世', description: '一位传奇英雄诞生', source: 'preset', triggerCondition: '乱世出英雄', triggerWindow: [0, 9999,], affectedRegions: [], severity: 20, },
  { name: '预言应验', description: '古老预言惊人应验', source: 'preset', triggerCondition: '预言系统触发', triggerWindow: [0, 9999,], affectedRegions: [], severity: 55, },
  { name: '神器现世', description: '传说中的神器被发掘', source: 'preset', triggerCondition: '考古发现/机缘', triggerWindow: [0, 9999,], affectedRegions: [], severity: 30, },
  { name: '异界之门', description: '通往异世界的大门开启', source: 'preset', triggerCondition: '魔法/科技波动', triggerWindow: [0, 9999,], affectedRegions: [], severity: 100, },
  { name: '龙之觉醒', description: '远古巨龙从沉睡中苏醒', source: 'preset', triggerCondition: '世界能量波动', triggerWindow: [0, 9999,], affectedRegions: [], severity: 95, },
  { name: '圣人降世', description: '一位圣贤降生于世', source: 'preset', triggerCondition: '天道循环', triggerWindow: [0, 9999,], affectedRegions: [], severity: 10, },
]

/** 事件池刷新间隔（年） */
export const EVENT_POOL_REFRESH_INTERVAL = 5

/** 事件最大容量 */
export const MAX_EVENT_POOL_SIZE = 50

// ============================================================
// §2 因果捕获关键词正则 (8 种行为)
// ============================================================

/** 因果行为中文标签 */
export const CAUSAL_ACTION_LABELS: Record<CausalActionType, string> = {
  war_attack: '发动战争',
  assassination: '暗杀',
  rebellion: '叛乱',
  betrayal: '背叛',
  alliance_form: '结盟',
  trade_embargo: '贸易封锁',
  cultural_export: '文化输出',
  discovery: '大发现',
}

/** 因果捕获正则（关键词→行为类型） */
export const CAUSAL_REGEX_RULES: readonly { pattern: RegExp; actionType: CausalActionType }[] = [
  { pattern: /宣战|出征|攻[打城]|讨伐|入侵|出兵/gi, actionType: 'war_attack', },
  { pattern: /刺杀|暗杀|行刺|毒杀|伏击/gi, actionType: 'assassination', },
  { pattern: /叛乱|谋反|起兵|起义|造反|哗变/gi, actionType: 'rebellion', },
  { pattern: /背叛|倒戈|投敌|出卖|叛变/gi, actionType: 'betrayal', },
  { pattern: /结盟|联盟|缔约|联合|联手|歃血/gi, actionType: 'alliance_form', },
  { pattern: /封锁|禁运|断绝贸易|关闭商路/gi, actionType: 'trade_embargo', },
  { pattern: /传播|输出|教化|同化|推广|扩散/gi, actionType: 'cultural_export', },
  { pattern: /发现|探索|开拓|揭示|发掘|探明/gi, actionType: 'discovery', },
]

/** 频率限制: 每 10 年最多 1 次 */
export const MAX_CAUSAL_PER_DECADE = 1

/** 频率限制: 每 30 年最多 2 次 */
export const MAX_CAUSAL_PER_30_YEARS = 2

/** 因果事件默认延时范围 */
export const CAUSAL_DELAY_RANGE: [number, number] = [3, 15,]

/** 因果队列最大长度 */
export const MAX_CAUSAL_QUEUE_SIZE = 20
