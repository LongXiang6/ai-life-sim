/**
 * Purpose: Project proxy log records for safe debug-console display.
 * Owner: core:logger
 * Responsibility: Preserve AI messages while excluding credentials from legacy request payloads.
 */

const SENSITIVE_FIELD_PATTERN = /^(?:api[_-]?key|authorization|access[_-]?token|proxy[_-]?token)$/iu
const SENSITIVE_TEXT_PATTERN = /(?:"api[_-]?key"|"authorization"|sk-[A-Za-z0-9_-]{8,})/u

function projectValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => projectValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
        .map(([key, child]) => [key, projectValue(child)]),
    )
  }
  if (typeof value === 'string' && SENSITIVE_TEXT_PATTERN.test(value)) return '[包含认证字段的原始内容已隐藏]'
  return value
}

/** Extracts the message array from both current and legacy proxy request traces. */
export function projectProxyPromptText(prompt: string | null): string | null {
  if (!prompt) return prompt
  try {
    const parsed = JSON.parse(prompt) as unknown
    if (Array.isArray(parsed)) return JSON.stringify(projectValue(parsed))
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { messages?: unknown }).messages)) {
      return JSON.stringify(projectValue((parsed as { messages: unknown[] }).messages))
    }
    const projected = projectValue(parsed)
    return JSON.stringify(projected)
  } catch {
    return SENSITIVE_TEXT_PATTERN.test(prompt) ? '[历史代理请求包含认证字段，未展示。]' : prompt
  }
}

/** Applies the same credential-safe projection to technical metadata and payloads. */
export function projectDebugLogValue(value: unknown): unknown {
  return projectValue(value)
}

export function projectProxyTraceEntry<T extends {
  entryType: string
  prompt: string | null
  meta: unknown
  payload: unknown
}>(entry: T): T {
  if (entry.entryType !== 'proxy-trace') return entry
  return {
    ...entry,
    prompt: projectProxyPromptText(entry.prompt),
    meta: projectDebugLogValue(entry.meta),
    payload: projectDebugLogValue(entry.payload),
  }
}
