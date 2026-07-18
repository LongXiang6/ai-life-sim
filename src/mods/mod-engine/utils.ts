/**
 * @module utils.ts
 * @description 引擎工具函数
 * @mod mod-engine
 */

import { CALENDAR, SEASON_NAMES } from './constants'
import { getSeasonForMonth } from './helpers/calendar-season.js'
import {
  MIN_SUMMARY_TOKENS,
  SUMMARY_CHARS_DEFAULT,
  SUMMARY_L2_MIN_TOKENS,
  SUMMARY_L3_MIN_TOKENS,
  SUMMARY_L4_MIN_TOKENS,
  SUMMARY_L5_MIN_TOKENS,
  SUMMARY_L6_MIN_TOKENS,
} from './constants'

import { estimateTokenBudget as foundationEstimateTokenBudget } from '@/foundation'

import type { RoundInfo, TimeStep } from './types'

/**
 * 格式化回合信息为可读字符串
 */
export function formatRound(round: RoundInfo): string {
  const season = SEASON_NAMES[getSeasonForMonth(round.month)] ?? '?'
  return `第${round.year}年 ${season}季 第${round.month + 1}月 第${round.day + 1}日`
}

/**
 * 计算两个回合之间的天数差
 */
export function daysBetween(a: RoundInfo, b: RoundInfo): number {
  const aTotal = (a.year - 1) * CALENDAR.DAYS_PER_YEAR + a.dayOfYear
  const bTotal = (b.year - 1) * CALENDAR.DAYS_PER_YEAR + b.dayOfYear
  return Math.abs(bTotal - aTotal)
}

/**
 * 获取时间步长的显示名称
 */
export function timeStepLabel(step: TimeStep): string {
  return { year: '年', season: '季', month: '月', day: '日' }[step.unit]
}

// ---- Summary Compressor Token 计算函数 ----

// ===================================================================
// 通用 Token 估算（标准量 + 20% 冗余）
// ===================================================================

/**
 * 估算文本的 token 消耗量
 *
 * 算法:
 * - 中文字符（含中文标点 ，。！？）：~1.5 字符/token
 * - 英文/ASCII/空白/其他：~4 字符/token
 *
 * 覆盖所有字符类型（标点、换行、空格），不遗漏。
 */
export function estimateTokens(text: string): number {
  let cjkChars = 0
  let otherChars = 0
  for (const ch of text) {
    // Unicode 范围: CJK统一汉字 + CJK扩展A + CJK兼容汉字 + CJK标点 + 全角标点
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      cjkChars++
    } else {
      otherChars++
    }
  }
  return Math.ceil(cjkChars / 1.5 + otherChars / 4)
}

/**
 * 根据 prompt 内容计算合理的 maxTokens（标准输出量 × 冗余系数，无输出上限）
 *
 * @deprecated 实现已迁至 foundation；保留 re-export 兼容 mod-engine 公共 API
 */
export function estimateTokenBudget(
  systemPrompt: string,
  userPrompt: string,
  estimatedOutputTokens: number,
  minTokens = 512,
): number {
  return foundationEstimateTokenBudget(systemPrompt, userPrompt, estimatedOutputTokens, minTokens)
}

/**
 * @deprecated 不再对 maxTokens 做封顶；原样返回，保留 API 兼容
 */
export function clampMaxTokens(maxTokens: number, _contextWindow?: number): number {
  return maxTokens
}

/**
 * 计算 L1 摘要 token 预算
 * 公式: max(eventsNarrativeLength × 2.4, MIN_SUMMARY_TOKENS)，无上限
 */
export function computeSummaryTokenBudget(eventsNarrativeLength: number): number {
  return Math.max(MIN_SUMMARY_TOKENS, Math.round(eventsNarrativeLength * 2.4))
}

/**
 * 将 token 预算转换为字符数限制
 * 公式: max(floor(tokenBudget / 1.5), 3000)
 */
export function computeSummaryCharLimit(tokenBudget: number): number {
  return Math.max(Math.floor(tokenBudget / 1.5), SUMMARY_CHARS_DEFAULT)
}

/**
 * 计算 L2 合并 token 预算
 * 公式: max(ceil(inputTextLength / 2), 1000)
 */
export function computeSummaryL2Tokens(inputTextLength: number): number {
  return Math.max(Math.ceil(inputTextLength / 2), SUMMARY_L2_MIN_TOKENS)
}

/**
 * 计算 L3 合并 token 预算
 * 公式: max(ceil(inputTextLength / 4), 1200)
 */
export function computeSummaryL3Tokens(inputTextLength: number): number {
  return Math.max(Math.ceil(inputTextLength / 4), SUMMARY_L3_MIN_TOKENS)
}

/**
 * 计算 L4 合并 token 预算
 * 公式: max(ceil(inputTextLength / 8), 1500)
 */
export function computeSummaryL4Tokens(inputTextLength: number): number {
  return Math.max(Math.ceil(inputTextLength / 8), SUMMARY_L4_MIN_TOKENS)
}

/**
 * 计算 L5 合并 token 预算
 * 公式: max(ceil(inputTextLength / 10), 1800)
 */
export function computeSummaryL5Tokens(inputTextLength: number): number {
  return Math.max(Math.ceil(inputTextLength / 10), SUMMARY_L5_MIN_TOKENS)
}

/**
 * 计算 L6 合并 token 预算
 * 公式: max(ceil(inputTextLength / 12), 2000)
 */
export function computeSummaryL6Tokens(inputTextLength: number): number {
  return Math.max(Math.ceil(inputTextLength / 12), SUMMARY_L6_MIN_TOKENS)
}
