/**
 * @module kv-prompt-order.ts
 * @description KV Cache 优化 —— user JSON 键序重排与 S2 双 user 分段
 * @mod core
 */

import { stringifyPrompt } from '@/foundation'

export interface KvPromptOrderResult {
  /** S1 完整 user（稳定段 + 变长段合并，键序已优化） */
  userPrompt: string
  /** S2 双 user 分段（有变长段时启用） */
  userSegments?: string[]
  stablePrefixChars: number
}

function tryParsePromptObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* 非 JSON user（纯文本 prompt） */
  }
  return null
}

/**
 * 按 stableKeys → variableKeys → 其余键 重排 JSON user prompt，并拆 S2 分段
 */
export function applyKvPromptOrder(
  filledUserPrompt: string,
  stableKeys: readonly string[],
  variableKeys: readonly string[],
): KvPromptOrderResult {
  const obj = tryParsePromptObject(filledUserPrompt)
  if (!obj) {
    return { userPrompt: filledUserPrompt, stablePrefixChars: filledUserPrompt.length }
  }

  const stableSet = new Set(stableKeys)
  const variableSet = new Set(variableKeys)
  const stable: Record<string, unknown> = {}
  const variable: Record<string, unknown> = {}

  for (const key of stableKeys) {
    if (key in obj) stable[key] = obj[key]
  }
  for (const key of variableKeys) {
    if (key in obj) variable[key] = obj[key]
  }
  for (const [key, value] of Object.entries(obj)) {
    if (stableSet.has(key) || variableSet.has(key)) continue
    if (variableSet.size > 0) variable[key] = value
    else stable[key] = value
  }

  const stableStr = stringifyPrompt(stable)
  const variableKeysPresent = Object.keys(variable)
  if (variableKeysPresent.length === 0) {
    return { userPrompt: stableStr, stablePrefixChars: stableStr.length }
  }

  const variableStr = stringifyPrompt(variable)
  const merged = stringifyPrompt({ ...stable, ...variable })
  return {
    userPrompt: merged,
    userSegments: [stableStr, variableStr],
    stablePrefixChars: stableStr.length,
  }
}
