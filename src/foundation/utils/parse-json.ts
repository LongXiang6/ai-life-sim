/**
 * @module parse-json.ts
 * @description 安全 JSON 解析工具函数
 * @mod foundation
 */

/**
 * 安全解析 JSON 字符串，解析失败时返回 null。
 * 自动修复常见格式问题（尾逗号、中文引号等）。
 */
export function parseJSON<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    try {
      // 尝试修复常见问题
      const cleaned = text
        .replace(/，/g, ',')
        .replace(/"/g, '"')
        .replace(/"/g, '"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      return JSON.parse(cleaned) as T
    } catch {
      return null
    }
  }
}
