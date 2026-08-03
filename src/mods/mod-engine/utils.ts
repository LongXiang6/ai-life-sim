/**
 * @module utils.ts
 * @description 引擎工具函数
 * @mod mod-engine
 */

import { CALENDAR, SEASON_NAMES } from './constants'
import { getSeasonForMonth } from './helpers/calendar-season.js'

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
