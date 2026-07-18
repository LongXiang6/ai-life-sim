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
  USE_LEGACY_SEGMENTED_PROMPT,
  USE_AI_SUMMARY_COMPRESSION,
  KV_TWO_USER_SEGMENTS,
  OMIT_EMPTY_PROMPT_FIELDS,
  DEDUP_NARRATIVE_HISTORY,
  KV_MESSAGE_STRATEGY,
  BRIDGE_SUMMARY_MIN_TICKS,
  KV_CONVERSATION_WINDOW,
  EXPERIMENTAL_TIME_STEPS_UI,
} from '@/core/ai-service/prompt-flags'
export type { KVMessageStrategy } from '@/core/ai-service/prompt-flags'

/**
 * 沉浸模式（Two-pass API）开关 —— 蓝图 F5，默认关闭
 * true 时：先注入记忆做理解，再生成叙事（成本约 2×）
 */
export const IMMERSION_TWO_PASS_ENABLED = false

// ============================================================
// 时间步进配置（E12 对齐废弃项目 9 档）
// ============================================================

/** 可用时间步长列表（从细到粗） */
export { AVAILABLE_TIME_STEPS } from '@/foundation/constants/time-steps'

/** 叙事历史最大保留条数（超出后移除最旧条目，压缩先于删除） */
export const MAX_NARRATIVE_HISTORY = 200

/**
 * 角色原创设定（characterCreations）最大保留条数。
 * 该数组会被完整注入每轮 prompt 的稳定段，必须设上限以防内存膨胀与 prompt 撑爆。
 * 超出时移除最早确认的条目（保留最近创造的设定）。
 */
export const MAX_CHARACTER_CREATIONS = 80

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

/** 每个摘要块包含的轮次数 */
export const SUMMARY_INTERVAL = 10

/** L1 在目标块的第 1 轮触发（落后 2 块 = 保留最近约 20 轮原文） */
export const COMPRESS_L1_DELAY_ROUNDS = 1

/**
 * 主叙事 Prompt 保留的最近完整原文轮数。
 *
 * L1 延迟一个完整块后才生成摘要，因此窗口必须覆盖“当前块 + 延迟块”
 * 的未压缩区间；否则会在新 L1 形成前把中间几轮从 Prompt 中漏掉。
 */
export const RECENT_NARRATIVE_WINDOW = SUMMARY_INTERVAL * (COMPRESS_L1_DELAY_ROUNDS + 1)

/** 合并 N 个 L1 摘要为一个 L2 摘要 */
export const COMPRESS_L2_MERGE_COUNT = 5

/** L2 压缩在 blockRound >= 2 时触发 */
export const COMPRESS_L2_DELAY_ROUNDS = 2

/** 合并 N 个 L2 摘要为一个 L3 摘要 */
export const COMPRESS_L3_MERGE_COUNT = 5

/** L3 压缩在 blockRound >= 2 时触发 */
export const COMPRESS_L3_DELAY_ROUNDS = 2

/** 合并 N 个 L3 骨架为一个 L4 纪元（定义但 L4 复用 L3 常量） */
export const COMPRESS_L4_MERGE_COUNT = 5

/** L2 合并区间 = SUMMARY_INTERVAL × COMPRESS_L2_MERGE_COUNT */
export const COMPRESS_L2_MERGE_INTERVAL = 50

/** L3 合并区间 = COMPRESS_L2_MERGE_INTERVAL × COMPRESS_L3_MERGE_COUNT */
export const COMPRESS_L3_MERGE_INTERVAL = 250

/** L4 合并区间 = COMPRESS_L3_MERGE_INTERVAL × COMPRESS_L4_MERGE_COUNT */
export const COMPRESS_L4_MERGE_INTERVAL = 1250

/** 合并 N 个 L4 纪元为一个 L5 时代 */
export const COMPRESS_L5_MERGE_COUNT = 5

/** L5 压缩在 blockRound >= 2 时触发 */
export const COMPRESS_L5_DELAY_ROUNDS = 2

/** L5 合并区间 = COMPRESS_L4_MERGE_INTERVAL × COMPRESS_L5_MERGE_COUNT */
export const COMPRESS_L5_MERGE_INTERVAL = 6250

/** 合并 N 个 L5 时代为一个 L6 历史 */
export const COMPRESS_L6_MERGE_COUNT = 5

/** L6 压缩在 blockRound >= 2 时触发 */
export const COMPRESS_L6_DELAY_ROUNDS = 2

/** L6 合并区间 = COMPRESS_L5_MERGE_INTERVAL × COMPRESS_L6_MERGE_COUNT = 31250轮 */
export const COMPRESS_L6_MERGE_INTERVAL = 31250

// ---- Token / 字数计算常量 ----

/** 摘要 token 预算下限（仅保底，无上限） */
export const MIN_SUMMARY_TOKENS = 3600

/** @deprecated 摘要预算不再封顶；保留常量兼容旧引用 */
export const MAX_SUMMARY_TOKENS = Number.MAX_SAFE_INTEGER

/** 摘要字符数默认保底 */
export const SUMMARY_CHARS_DEFAULT = 3000

/** L2 合并 token 保底 */
export const SUMMARY_L2_MIN_TOKENS = 1000

/** L3 合并 token 保底 */
export const SUMMARY_L3_MIN_TOKENS = 1200

/** L4 合并 token 保底 */
export const SUMMARY_L4_MIN_TOKENS = 1500

/** L5 合并 token 保底 */
export const SUMMARY_L5_MIN_TOKENS = 1800

/** L6 合并 token 保底 */
export const SUMMARY_L6_MIN_TOKENS = 2000
