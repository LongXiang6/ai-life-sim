/**
 * @module cn.ts
 * @description className 合并工具函数
 * @mod foundation
 */

/**
 * 合并多个 className 字符串，过滤空值，用空格连接。
 *
 * @param classes - 要合并的类名列表，支持 false/null/undefined 过滤
 * @returns 合并后的 className 字符串
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
