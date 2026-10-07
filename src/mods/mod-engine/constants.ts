/**
 * Purpose: Define stable engine calendar, narrative, and runtime defaults.
 * Owner: mod-engine
 * Responsibility: Shared constants only; business state and AI decisions remain in their owning systems.
 *
 * @module constants.ts
 * @description 引擎常量 —— 365天历法常量、默认配置
 * @mod mod-engine
 *
 * 历法：12月 真实公历分布（31/28/31/30/31/30/31/31/30/31/30/31） = 365天
 */

import type { EngineConfig, } from './types'
import {
  BASE_POINTS_PER_YEAR,
  CALENDAR_DAYS_PER_YEAR,
} from '@/foundation'

/** 历法常量 */
export const CALENDAR = {
  /** 每年正常天数 */
  DAYS_PER_YEAR: CALENDAR_DAYS_PER_YEAR,
  /** 每年基础点投影，用于兼容现有业务子系统的数值时间接口。 */
  BASE_POINTS_PER_YEAR,
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
  timeStep: { unit: 'month', value: 1 },
  temperature: 0.8,
}

// ============================================================
// Phase 6：KV / 压缩 / Prompt 特性开关（定义于 core，此处 re-export）
// ============================================================

export {
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

/**
 * 主故事 Prompt 保留的最近完整故事轮数；更早内容读取事实与压缩派生记忆。
 */
export const RECENT_NARRATIVE_WINDOW = 3
