/**
 * @module stringify-prompt.ts
 * @description Prompt 场景 JSON 序列化 —— 每个字段自成一行（含嵌套对象）
 *
 * 顶层与子对象 key-value 之间换行，数组元素各占一行。
 * 提升 AI 阅读 Prompt 的可读性，同时控制 token 消耗。
 *
 * @foundation
 */
export function stringifyPrompt(obj: unknown): string {
  return formatPromptValue(obj, 0)
}

function formatPromptValue(obj: unknown, depth: number): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    const items = obj.map((item) => formatPromptValue(item, depth + 1))
    return '[\n' + items.join(',\n') + '\n]'
  }

  const entries = Object.entries(obj as Record<string, unknown>)
  if (entries.length === 0) return '{}'

  const lines = entries.map(([key, value]) => {
    const formatted = formatPromptValue(value, depth + 1)
    return `${JSON.stringify(key)}:${formatted}`
  })
  return '{' + lines.join(',\n') + '}'
}
