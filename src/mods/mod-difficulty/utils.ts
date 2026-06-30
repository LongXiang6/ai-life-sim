/**
 * @module utils
 * @description mod-difficulty 工具函数
 * @mod mod-difficulty
 */

import type { DifficultyConfig } from './types'

/**
 * 根据难度获取压制后的能力值
 * @param rawValue 原始能力值
 * @param maxValue 能力最大值（基准线）
 * @param config 当前难度配置
 * @returns 压制后的能力值
 */
export function applyCeilingSuppress(
  rawValue: number,
  maxValue: number,
  config: DifficultyConfig,
): number {
  if (!config.ceilingSuppress || maxValue <= 0) return rawValue
  const ratio = rawValue / maxValue
  if (ratio > config.suppressThreshold) {
    return maxValue * config.suppressThreshold
  }
  return rawValue
}
