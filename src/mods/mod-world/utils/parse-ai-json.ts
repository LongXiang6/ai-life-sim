/**
 * @module parse-ai-json.ts
 * @description AI 返回 JSON 解析工具 —— 多层容错：清洗 → 通用解析 → 正则提取 → 截断修复 → 对象重组
 * @mod mod-world
 *
 * 解析链：foundation/parseJSON（通用格式修复）→ AI 专属容错（markdown/嵌套/截断）
 *
 * 解决 AI 返回 JSON 的常见问题：
 * 1. markdown 代码块包裹
 * 2. 中文标点 / 尾逗号等格式问题（委托 foundation/parseJSON）
 * 3. 截断/不完整 JSON（token 限制）
 * 4. 嵌套数组被非贪心正则误匹配
 */

import { parseJSON } from '@/foundation'
import { clamp } from '@/core/shared'

/**
 * 解析 AI 返回的 JSON 字符串，含多层容错
 *
 * 容错链：
 * 1. 清洗 markdown ```json / ``` 包裹
 * 2. foundation/parseJSON（中文标点、尾逗号等通用格式修复）
 * 3. 贪心正则提取（正确匹配嵌套数组/对象）
 * 4. 截断修复（补齐未闭合的括号）
 * 5. 数组模式：提取所有完整对象重组
 *
 * @returns 解析成功返回对象，失败返回 null
 */
export function parseAIJSON<T = unknown>(raw: string): T | null {
  if (!raw || raw.trim() === '') return null

  // ----- Step 1: 清洗 markdown 代码块 -----
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  if (!cleaned) return null

  // ----- Step 2: foundation/parseJSON（通用格式修复：中文标点、尾逗号等）-----
  const generalResult = parseJSON<T>(cleaned)
  if (generalResult !== null) return generalResult

  // ----- Step 3: 贪心正则提取 -----
  // 贪心匹配能正确处理嵌套的 [] 和 {}
  // 之前用非贪心 /\[[\s\S]*?\]/ 会把内层数组（如 chainEffects）误当外层
  const isArray = cleaned.startsWith('[')
  const pattern = isArray ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/
  const greedyMatch = raw.match(pattern)?.[0]
  if (greedyMatch) {
    const result = parseJSON<T>(greedyMatch)
    if (result !== null) return result
  }

  // ----- Step 4: 截断修复 -----
  const repaired = repairTruncatedJSON(raw, isArray)
  if (repaired) {
    const result = parseJSON<T>(repaired)
    if (result !== null) return result
  }

  // ----- Step 5: 数组模式 - 提取完整对象重组 -----
  if (isArray) {
    const objects = extractCompleteObjects(raw)
    if (objects.length > 0) {
      const result = parseJSON<T>(`[${objects.join(',')}]`)
      if (result !== null) return result
    }
  }

  return null
}

// ========== 内部工具 ==========

/**
 * 从截断的 JSON 字符串中提取所有完整的顶级对象 `{...}`
 * 通过追踪括号深度，跳过字符串内括号
 */
function extractCompleteObjects(raw: string): string[] {
  const objects: string[] = []
  let depth = 0
  let inString = false
  let escapeNext = false
  let objStart = -1

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (ch === '\\') {
      escapeNext = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objStart >= 0) {
        objects.push(raw.substring(objStart, i + 1))
        objStart = -1
      }
    }
  }

  return objects
}

/**
 * 尝试修复截断的 JSON
 * - 数组：找到最后一个完整对象，丢弃不完整的，补上 ]
 * - 对象：统计未闭合括号，补齐 }
 */
function repairTruncatedJSON(raw: string, isArray: boolean): string | null {
  if (isArray) {
    // 数组模式：提取完整对象重组
    const objects = extractCompleteObjects(raw)
    if (objects.length > 0) {
      return `[${objects.join(',')}]`
    }
    return null
  }

  // 对象模式：统计括号深度，补齐未闭合的
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (ch === '\\') {
      escapeNext = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') depth = clamp(depth - 1, 0, Infinity)
  }

  if (depth <= 0) return null

  // 补齐闭合括号
  const needsBraces = depth
  const closed = raw + '}'.repeat(needsBraces)
  return closed
}
