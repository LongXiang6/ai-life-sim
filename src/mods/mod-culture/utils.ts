/**
 * @module utils.ts
 * @description mod-culture 工具函数
 * @mod mod-culture
 */

export { ROUND_DECIMALS, round, clamp, pickRandom } from '@/foundation'

/** 返回 min~max（含）之间的随机整数
 * @param min 最小值（含）
 * @param max 最大值（含）
 * @returns 随机整数
 */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
