/**
 * @module world-init-kv.ts
 * @description world-init KV Cache —— user_id 子池、sessionId、user 键序与 S2 分段
 * @mod mod-world
 */

import type { AIModelConfig } from '@/foundation'

import { applyKvPromptOrder, type KvPromptOrderResult } from '@/core/ai-service/kv-prompt-order'

import { parseAIJSON } from './parse-ai-json'

/** world-init user_id 子池（拼入 sessionId → winit-{subPool}-{worldCode}） */
export type WorldInitKVSubPool = 'cal' | 'tl' | 'geo' | 'tag'

export function buildWorldInitKvSessionId(worldCode: number, subPool: WorldInitKVSubPool): string {
  return `${subPool}-${worldCode}`
}

/** 同世界、跨步骤稳定的 user 字段（放 S2 首段 / JSON 前部） */
export const WORLD_INIT_STABLE_USER_KEYS = [
  'worldDescription',
  'coherenceHint',
  'coherenceNote',
  'worldName',
  'essenceTag',
  'powerSystemTag',
  'civilizationStage',
  'spatialForm',
  'worldType',
  'worldTags',
  'calibrationSummary',
  'worldviewStyleHint',
  'powerFramework',
  'difficulty',
  'dimensionChoices',
  'dimensionOptions',
] as const

/** 实体步变长字段 */
export const WORLD_INIT_ENTITY_VARIABLE_KEYS = [
  'instruction',
  'entityRanges',
  'mapRegions',
  'existingEntities',
] as const

/** 配置/标签步变长字段 */
export const WORLD_INIT_CAL_VARIABLE_KEYS = [
  'instruction',
] as const

/** tag 步变长字段（outputInstruction 等） */
export const WORLD_INIT_TAG_VARIABLE_KEYS = [
  'instruction',
  'outputInstruction',
] as const

export function applyWorldInitKvUserPrompt(
  filledUserPrompt: string,
  subPool: WorldInitKVSubPool,
): KvPromptOrderResult {
  const variableKeys = subPool === 'geo'
    ? WORLD_INIT_ENTITY_VARIABLE_KEYS
    : subPool === 'tag'
      ? WORLD_INIT_TAG_VARIABLE_KEYS
      : WORLD_INIT_CAL_VARIABLE_KEYS

  return applyKvPromptOrder(filledUserPrompt, WORLD_INIT_STABLE_USER_KEYS, variableKeys)
}

export interface WorldInitKvCallExtras {
  userSegments?: string[]
  stablePrefixChars?: number
  kvSubPool?: WorldInitKVSubPool
}

/** 填充模板后应用 KV 键序 + S2 分段（重试提示请通过 extraUserMessages 追加，勿拼进 JSON） */
export function prepareWorldInitUserPrompt(
  filledUserPrompt: string,
  subPool: WorldInitKVSubPool,
): { userPrompt: string } & WorldInitKvCallExtras {
  const ordered = applyWorldInitKvUserPrompt(filledUserPrompt, subPool)
  return {
    userPrompt: ordered.userPrompt,
    userSegments: ordered.userSegments,
    stablePrefixChars: ordered.stablePrefixChars,
    kvSubPool: subPool,
  }
}

/** cal/tag 用 JSON object；tl/geo 输出顶层数组，关闭 json_object */
export function resolveWorldInitJsonMode(subPool: WorldInitKVSubPool): boolean | undefined {
  if (subPool === 'cal' || subPool === 'tag') return true
  return false
}

export function configForWorldInitSubPool(aiConfig: AIModelConfig, subPool: WorldInitKVSubPool): AIModelConfig {
  if (subPool === 'cal' || subPool === 'tag') {
    return { ...aiConfig, responseFormat: { type: 'json_object' } }
  }
  return { ...aiConfig, responseFormat: undefined }
}

/** 解析 tags-fallback / world-build 标签响应（兼容 JSON 对象 envelope 与裸数组） */
export function parseWorldTagsResponse(raw: string): string[] {
  const parsed = parseAIJSON<{ tags?: unknown } | string[]>(raw)
  if (!parsed) throw new Error('标签 JSON 解析失败')

  const candidates = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.tags)
      ? parsed.tags
      : null

  if (!candidates) throw new Error('标签 JSON 缺少 tags 数组')
  const stringTags = candidates.filter((t): t is string => typeof t === 'string')
  if (stringTags.length === 0) throw new Error('标签为空')
  return stringTags
}
