/**
 * @module streaming-json-array-parser.ts
 * @description 流式 JSON 数组增量解析 —— 每收到完整对象即产出一条
 * @mod mod-character
 */

/** 从缓冲区提取已完整的顶层 JSON 对象（数组元素） */
function extractCompleteObjects(buffer: string): unknown[] {
  const objects: unknown[] = []
  let i = 0

  // 跳过 markdown 代码块前缀
  const mdMatch = buffer.match(/^```(?:json)?\s*/)
  if (mdMatch) {
    i = mdMatch[0].length
  }

  // 定位数组起始 [
  while (i < buffer.length && buffer[i] !== '[') {
    i++
  }
  if (i >= buffer.length) return objects
  i++

  let depth = 0
  let objStart = -1
  let inString = false
  let escaped = false

  for (; i < buffer.length; i++) {
    const ch = buffer[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
      continue
    }

    if (ch === '}') {
      depth--
      if (depth === 0 && objStart >= 0) {
        const slice = buffer.slice(objStart, i + 1)
        try {
          objects.push(JSON.parse(slice))
        } catch {
          // 对象尚未完整，停止提取
          return objects.slice(0, objects.length)
        }
        objStart = -1
      }
      continue
    }

    if (depth === 0 && ch === ']') {
      break
    }
  }

  return objects
}

/**
 * 流式 JSON 数组解析器
 * 适用于 AI 输出 `[{...},{...},...]` 紧凑格式
 */
export class StreamingJsonArrayParser<T = unknown> {
  private buffer = ''
  private emitted = 0

  /** 追加流式 chunk，返回本次新解析出的完整对象 */
  feed(chunk: string): T[] {
    if (!chunk) return []
    this.buffer += chunk
    const all = extractCompleteObjects(this.buffer) as T[]
    if (all.length <= this.emitted) return []
    const fresh = all.slice(this.emitted)
    this.emitted = all.length
    return fresh
  }

  /** 流结束后补解析尚未发出的对象 */
  finalize(fullText: string): T[] {
    this.buffer = fullText
    const all = extractCompleteObjects(fullText) as T[]
    const fresh = all.slice(this.emitted)
    this.emitted = all.length
    return fresh
  }

  get parsedCount(): number {
    return this.emitted
  }
}
