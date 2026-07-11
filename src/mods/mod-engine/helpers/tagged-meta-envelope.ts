/**
 * @module tagged-meta-envelope.ts
 * @description AI 叙事标签信封容错提取 —— 恢复常见漏标签与误闭合输出
 * @mod mod-engine
 */

export interface TaggedMetaEnvelope {
  narrative: string
  metaJson: string
}

interface MarkerMatch {
  index: number
  length: number
}

function findMarker(content: string, pattern: RegExp, fromIndex = 0): MarkerMatch | null {
  const source = content.slice(fromIndex)
  const match = pattern.exec(source)
  if (!match || match.index < 0) return null
  return { index: fromIndex + match.index, length: match[0].length }
}

/** 按 JSON 字符串/转义规则寻找首个闭合对象，避免字符串中的花括号破坏深度。 */
function extractBalancedJsonObject(source: string): string | null {
  const start = source.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i++) {
    const char = source[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, i + 1)
      }
    }
  }

  return null
}

/**
 * 提取 `[NARRATIVE]` + `[META]` 信封。
 *
 * 容忍：
 * - 第二个 `[NARRATIVE]` 被误写成正文结束标签；
 * - 缺少 `[/NARRATIVE]`，由 `[META]` 直接终止正文；
 * - 缺少 `[/META]`，但 META 内首个 JSON 对象结构完整。
 */
export function extractTaggedMetaEnvelope(content: string): TaggedMetaEnvelope | null {
  const narrativeOpen = findMarker(content, /\[NARRATIVE\]/i)
  if (!narrativeOpen) return null

  const narrativeStart = narrativeOpen.index + narrativeOpen.length
  const metaOpen = findMarker(content, /\[META\]/i, narrativeStart)
  if (!metaOpen) return null

  const narrativeClose = findMarker(content, /\[\/NARRATIVE\]/i, narrativeStart)
  const duplicatedNarrativeOpen = findMarker(content, /\[NARRATIVE\]/i, narrativeStart)
  const narrativeEndCandidates = [
    narrativeClose?.index,
    duplicatedNarrativeOpen?.index,
    metaOpen.index,
  ].filter((value): value is number => typeof value === 'number' && value >= narrativeStart)
  const narrativeEnd = Math.min(...narrativeEndCandidates)
  const narrative = content.slice(narrativeStart, narrativeEnd).trim()
  if (!narrative) return null

  const metaStart = metaOpen.index + metaOpen.length
  const metaClose = findMarker(content, /\[\/META\]/i, metaStart)
  const metaSection = content.slice(metaStart, metaClose?.index ?? content.length).trim()
  const metaJson = extractBalancedJsonObject(metaSection)
  if (!metaJson) return null

  return { narrative, metaJson }
}
