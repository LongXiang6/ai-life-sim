/**
 * @module format-number.ts
 * @description 数字格式化工具函数
 * @mod foundation
 */

/**
 * 数字千分位格式化
 *
 * @param n - 要格式化的数字
 * @returns 格式化后的字符串（zh-CN 千分位）
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

/**
 * 数字限制在 [min, max] 范围内
 *
 * @param value - 输入值
 * @param min - 下限
 * @param max - 上限
 * @returns 限制后的值
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
