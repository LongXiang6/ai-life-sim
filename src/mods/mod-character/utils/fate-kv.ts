/**
 * Purpose: Define the stable and variable user-key order for the fate prompt cache.
 * Owner: mod-character.
 * Responsibility: Fate KV prompt ordering and session identity only; generation owns content.
 *
 * @module fate-kv.ts
 * @description 命格/天赋池 KV Cache —— user 键序、S2 分段与 sessionId
 * @mod mod-character
 */

import { applyKvPromptOrder, type KvPromptOrderResult } from '@/core/ai-service/kv-prompt-order'

/** 跨批次稳定的 user 字段 */
export const FATE_STABLE_USER_KEYS = [
  'worldDescription',
  'coherenceHint',
  'calibrationSummary',
  'worldTags',
  'worldName',
  'essenceTag',
  'powerSystemTag',
  'civilizationStage',
  'spatialForm',
  'powerFramework',
  'personalModifierFields',
] as const

/** 每批变化的 user 字段（候选历史放最后以最大化稳定前缀命中） */
export const FATE_VARIABLE_USER_KEYS = [
  'instruction',
  'character',
  'requirements',
  'existingNames',
  'existingPatterns',
] as const

export function buildFateKvSessionId(worldCode: number): string {
  return String(worldCode)
}

export function prepareFateUserPrompt(filledUserPrompt: string): KvPromptOrderResult {
  return applyKvPromptOrder(filledUserPrompt, FATE_STABLE_USER_KEYS, FATE_VARIABLE_USER_KEYS)
}
