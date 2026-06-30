/**
 * @module utils.ts
 * @description mod-environment-ecology 工具函数（统一提升自 foundation）
 * @mod mod-environment-ecology
 */

import type { PollutionLevel } from './types'
import { POLLUTION_LEVEL_THRESHOLDS } from './constants'

export { ROUND_DECIMALS, round, clamp, pickRandom } from '@/foundation'

/** 返回 min~max（含）之间的随机整数
 * @param min 最小值（含）
 * @param max 最大值（含）
 * @returns 随机整数
 */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 获取污染等级（按数值映射）
 * @param value 污染数值
 * @returns 污染等级（1-5）
 */
export function getPollutionLevel(value: number): PollutionLevel {
  for (const t of POLLUTION_LEVEL_THRESHOLDS) {
    if (value < t.max) return t.level
  }
  return 5
}
