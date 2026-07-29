/**
 * @module constants.ts
 * @description 引擎常量 —— 365天历法常量、默认配置
 * @mod mod-engine
 *
 * 历法：12月 真实公历分布（31/28/31/30/31/30/31/31/30/31/30/31） = 365天
 */

import type { EngineConfig, } from './types'

/** 历法常量 */
export const CALENDAR = {
  /** 每年正常天数 */
  DAYS_PER_YEAR: 365,
  /** 每年月数 */
  MONTHS_PER_YEAR: 12,
  /** 每月天数（1月~12月，真实公历分布，2月28天） */
  DAYS_IN_MONTH: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as readonly number[],
  /** 每季月数 */
  MONTHS_PER_SEASON: 3,
  /** 每年季节数 */
  SEASONS_PER_YEAR: 4,
} as const

/** 季节常量 */
export const SEASONS = {
  SPRING: 0,
  SUMMER: 1,
  AUTUMN: 2,
  WINTER: 3,
} as const

/** 季节名称 */
export const SEASON_NAMES = ['春', '夏', '秋', '冬',] as const

/** 按阳历月份返回季节索引；实现位于无副作用的日历 helper。 */
export { getSeasonForMonth } from './helpers/calendar-season.js'

/** 中文月名（来自废案 calendar.ts 的 MONTH_LABELS）
 *  正月/杏月/桃月/槐月/榴月/荷月/兰月/桂月/菊月/露月/冬月/腊月 */
export const MONTH_ZH = [
  '正月', '杏月', '桃月', '槐月', '榴月', '荷月',
  '兰月', '桂月', '菊月', '露月', '冬月', '腊月',
] as const

// ============================================================
// 纪元 / 年号系统常量
// ============================================================

/**
 * 纪元时间线（无限世代，每 1000 年一个纪元）
 * 预置 30 个纪元名称循环使用，确保时间线可以无限延伸
 */
export const ERA_SPAN = 1000

const ERA_NAME_POOL = [
  '创世纪元', '神话纪元', '英雄纪元', '诸神纪元', '星海纪元',
  '永恒纪元', '龙腾纪元', '天启纪元', '混沌纪元', '辉煌纪元',
  '暗影纪元', '黎明纪元', '黄金纪元', '白银纪元', '青铜纪元',
  '黑铁纪元', '紫微纪元', '太初纪元', '洪荒纪元', '封神纪元',
  '剑道纪元', '万法纪元', '天元纪元', '归墟纪元', '涅槃纪元',
  '轮回纪元', '彼岸纪元', '无界纪元', '终焉纪元', '新生纪元',
] as const

export { ERA_NAME_POOL }

/** 年号列表（34 个，按时间顺序排列） */
export const REIGN_TITLES = [
  '建武', '永和', '太初', '元康', '景明', '大通', '乾元', '天圣',
  '嘉佑', '熙宁', '元丰', '崇宁', '大观', '政和', '宣和', '靖康',
  '建炎', '绍兴', '隆兴', '乾道', '淳熙', '绍熙', '庆元', '嘉泰',
  '开禧', '嘉定', '宝庆', '绍定', '端平', '嘉熙', '淳佑', '宝佑',
  '开庆', '景定',
] as const

/** 年号切换间隔（年），约 30-50 年范围 */
export const REIGN_DURATION = 40

/** 默认引擎配置 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  model: 'deepseek-chat',
  timeStep: { unit: 'year', value: 1, },
  maxRounds: 1000,
  temperature: 0.8,
  maxTokens: 4096,
}

// ============================================================
// Phase 6：KV / 压缩 / Prompt 特性开关（定义于 core，此处 re-export）
// ============================================================

export {
  USE_AI_SUMMARY_COMPRESSION,
  OMIT_EMPTY_PROMPT_FIELDS,
  BRIDGE_SUMMARY_MIN_TICKS,
  EXPERIMENTAL_TIME_STEPS_UI,
} from '@/core/ai-service/prompt-flags'

// ============================================================
// 时间步进配置（E12 对齐废弃项目 9 档）
// ============================================================

/** 可用时间步长列表（从细到粗） */
export { AVAILABLE_TIME_STEPS } from '@/foundation/constants/time-steps'

/** 存储键（规范格式：{mod}:{category}:{key}） */
export const STORAGE_KEYS = {
  ENGINE_CONFIG: 'mod-engine:config:main',
  ENGINE_STATE: 'mod-engine:save:state',
  NARRATIVE_HISTORY: 'mod-engine:save:narrative',
} as const

// ============================================================
// Summary Compressor 压缩系统常量
// 来源: summary-compressor-spec.md §6 依赖的配置常量
// ============================================================

/** 每个 L1 摘要块包含 4 轮完整叙事。 */
export const SUMMARY_INTERVAL = 4

/** L1 延迟一个完整块：完成第 8 轮后才压缩 1~4 轮，供第 9 轮使用。 */
export const COMPRESS_L1_DELAY_BLOCKS = 1

/**
 * 主叙事 Prompt 保留的最近事实投影轮数。
 *
 * 最近 4 轮从摘要账本投影结构化事实；完整正文只在叙事历史、反馈和归档中保留。
 */
export const RECENT_NARRATIVE_WINDOW = SUMMARY_INTERVAL

/** 每个高层节点固定合并 4 个直接子节点。 */
export const SUMMARY_LEVEL_MULTIPLIER = 4

/** 合并 4 个 L1 为一个 L2（16轮）。 */
export const COMPRESS_L2_MERGE_COUNT = SUMMARY_LEVEL_MULTIPLIER

/** 合并 4 个 L2 为一个 L3（64轮）。 */
export const COMPRESS_L3_MERGE_COUNT = SUMMARY_LEVEL_MULTIPLIER

/** L2 合并区间 = SUMMARY_INTERVAL × COMPRESS_L2_MERGE_COUNT */
export const COMPRESS_L2_MERGE_INTERVAL = SUMMARY_INTERVAL * COMPRESS_L2_MERGE_COUNT

/** L3 合并区间 = COMPRESS_L2_MERGE_INTERVAL × COMPRESS_L3_MERGE_COUNT */
export const COMPRESS_L3_MERGE_INTERVAL = COMPRESS_L2_MERGE_INTERVAL * COMPRESS_L3_MERGE_COUNT

// ---- Token / 字数计算常量 ----

/** 摘要 token 预算下限（仅保底，无上限） */
export const MIN_SUMMARY_TOKENS = 3600

/** @deprecated 摘要预算不再封顶；保留常量兼容旧引用 */
export const MAX_SUMMARY_TOKENS = Number.MAX_SAFE_INTEGER

/** L2 合并 token 保底 */
export const SUMMARY_L2_MIN_TOKENS = 1000

/** L3 合并 token 保底 */
export const SUMMARY_L3_MIN_TOKENS = 1200
