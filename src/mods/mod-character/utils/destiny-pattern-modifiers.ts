/**
 * @module destiny-pattern-modifiers.ts
 * @description 命格 systemModifiers 校验、聚合与运行时叠加
 * @mod mod-character
 */

import type { DestinyPattern, DestinyPatternRarity } from '../types'
import {
  DESTINY_PATTERN_PERSONAL_MODIFIER_KEYS,
  DESTINY_PATTERN_WORLD_MODIFIER_KEYS,
  DESTINY_PATTERN_PERSONAL_MODIFIERS,
  DESTINY_PATTERN_WORLD_MODIFIERS,
} from '../constants'

export type DestinyPatternSystemModifierKey =
  | (typeof DESTINY_PATTERN_PERSONAL_MODIFIER_KEYS)[number]
  | (typeof DESTINY_PATTERN_WORLD_MODIFIER_KEYS)[number]

const PERSONAL_SET = new Set<string>(DESTINY_PATTERN_PERSONAL_MODIFIER_KEYS)
const WORLD_SET = new Set<string>(DESTINY_PATTERN_WORLD_MODIFIER_KEYS)

const RARITY_MODIFIER_LIMITS: Record<
  DestinyPatternRarity,
  { personal: number; world: number; min: number; max: number }
> = {
  common: { personal: 0, world: 0, min: 1, max: 1 },
  fine: { personal: 0, world: 0, min: 1, max: 1 },
  rare: { personal: 1, world: 0, min: 0.95, max: 1.08 },
  epic: { personal: 1, world: 1, min: 0.93, max: 1.12 },
  legendary: { personal: 2, world: 2, min: 0.88, max: 1.15 },
}

function clampMod(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)) * 1000) / 1000
}

/** 校验并裁剪 AI 返回的 systemModifiers */
export function validatePatternSystemModifiers(
  raw: Record<string, unknown> | undefined,
  rarity: DestinyPatternRarity,
): Partial<Record<DestinyPatternSystemModifierKey, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined

  const limits = RARITY_MODIFIER_LIMITS[rarity]
  if (limits.personal === 0 && limits.world === 0) return undefined

  const result: Partial<Record<DestinyPatternSystemModifierKey, number>> = {}
  let personalCount = 0
  let worldCount = 0

  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) continue
    const isPersonal = PERSONAL_SET.has(key)
    const isWorld = WORLD_SET.has(key)
    if (!isPersonal && !isWorld) continue

    if (isPersonal) {
      if (personalCount >= limits.personal) continue
      personalCount++
    } else {
      if (worldCount >= limits.world) continue
      worldCount++
    }

    result[key as DestinyPatternSystemModifierKey] = clampMod(val, limits.min, limits.max)
  }

  return Object.keys(result).length > 0 ? result : undefined
}

/** 将已选命格的 systemModifiers 聚合为乘法叠加表（供 world store 注入） */
export function aggregatePatternSystemModifiers(
  patterns: DestinyPattern[],
): Partial<Record<DestinyPatternSystemModifierKey, number>> {
  const merged: Partial<Record<DestinyPatternSystemModifierKey, number>> = {}

  for (const p of patterns) {
    if (!p.systemModifiers) continue
    for (const [key, val] of Object.entries(p.systemModifiers)) {
      if (typeof val !== 'number' || !Number.isFinite(val)) continue
      const k = key as DestinyPatternSystemModifierKey
      merged[k] = (merged[k] ?? 1) * val
    }
  }

  for (const key of Object.keys(merged)) {
    const k = key as DestinyPatternSystemModifierKey
    merged[k] = clampMod(merged[k]!, 0.85, 1.2)
  }

  return merged
}

const MODIFIER_LABELS: Record<string, string> = {
  ...DESTINY_PATTERN_PERSONAL_MODIFIERS,
  ...DESTINY_PATTERN_WORLD_MODIFIERS,
}

/** 格式化命格 systemModifiers 为 UI 展示行 */
export function formatPatternSystemModifiersForDisplay(
  modifiers?: Partial<Record<string, number>>,
): string[] {
  if (!modifiers || Object.keys(modifiers).length === 0) return []

  return Object.entries(modifiers).map(([key, val]) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return ''
    const label = MODIFIER_LABELS[key] ?? key
    const delta = Math.round((val - 1) * 100)
    const sign = delta >= 0 ? '+' : ''
    return `${label} ${sign}${delta}%`
  }).filter(Boolean)
}
