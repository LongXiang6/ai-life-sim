/**
 * @module constants
 * @description MOD 常量定义 —— 15种金手指模板池 + 世界观权重 + 系统面板扩展
 * @mod mod-golden-finger
 */

import type { GoldenFingerTemplate, GoldenFingerKind, } from './types'

// ========== 模板池 ==========

export const GOLDEN_FINGER_TEMPLATES: GoldenFingerTemplate[] = [
  // ===== 系统面板类（10种） =====
  {
    id: 'panel_attribute',
    kind: 'attribute_panel',
    name: '全能属性面板',
    description: '在你眼前浮现的系统面板，可查看、量化一切能力的数值化表现',
    tier: 'legendary',
    features: ['属性可视化', '他人属性查看', '属性点分配', '潜力上限揭示',],
    rules: ['每次升级解锁一个新功能模块', '属性点分配有上限',],
    persona: 'cold_machine',
    boosts: { mind: 0.15, luck: 0.10, },
    targetSubsystems: ['character-base', 'health',],
  },
  {
    id: 'panel_quest',
    kind: 'quest_system',
    name: '任务发布系统',
    description: '系统自动生成任务，完成后获得丰厚奖励',
    tier: 'rare',
    features: ['日常任务', '主线任务', '成就任务', '隐藏任务',],
    rules: ['任务失败扣除对应属性', '主线任务不可跳过',],
    persona: 'cold_machine',
    boosts: { luck: 0.10, resources: 0.10, },
    targetSubsystems: ['event-pool', 'item', 'economy',],
  },
  {
    id: 'panel_gacha',
    kind: 'gacha_wheel',
    name: '命运轮盘',
    description: '消耗运势点数进行抽奖，奖池随等级扩充',
    tier: 'uncommon',
    features: ['普通奖池', '高级奖池', '限定奖池', '保底机制',],
    rules: ['每日限抽3次', 'SSR概率=1%',],
    persona: 'chatty_comic',
    boosts: { luck: 0.15, },
    targetSubsystems: ['luck', 'item', 'achievement',],
  },
  {
    id: 'panel_checkin',
    kind: 'check_in',
    name: '签到系统',
    description: '每日签到累积天数，解锁递增奖励',
    tier: 'uncommon',
    features: ['每日签到', '连续签到奖励', '月度大奖', '年度传说宝箱',],
    rules: ['断签从第1天重新计算', '签到天数不可跨世界',],
    persona: 'cold_machine',
    boosts: { luck: 0.05, },
    targetSubsystems: ['item', 'character-base', 'economy',],
  },
  {
    id: 'panel_shop',
    kind: 'shop_panel',
    name: '天道商城',
    description: '以天道点数为货币，兑换各种超凡物品和功法',
    tier: 'rare',
    features: ['物品商城', '功法商城', '限时特卖', 'VIP等级',],
    rules: ['天道点数通过任务和签到获取', 'VIP等级决定商品品质上限',],
    persona: 'cold_machine',
    boosts: { resources: 0.15, },
    targetSubsystems: ['economy', 'item', 'personal-ability',],
  },
  {
    id: 'panel_appraisal',
    kind: 'appraisal_skill',
    name: '真理之眼',
    description: '鉴定万物：物品真伪、妖兽弱点、隐藏信息尽收眼底',
    tier: 'rare',
    features: ['物品鉴定', '弱点洞察', '隐藏信息揭示', '未来片段预览',],
    rules: ['鉴定高阶物品需消耗精神力', '鉴定结果可能被屏蔽',],
    persona: 'cold_machine',
    boosts: { mind: 0.20, },
    targetSubsystems: ['item', 'monster', 'fate-prophecy', 'world-map',],
  },
  {
    id: 'panel_achievement',
    kind: 'achievement_system',
    name: '成就殿堂',
    description: '达成条件解锁永久被动加成和称号',
    tier: 'uncommon',
    features: ['战斗成就', '修炼成就', '社交成就', '探索成就',],
    rules: ['成就加成永久生效', '特殊成就解锁隐藏称号',],
    persona: 'chatty_comic',
    boosts: { luck: 0.10, },
    targetSubsystems: ['achievement', 'reputation', 'character-base',],
  },
  {
    id: 'panel_deduction',
    kind: 'skill_deduction',
    name: '功法推演器',
    description: '自动分析、推演、升级已有技能和功法',
    tier: 'legendary',
    features: ['技能分析', '功法推演', '融合创造', '自动修炼',],
    rules: ['推演成功率随等级提升', '高深功法推演可能失败反噬',],
    persona: 'cold_machine',
    boosts: { talentAptitude: 0.20, },
    targetSubsystems: ['combat-power', 'personal-ability',],
  },
  {
    id: 'panel_management',
    kind: 'sim_management',
    name: '万象经营面板',
    description: '全景管理界面：领地、资源、人口、派系统统量化',
    tier: 'legendary',
    features: ['领地管理', '资源调度', '人口分析', '派系平衡',],
    rules: ['管理面板决策影响实际世界数据', '错误决策可能导致叛乱',],
    persona: 'cold_machine',
    boosts: { mind: 0.15, charisma: 0.10, },
    targetSubsystems: ['economy', 'settlement', 'population', 'faction-dynamics', 'natural-resource', 'industry',],
  },
  {
    id: 'panel_time',
    kind: 'time_retrospect',
    name: '因果回溯系统',
    description: '窥视时间线：过去已发生、未来将发生之事一览无余',
    tier: 'unique',
    features: ['过去回溯', '因果链分析', '未来预知', '时间锚点',],
    rules: ['每次使用消耗寿命', '不可在同一时间点连续使用',],
    persona: 'cold_machine',
    boosts: { mind: 0.20, luck: 0.10, },
    targetSubsystems: ['era', 'causal-simulation', 'fate-prophecy', 'world-timeline',],
  },

  // ===== 非面板类已移除（按流程要求，仅保留系统面板类） =====
  // cultivation_legacy, innate_ability, knowledge_awakening, bloodline_awakening, fate_contract 已删除
]

// ========== 世界观分配权重（仅系统面板类） ==========

export const WORLDVIEW_WEIGHTS: Record<string, Partial<Record<GoldenFingerKind, number>>> = {
  cultivation: {
    attribute_panel: 0.15, skill_deduction: 0.20, appraisal_skill: 0.15,
    quest_system: 0.10, achievement_system: 0.10, gacha_wheel: 0.08,
    check_in: 0.05, shop_panel: 0.05, sim_management: 0.05,
    time_retrospect: 0.07,
  },
  eastern_fantasy: {
    attribute_panel: 0.15, skill_deduction: 0.20, appraisal_skill: 0.15,
    quest_system: 0.10, achievement_system: 0.10, gacha_wheel: 0.08,
    check_in: 0.05, shop_panel: 0.05, sim_management: 0.05,
    time_retrospect: 0.07,
  },
  western_fantasy: {
    attribute_panel: 0.15, appraisal_skill: 0.20, quest_system: 0.15,
    achievement_system: 0.15, skill_deduction: 0.10, shop_panel: 0.08,
    check_in: 0.07, gacha_wheel: 0.05, sim_management: 0.05,
  },
  scifi: {
    attribute_panel: 0.25, skill_deduction: 0.20, sim_management: 0.15,
    time_retrospect: 0.10, appraisal_skill: 0.10, quest_system: 0.08,
    achievement_system: 0.05, shop_panel: 0.05, gacha_wheel: 0.02,
  },
  materialist: {
    attribute_panel: 0.25, skill_deduction: 0.20, sim_management: 0.15,
    quest_system: 0.10, achievement_system: 0.08, appraisal_skill: 0.07,
    check_in: 0.07, shop_panel: 0.05, time_retrospect: 0.03,
  },
  idealist: {
    attribute_panel: 0.20, skill_deduction: 0.15, appraisal_skill: 0.15,
    quest_system: 0.10, achievement_system: 0.10, time_retrospect: 0.10,
    gacha_wheel: 0.07, check_in: 0.05, shop_panel: 0.05,
    sim_management: 0.03,
  },
  mixed: {
    attribute_panel: 0.18, skill_deduction: 0.15, quest_system: 0.12,
    achievement_system: 0.10, appraisal_skill: 0.10, shop_panel: 0.08,
    sim_management: 0.08, gacha_wheel: 0.07, check_in: 0.07,
    time_retrospect: 0.05,
  },
  survival_horror: {
    attribute_panel: 0.25, appraisal_skill: 0.20, quest_system: 0.15,
    time_retrospect: 0.10, skill_deduction: 0.10, achievement_system: 0.08,
    sim_management: 0.05, check_in: 0.05, gacha_wheel: 0.02,
  },
  post_apocalyptic: {
    attribute_panel: 0.25, skill_deduction: 0.20, sim_management: 0.15,
    quest_system: 0.10, achievement_system: 0.10, appraisal_skill: 0.08,
    check_in: 0.05, shop_panel: 0.05, time_retrospect: 0.02,
  },
}

export const TYPE_LABELS: Record<GoldenFingerKind, string> = {
  attribute_panel: '属性面板',
  quest_system: '任务系统',
  gacha_wheel: '抽奖轮盘',
  check_in: '签到系统',
  shop_panel: '商城面板',
  appraisal_skill: '鉴定术',
  achievement_system: '成就系统',
  skill_deduction: '功法推演',
  sim_management: '模拟经营',
  time_retrospect: '时空追溯',
  cultivation_legacy: '功法传承',
  innate_ability: '先天异能',
  knowledge_awakening: '知识觉醒',
  bloodline_awakening: '血脉觉醒',
  fate_contract: '命运契约',
}

export const TIER_LABELS: Record<string, string> = {
  legendary: '传说',
  rare: '稀有',
  uncommon: '特殊',
  unique: '独一无二',
}
