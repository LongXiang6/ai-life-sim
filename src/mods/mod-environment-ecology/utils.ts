/**
 * @module utils.ts
 * @description mod-environment-ecology 工具函数（统一提升自 foundation）
 * @mod mod-environment-ecology
 */

import type { PollutionLevel } from './types'
import { POLLUTION_LEVEL_THRESHOLDS } from './constants'

export { ROUND_DECIMALS, round, clamp, pickRandom } from '@/foundation'
// randomInt 已统一到 shared/common-utils.ts，避免各 MOD 重复定义（B-45 要求）
export { randomInt } from '@/core/shared'

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
