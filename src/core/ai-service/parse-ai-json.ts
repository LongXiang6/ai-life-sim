/**
 * Purpose: Parse AI JSON values with bounded, high-compatibility syntax recovery.
 * Owner: core / ai-service
 * Responsibility: JSON extraction and syntax recovery only; business schemas own field validation.
 */

interface JsonSpanScan {
  spans: Array<{ start: number; end: number }>
  incomplete: boolean
}

export interface ParseAIJSONOptions {
  recoverUnclosedString?: {
    field: string
    followingTopLevelFields: readonly string[]
  }
}

export interface ParsedAIJSONCandidate<T = unknown> {
  value: T
  start: number
  end: number
  source: string
}

/** 只移除包住完整响应的一组成对 Markdown 围栏。 */
export function unwrapCompleteMarkdownFence(raw: string): string {
  const normalized = raw.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trim()
  const opening = normalized.match(/^(```|~~~)(?:jsonc?|javascript|js|text|markdown)?[ \t]*\n/iu)
  if (!opening) return normalized

  const delimiter = opening[1]
  const closing = `\n${delimiter}`
  if (!normalized.endsWith(closing)) return normalized
  return normalized.slice(opening[0].length, -closing.length).trim()
}

function scanCompleteJsonSpans(source: string): JsonSpanScan {
  const spans: Array<{ start: number; end: number }> = []
  const stack: string[] = []
  let rootStart = -1
  let stringEnd = ''
  let escaped = false
  let malformed = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (stringEnd) {
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      if (character === stringEnd) stringEnd = ''
      continue
    }

    if (character === '"' || character === "'") {
      if (stack.length > 0) stringEnd = character
      continue
    }
    if (character === '“') {
      if (stack.length > 0) stringEnd = '”'
      continue
    }
    if (character === '‘') {
      if (stack.length > 0) stringEnd = '’'
      continue
    }

    if (character === '{' || character === '[') {
      if (stack.length === 0) rootStart = index
      stack.push(character === '{' ? '}' : ']')
      continue
    }
    if (character !== '}' && character !== ']') continue
    if (stack.length === 0 || stack.at(-1) !== character) {
      malformed = true
      continue
    }
    stack.pop()
    if (stack.length === 0 && rootStart >= 0) {
      spans.push({ start: rootStart, end: index + 1 })
      rootStart = -1
    }
  }

  return {
    spans,
    incomplete: malformed || stack.length > 0 || Boolean(stringEnd),
  }
}

/** 只改写 JSON 结构标点；字符串正文中的中文标点保持原样。 */
function normalizeJsonSyntax(source: string): string {
  let output = ''
  let stringEnd = ''
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (stringEnd) {
      if (escaped) {
        output += character
        escaped = false
        continue
      }
      if (character === '\\') {
        output += character
        escaped = true
        continue
      }
      if (character === stringEnd) {
        output += '"'
        stringEnd = ''
        continue
      }
      if (character === '\n') {
        output += '\\n'
        continue
      }
      if (character === '\r') {
        if (source[index + 1] === '\n') index += 1
        output += '\\n'
        continue
      }
      if (character === '\t') {
        output += '\\t'
        continue
      }
      output += stringEnd === "'" && character === '"' ? '\\"' : character
      continue
    }

    if (character === '"' || character === "'") {
      output += '"'
      stringEnd = character
      continue
    }
    if (character === '“') {
      output += '"'
      stringEnd = '”'
      continue
    }
    if (character === '‘') {
      output += '"'
      stringEnd = '’'
      continue
    }
    if (character === '：') {
      output += ':'
      continue
    }
    if (character === ',' || character === '，') {
      let cursor = index + 1
      while (/\s/u.test(source[cursor] ?? '')) cursor += 1
      if (source[cursor] === '}' || source[cursor] === ']') continue
      output += ','
      continue
    }
    output += character
  }

  return output.replace(/([{,]\s*)([A-Za-z_$\u4e00-\u9fff][\w$\u4e00-\u9fff-]*)\s*:/gu, '$1"$2":')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function recoverUnclosedString<T>(
  source: string,
  recovery: NonNullable<ParseAIJSONOptions['recoverUnclosedString']>,
): T | null {
  const fieldPattern = new RegExp(`"${escapeRegExp(recovery.field)}"\\s*:\\s*"`, 'gu')
  const fieldMatches = [...source.matchAll(fieldPattern)]
  if (fieldMatches.length !== 1) return null

  const fieldMatch = fieldMatches[0]
  const valueStart = (fieldMatch.index ?? 0) + fieldMatch[0].length
  const followingFields = [...new Set(recovery.followingTopLevelFields)]
    .filter((field) => field && field !== recovery.field)
  if (followingFields.length === 0) return null

  const boundaryPattern = new RegExp(
    `,\\s*"(${followingFields.map(escapeRegExp).join('|')})"\\s*:`,
    'gu',
  )
  boundaryPattern.lastIndex = valueStart
  const successful: T[] = []
  let boundary: RegExpExecArray | null
  while ((boundary = boundaryPattern.exec(source)) !== null) {
    const boundaryIndex = boundary.index
    const repaired = `${source.slice(0, boundaryIndex)}"${source.slice(boundaryIndex)}`
    const parsed = parseCompleteJson<T>(repaired)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    const record = parsed as Record<string, unknown>
    if (typeof record[recovery.field] !== 'string') continue
    if (!Object.prototype.hasOwnProperty.call(record, boundary[1])) continue
    successful.push(parsed)
  }

  return successful.length === 1 ? successful[0] : null
}

function parseCompleteJson<T>(source: string): T | null {
  try {
    return JSON.parse(source) as T
  } catch {
    try {
      return JSON.parse(normalizeJsonSyntax(source)) as T
    } catch {
      return null
    }
  }
}

function parseJsonCandidates<T>(source: string): ParsedAIJSONCandidate<T>[] {
  const scan = scanCompleteJsonSpans(source)
  const candidates: ParsedAIJSONCandidate<T>[] = []
  for (const span of scan.spans) {
    const fragment = source.slice(span.start, span.end)
    const parsed = parseCompleteJson<T>(fragment)
    if (parsed !== null) candidates.push({ value: parsed, ...span, source: fragment })
  }
  return candidates
}

/** 返回响应中所有可独立消费的 JSON 候选；残缺尾部不会丢弃前面已经完整的候选。 */
export function parseAIJSONCandidates<T = unknown>(
  raw: string,
  options: ParseAIJSONOptions = {},
): ParsedAIJSONCandidate<T>[] {
  if (!raw?.trim()) return []
  const cleaned = unwrapCompleteMarkdownFence(raw)
  if (!cleaned) return []

  const direct = parseCompleteJson<T>(cleaned)
  if (direct !== null) return [{ value: direct, start: 0, end: cleaned.length, source: cleaned }]

  if (options.recoverUnclosedString) {
    const recovered = recoverUnclosedString<T>(cleaned, options.recoverUnclosedString)
    if (recovered !== null) return [{ value: recovered, start: 0, end: cleaned.length, source: cleaned }]
  }
  return parseJsonCandidates<T>(cleaned)
}

/**
 * 解析一个可消费 JSON 值。可以忽略围栏或 JSON 外说明文字；多个候选时优先选择
 * 内容最长的完整候选，残缺尾部不会拖累前面已经完整的结果。
 */
export function parseAIJSON<T = unknown>(
  raw: string,
  options: ParseAIJSONOptions = {},
): T | null {
  if (!raw?.trim()) return null
  const cleaned = unwrapCompleteMarkdownFence(raw)
  if (!cleaned) return null

  const candidates = parseAIJSONCandidates<T>(cleaned, options)
  if (candidates.length === 0) return null
  return [...candidates]
    .sort((left, right) => (right.end - right.start) - (left.end - left.start))[0].value
}
