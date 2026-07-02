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
  DESTINY_PATTERN_MODIFIER_BENEFIT_DIRECTION,
} from '../constants'

export type DestinyPatternSystemModifierKey =
  | (typeof DESTINY_PATTERN_PERSONAL_MODIFIER_KEYS)[number]
  | (typeof DESTINY_PATTERN_WORLD_MODIFIER_KEYS)[number]

const PERSONAL_SET = new Set<string>(DESTINY_PATTERN_PERSONAL_MODIFIER_KEYS)
const WORLD_SET = new Set<string>(DESTINY_PATTERN_WORLD_MODIFIER_KEYS)

/**
 * 命格修饰符稀有度门槛
 *
 * 设计意图：
 *   rare     → 轻微影响个人层面（1 个 personal 字段，±5~8%）
 *   epic     → 显著影响个人 + 轻微影响世界（2 personal + 1 world，±10~15%）
 *   legendary → 深度影响个人 + 宏观影响世界（2 personal + 2 world，±15~20%）
 *   common/fine → 无 systemModifiers（仅 attrBonus）
 */
const RARITY_MODIFIER_LIMITS: Record<
  DestinyPatternRarity,
  { personal: number; world: number; min: number; max: number }
> = {
  common: { personal: 0, world: 0, min: 1, max: 1 },
  fine: { personal: 0, world: 0, min: 1, max: 1 },
  rare: { personal: 1, world: 0, min: 0.95, max: 1.08 },
  epic: { personal: 2, world: 1, min: 0.90, max: 1.15 },
  legendary: { personal: 2, world: 2, min: 0.85, max: 1.20 },
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

export interface PatternModifierDisplayItem {
  label: string
  delta: number
  /** 原始乘数（1.0 = 无变化） */
  multiplier: number
  /** 结合 benefitDirection 判定此数值对玩家是否有利 */
  isBeneficial: boolean
  /** 显示文本，如 "气运获取 +12%" */
  display: string
}

/**
 * 格式化命格 systemModifiers 为 UI 展示条目
 * 结合 benefitDirection 计算 isBeneficial，用于准确着色
 * （例如 attributeDecayModifier=0.92 在数值上是 -8%，但对玩家有利，应显示绿色而非红色）
 */
export function formatPatternSystemModifiersForDisplay(
  modifiers?: Partial<Record<string, number>>,
): PatternModifierDisplayItem[] {
  if (!modifiers || Object.keys(modifiers).length === 0) return []

  return Object.entries(modifiers).map(([key, val]) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return null
    const label = MODIFIER_LABELS[key] ?? key
    const delta = Math.round((val - 1) * 100)
    const sign = delta >= 0 ? '+' : ''
    const display = `${label} ${sign}${delta}%`

    // 收益方向 + 数值方向 → 综合判定是否有利
    const direction = DESTINY_PATTERN_MODIFIER_BENEFIT_DIRECTION[key]
    const isHigherBetter = direction !== 'lower' // 默认 'higher'
    const isBeneficial = isHigherBetter ? delta >= 0 : delta <= 0

    return { label, delta, multiplier: val, isBeneficial, display }
  }).filter((x): x is PatternModifierDisplayItem => x !== null)
}
