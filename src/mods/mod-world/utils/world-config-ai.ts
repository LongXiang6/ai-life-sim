/**
 * @module world-config-ai.ts
 * @description W02 世界参数 AI 响应解析 —— 嵌套分组扁平化 + Zod 校验
 * @mod mod-world
 */

import { worldConfigOutputSchema, type WorldAIDetailedParameters } from '../prompts/world-config-prompt'
import { parseAIJSON } from './parse-ai-json'

const NESTED_GROUPS = [
  'geography',
  'civilization',
  'politics',
  'economy',
  'powerSystem',
  'culture',
  'atmosphere',
  'worldview',
  'sociology',
  'narrativePreferences',
  'styleGuide',
] as const

const FLAT_FIELD_MARKERS = [
  'climate',
  'techLevel',
  'literacyRate',
  'governmentType',
  'inflationRate',
  'powerCeiling',
  'overallMood',
] as const

/** 将 AI 返回的分组 JSON 扁平化为 worldConfigOutputSchema 字段 */
export function flattenWorldConfigAIResponse(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object') return {}
  const obj = parsed as Record<string, unknown>

  if (typeof obj.climate === 'string') {
    return { ...obj }
  }

  const flat: Record<string, unknown> = {}
  for (const group of NESTED_GROUPS) {
    const section = obj[group]
    if (section && typeof section === 'object' && !Array.isArray(section)) {
      Object.assign(flat, section as Record<string, unknown>)
    }
  }

  if (Object.keys(flat).length === 0) {
    for (const [, value] of Object.entries(obj)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const nested = value as Record<string, unknown>
      const looksLikeW02 = nestedKeysMatchMarkers(nested)
      if (looksLikeW02 || Object.keys(nested).length >= 4) {
        Object.assign(flat, nested)
      }
    }
  }

  return Object.keys(flat).length > 0 ? flat : { ...obj }
}

function nestedKeysMatchMarkers(nested: Record<string, unknown>): boolean {
  return FLAT_FIELD_MARKERS.some((m) => m in nested)
}

/** 从已解析对象校验 W02 参数；失败返回 null */
export function parseWorldConfigFromObject(parsed: unknown): WorldAIDetailedParameters | null {
  if (parsed == null) return null
  const flat = flattenWorldConfigAIResponse(parsed)
  const result = worldConfigOutputSchema.safeParse(flat)
  return result.success ? result.data : null
}

/** 解析并校验 W02 参数 AI 响应；失败返回 null */
export function parseWorldConfigAIResponse(raw: string): WorldAIDetailedParameters | null {
  const parsed = parseAIJSON<unknown>(raw)
  return parseWorldConfigFromObject(parsed)
}
