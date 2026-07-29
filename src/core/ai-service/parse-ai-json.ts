/**
 * @module parse-ai-json.ts
 * @description 无损解析完整 AI JSON；兼容围栏、说明文字和常见 JSON 标点偏差
 * @mod core
 */

interface JsonSpanScan {
  spans: Array<{ start: number; end: number }>
  incomplete: boolean
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

    if (character === '"') {
      if (stack.length > 0) stringEnd = '"'
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
      output += stringEnd === '"' || character !== '"' ? character : '\\"'
      continue
    }

    if (character === '"') {
      output += character
      stringEnd = '"'
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

  return output
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

/**
 * 解析一个完整 JSON 值。可以忽略围栏或 JSON 外说明文字，但不能补写括号、
 * 丢弃残缺尾部，或在存在多个候选值时猜测应采用哪一个。
 */
export function parseAIJSON<T = unknown>(raw: string): T | null {
  if (!raw?.trim()) return null
  const cleaned = unwrapCompleteMarkdownFence(raw)
  if (!cleaned) return null

  const direct = parseCompleteJson<T>(cleaned)
  if (direct !== null) return direct

  const scan = scanCompleteJsonSpans(cleaned)
  if (scan.incomplete || scan.spans.length !== 1) return null
  const [{ start, end }] = scan.spans
  return parseCompleteJson<T>(cleaned.slice(start, end))
}
