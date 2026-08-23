/**
 * Purpose: Build the dynamic world and character context for destiny-pattern generation.
 * Owner: mod-character
 * Responsibility: Prompt context projection only; pattern generation and validation remain with their owning modules.
 *
 * @module destiny-pattern-context.ts
 * @description 命格 AI 生成 Prompt 上下文组装 —— 精简版仅传世界名、描述、角色
 * @mod mod-character
 */

import { stringifyPrompt } from '@/foundation'

import type { KvPromptOrderResult } from '@/core/ai-service/kv-prompt-order'

import type { WorldConfig } from '@/mods/mod-world'

import { PRESET_DESTINY_PATTERNS } from '../constants'
import { prepareFateUserPrompt } from '../utils/fate-kv'

export type ExistingDestinyPatternSummary = {
  name: string
  description: string
  effect: string
}

export interface BuildDestinyPatternContextInput {
  worldConfig: WorldConfig | null | undefined
  character: {
    race?: string
    background?: string
  }
  existingNames: string[]
  /** Existing candidates from the requested category only; IDs and lineage are intentionally excluded. */
  existingPatterns?: ExistingDestinyPatternSummary[]
  includePresetNames?: boolean
}

/** 组装并 stringify 命格 user Prompt（精简版：仅世界名、描述、角色，不再依赖校准管线） */
export function buildDestinyPatternUserPrompt(input: BuildDestinyPatternContextInput): string {
  const cfg = input.worldConfig
  const names = [...input.existingNames]
  if (input.includePresetNames) {
    for (const p of PRESET_DESTINY_PATTERNS) {
      if (!names.includes(p.name)) names.push(p.name)
    }
  }

  const charParts: string[] = []
  if (input.character.race) charParts.push(`种族=${input.character.race}`)
  if (input.character.background) charParts.push(`背景=${input.character.background}`)

  const obj: Record<string, unknown> = {
    worldName: cfg?.name ?? '未知世界',
    worldDescription: cfg?.description?.trim() || '（无详细描述）',
    character: charParts.length > 0 ? charParts.join('，') : '（角色尚未设定）',
  }

  if (names.length > 0) {
    obj.existingNames = names.join('、')
  }
  const existingPatterns = input.existingPatterns
    ?.map((pattern) => ({
      name: pattern.name.trim(),
      description: pattern.description.trim(),
      effect: pattern.effect.trim(),
    }))
    .filter((pattern) => pattern.name && (pattern.description || pattern.effect))
  if (existingPatterns && existingPatterns.length > 0) {
    obj.existingPatterns = existingPatterns
  }

  return stringifyPrompt(obj)
}

/** 填充模板后应用 KV 键序（供 talent-draw 等直接 callAI 路径复用） */
export function buildDestinyPatternUserPromptKv(input: BuildDestinyPatternContextInput): KvPromptOrderResult {
  return prepareFateUserPrompt(buildDestinyPatternUserPrompt(input))
}
