/**
 * @module stream-text-extractor.ts
 * @description SSE 流式 chunk 正文提取 —— 兼容 delta / message / 多 Provider 字段
 * @mod core
 */

/** 从单个 SSE JSON chunk 提取可拼接的正文增量（不含推理链） */
export function extractStreamTextChunk(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return ''

  const choices = (parsed as { choices?: unknown[] }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''

  const choice = choices[0] as Record<string, unknown>
  const delta = choice.delta as Record<string, unknown> | undefined
  const message = choice.message as Record<string, unknown> | undefined

  const parts: string[] = []

  if (typeof delta?.content === 'string' && delta.content) {
    parts.push(delta.content)
  }
  if (typeof delta?.text === 'string' && delta.text) {
    parts.push(delta.text)
  }

  // 末包可能直接给完整 message.content（非增量）
  if (typeof message?.content === 'string' && message.content) {
    parts.push(message.content)
  }

  return parts.join('')
}

/**
 * 合并流式 chunk 到累积正文。
 * 若末包含完整 message.content 且比当前更长，以之为准（覆盖增量拼接）。
 */
export function mergeStreamTextChunk(accumulated: string, parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return accumulated

  const choices = (parsed as { choices?: unknown[] }).choices
  if (!Array.isArray(choices) || choices.length === 0) return accumulated

  const choice = choices[0] as Record<string, unknown>
  const message = choice.message as Record<string, unknown> | undefined
  const msgContent = message?.content

  if (typeof msgContent === 'string' && msgContent.length > accumulated.length) {
    return msgContent
  }

  const deltaText = extractStreamTextChunk(parsed)
  if (!deltaText) return accumulated

  // 避免末包 message.content 与已累积重复拼接
  if (typeof msgContent === 'string' && msgContent && accumulated.endsWith(msgContent)) {
    return accumulated
  }

  return accumulated + deltaText
}

/** 是否为可用 AI 正文（非空且非占位） */
export function isValidAiContent(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.length > 0 && trimmed !== '无'
}
