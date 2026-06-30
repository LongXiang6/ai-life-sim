/**
 * @module extract-dynamic-attrs.ts
 * @description 从叙事文本中提取动态属性变化（8 正则模式 + 中文数字解析）
 * @mod foundation
 *
 * 复刻废弃项目 narrative-parser.ts 的 extractDynamicAttrsFromNarrative。
 * 当 AI JSON 未显式声明数值变化时，各子系统可调用此函数从叙事描述中补偿提取。
 *
 * 用法：
 *   const extracted = extractDynamicAttrsFromNarrative(narrative, {
 *     '人口': 'population',
 *     '居民': 'population',
 *   })
 *   // → { population: 3000000 }
 */

import { parseChineseNumber } from './cn-number'

/** 标签→字段 key 映射表 */
export type AttrTagMap = Record<string, string>

/** 提取结果：字段 key → 变化值 */
export type ExtractedAttrs = Record<string, number>

/**
 * 从叙事文本中提取动态属性变化
 *
 * 8 个正则模式（4 增加 + 3 减少 + 1 符号）：
 *   增加模式：
 *     1. {标签} 增加 {数值}          → "人口 增加 三百万"
 *     2. {标签}：{数值}               → "人口：3000000"
 *     3. 增加 {数值} {标签}           → "增加 三百万 人口"
 *     4. 增加 {数值} {标签首字}        → "增加 三百万 人"
 *   减少模式（同上反向）
 *     5. {标签} 减少 {数值}
 *     6. 减少 {数值} {标签}
 *     7. 减少 {数值} {标签首字}
 *   符号模式：
 *     8. {标签} +/-{数值}             → "人口 +3000000"
 *
 * @param narrative - 叙事文本
 * @param tagMap - 标签→字段 key 映射表
 * @returns 提取的属性变化键值对，无匹配时返回 null
 */
export function extractDynamicAttrsFromNarrative(
  narrative: string,
  tagMap: AttrTagMap,
): ExtractedAttrs | null {
  const result: ExtractedAttrs = {}
  let found = false

  const tags = Object.keys(tagMap)
  if (tags.length === 0) return null

  // 构建标签正则（按长度降序排列，优先匹配长标签）
  const sortedTags = [...tags].sort((a, b) => b.length - a.length)
  const tagPattern = sortedTags.map(escapeRegex).join('|')
  const tagFirstChars = [...new Set(sortedTags.map((t) => t[0]))].map(escapeRegex).join('|')

  // ============================================================
  // 模式 1：{标签} +增加/减少 +{数值}
  // ============================================================
  const incDecRe = new RegExp(
    `(${tagPattern})\\s*(增加|提升|增长|上升|暴涨|减少|下降|降低|衰退|损失|跌落|削弱)\\s*([\\u4e00-\\u9fff\\d]+)`,
    'g'
  )
  let m: RegExpExecArray | null
  while ((m = incDecRe.exec(narrative)) !== null) {
    const key = tagMap[m[1]]
    if (!key) continue
    const isDecrease = /减少|下降|降低|衰退|损失|跌落|削弱/.test(m[2])
    const num = parseCnOrNum(m[3])
    if (num !== null) {
      result[key] = (result[key] ?? 0) + (isDecrease ? -num : num)
      found = true
    }
  }

  // ============================================================
  // 模式 2：{标签}：{数值}
  // ============================================================
  const colonRe = new RegExp(`(${tagPattern})\\s*[：:]\\s*([+-]?\\d+(?:\\.\\d+)?)`, 'g')
  while ((m = colonRe.exec(narrative)) !== null) {
    const key = tagMap[m[1]]
    if (!key) continue
    const num = parseFloat(m[2])
    if (!isNaN(num)) {
      result[key] = (result[key] ?? 0) + num
      found = true
    }
  }

  // ============================================================
  // 模式 3：增加/减少 +{数值} +{标签}
  // ============================================================
  const incDecBeforeRe = new RegExp(
    `(增加|提升|增长|上升|暴涨|减少|下降|降低|衰退|损失|跌落|削弱)\\s*([\\u4e00-\\u9fff\\d]+)\\s*(${tagPattern})`,
    'g'
  )
  while ((m = incDecBeforeRe.exec(narrative)) !== null) {
    const key = tagMap[m[3]]
    if (!key) continue
    const isDecrease = /减少|下降|降低|衰退|损失|跌落|削弱/.test(m[1])
    const num = parseCnOrNum(m[2])
    if (num !== null) {
      result[key] = (result[key] ?? 0) + (isDecrease ? -num : num)
      found = true
    }
  }

  // ============================================================
  // 模式 4：增加/减少 +{数值} +{标签首字}
  // ============================================================
  const incDecFirstCharRe = new RegExp(
    `(增加|提升|增长|上升|暴涨|减少|下降|降低|衰退|损失|跌落|削弱)\\s*([\\u4e00-\\u9fff\\d]+)\\s*([${tagFirstChars}])`,
    'g'
  )
  while ((m = incDecFirstCharRe.exec(narrative)) !== null) {
    const firstChar = m[3]
    // 查找首字匹配的标签
    for (const tag of sortedTags) {
      if (tag[0] === firstChar && tagMap[tag]) {
        const key = tagMap[tag]
        const isDecrease = /减少|下降|降低|衰退|损失|跌落|削弱/.test(m[1])
        const num = parseCnOrNum(m[2])
        if (num !== null) {
          result[key] = (result[key] ?? 0) + (isDecrease ? -num : num)
          found = true
        }
        break
      }
    }
  }

  // ============================================================
  // 模式 8：{标签} +/-{数值}（符号模式）
  // ============================================================
  const signRe = new RegExp(`(${tagPattern})\\s*([+-]\\d+(?:\\.\\d+)?)`, 'g')
  while ((m = signRe.exec(narrative)) !== null) {
    const key = tagMap[m[1]]
    if (!key) continue
    const num = parseFloat(m[2])
    if (!isNaN(num)) {
      result[key] = (result[key] ?? 0) + num
      found = true
    }
  }

  return found ? result : null
}

// ============================================================
// 内部工具
// ============================================================

/** 解析中文数字或纯数字 */
function parseCnOrNum(s: string): number | null {
  // 先尝试纯数字
  const pureNum = Number(s)
  if (!isNaN(pureNum) && /^\d+$/.test(s.trim())) return pureNum
  // 再尝试中文数字
  return parseChineseNumber(s)
}

/** 转义正则特殊字符 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
