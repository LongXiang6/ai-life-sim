/**
 * @module utils.ts
 * @description mod-tech-level 工具函数（统一提升自 foundation）
 * @mod mod-tech-level
 */

export { ROUND_DECIMALS, round, clampNumber, pickRandom } from '@/foundation'

/** 计算数值数组平均值 */
export function computeAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** 区间随机取整 */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
