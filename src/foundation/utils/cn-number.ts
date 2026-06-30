/**
 * @module cn-number.ts
 * @description 中文数字 → 阿拉伯数字 解析器
 * @mod foundation
 *
 * 递归解析中文数字字符串，支持亿/万/千/百/十 分段。
 * 复刻废弃项目 narrative-parser.ts 的 parseChineseNumber。
 *
 * 示例：
 *   parseChineseNumber("三百万")       → 3000000
 *   parseChineseNumber("约五百")       → 500
 *   parseChineseNumber("三千五百万")   → 35000000
 *   parseChineseNumber("十一")         → 11
 *   parseChineseNumber("一百二十三")   → 123
 *   parseChineseNumber("abc")          → null
 */

const CN_NUM_MAP: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100, '千': 1000, '万': 10000, '亿': 100000000,
}

/** 前缀词：约/近/大/概 */
const CN_PREFIX_RE = /^[约近大概]/

/**
 * 将中文数字字符串解析为阿拉伯数字
 *
 * @param s - 中文数字字符串（如"三百万"、"一百二十三"）
 * @returns 解析结果，无法识别时返回 null
 */
export function parseChineseNumber(s: string): number | null {
  if (!s || s.trim().length === 0) return null
  // 去除前缀
  const text = s.trim().replace(CN_PREFIX_RE, '')
  // 如果已经是纯数字，直接返回
  const pureNum = Number(text)
  if (!isNaN(pureNum) && text.length > 0 && /^\d+$/.test(text)) return pureNum
  // 递归解析
  const result = parseCnNumRecursive(text)
  return result !== null ? result : null
}

/**
 * 递归解析中文数字（内部函数）
 * 处理顺序：亿 → 万 → 千 → 百 → 十 → 个位
 */
function parseCnNumRecursive(s: string): number | null {
  if (s.length === 0) return 0

  // 亿/万 分段（最高优先级）
  for (const seg of ['亿', '万'] as const) {
    const idx = s.indexOf(seg)
    if (idx >= 0) {
      const prefix = parseCnNumRecursive(s.slice(0, idx))
      const suffix = parseCnNumRecursive(s.slice(idx + 1))
      if (prefix === null) return null
      return prefix * CN_NUM_MAP[seg] + (suffix ?? 0) // 后缀缺失时视为 0，如"三万"=30000
    }
  }

  // 十/百/千 处理
  let result = 0
  let current = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '十') {
      result += (current || 1) * 10
      current = 0
    } else if (ch === '百') {
      result += (current || 1) * 100
      current = 0
    } else if (ch === '千') {
      result += (current || 1) * 1000
      current = 0
    } else if (CN_NUM_MAP[ch] !== undefined && CN_NUM_MAP[ch] < 10) {
      current = CN_NUM_MAP[ch]
    } else {
      return null // 无法识别的字符
    }
  }
  return result + current
}
