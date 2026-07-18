/**
 * @module balance-config.ts
 * @description 跨 MOD 平衡系数单一入口
 * @mod core/shared
 */

import type { DifficultyLevel } from '@/foundation'

import { clamp } from './common-utils'

export type CharacterBalanceAttributeKey =
  | 'physique'
  | 'mind'
  | 'talentAptitude'
  | 'charisma'

export type NumericRange = readonly [number, number]

/** 365 天制游戏年，和 TimeSystem / RoundContext.daysPassed 保持一致。 */
export const BALANCE_DAYS_PER_YEAR = 365

/**
 * 短步长最小可感知属性变化。
 *
 * 日/月步长按年缩放后会得到小于 1 的上限，AI 输出的明确变化会被钳成近零；
 * 因此只要本轮确实推进了时间，就允许至少 1 点变化，长步长仍按年上限放大。
 */
export const MIN_PERCEPTIBLE_ATTRIBUTE_DELTA = 1

/**
 * 世界难度倍数：数值越高越难。
 *
 * normal = 标准难度；hard/nightmare/hell 逐级提高系统惩罚强度。
 * 该表是后续模拟系统接入难度时的唯一倍率入口，不在各子系统内重复解释。
 */
export const WORLD_DIFFICULTY_MULTIPLIERS: Readonly<Record<DifficultyLevel, number>> = {
  normal: 1,
  hard: 1.3,
  nightmare: 1.7,
  hell: 2,
}

/**
 * 角色基础属性每游戏年的 AI 增量上限。
 *
 * 四项基础属性沿用旧的一年步长 ±8 手感。
 * 实际单轮上限由 daysPassed / 365 缩放，避免日/月步长被 AI 一次拉爆。
 */
export const CHARACTER_ATTRIBUTE_DELTA_LIMITS_PER_YEAR: Readonly<Record<CharacterBalanceAttributeKey, NumericRange>> = {
  physique: [-8, 8],
  mind: [-8, 8],
  talentAptitude: [-8, 8],
  charisma: [-8, 8],
}

/**
 * 读取世界难度倍数。
 *
 * 用途：后续 health/economy/fortune 等模拟系统恢复时，统一从这里读取难度，
 * 不再各自解释 `context.difficulty`。
 *
 * @param difficulty - RoundContext 中的难度等级
 * @returns 世界难度倍数，未知值回退为标准难度 1
 *
 * @example
 * ```ts
 * getWorldDifficultyMultiplier('hell') // 2
 * getWorldDifficultyMultiplier('normal') // 1
 * ```
 */
export function getWorldDifficultyMultiplier(
  difficulty: DifficultyLevel | string | null | undefined,
): number {
  if (difficulty === 'normal' || difficulty === 'hard' || difficulty === 'nightmare' || difficulty === 'hell') {
    return WORLD_DIFFICULTY_MULTIPLIERS[difficulty]
  }
  return WORLD_DIFFICULTY_MULTIPLIERS.normal
}

/**
 * 将本轮推进天数换算为游戏年数。
 *
 * @param daysPassed - TimeSystem 注入的 RoundContext.daysPassed
 * @returns 非负游戏年数；非法输入按 0 处理
 *
 * @example
 * ```ts
 * getElapsedGameYears(365) // 1
 * getElapsedGameYears(30) // 约 0.0822
 * ```
 */
export function getElapsedGameYears(daysPassed: number): number {
  if (!Number.isFinite(daysPassed) || daysPassed <= 0) return 0
  return daysPassed / BALANCE_DAYS_PER_YEAR
}

/**
 * 解析某项角色属性在本轮允许的增量范围。
 *
 * @param key - 角色基础属性键
 * @param daysPassed - 本轮推进天数，来自 RoundContext.daysPassed
 * @returns 已按本轮游戏时间缩放后的 [min, max] 范围
 *
 * @example
 * ```ts
 * resolveCharacterAttributeDeltaLimit('physique', 1) // [-1, 1]
 * resolveCharacterAttributeDeltaLimit('physique', 365) // [-8, 8]
 * ```
 */
export function resolveCharacterAttributeDeltaLimit(
  key: CharacterBalanceAttributeKey,
  daysPassed: number,
): NumericRange {
  const [min, max] = CHARACTER_ATTRIBUTE_DELTA_LIMITS_PER_YEAR[key]
  const elapsedYears = getElapsedGameYears(daysPassed)
  if (elapsedYears <= 0) return [0, 0]

  const scaledMin = min * elapsedYears
  const scaledMax = max * elapsedYears
  return [
    Math.min(scaledMin, -MIN_PERCEPTIBLE_ATTRIBUTE_DELTA),
    Math.max(scaledMax, MIN_PERCEPTIBLE_ATTRIBUTE_DELTA),
  ]
}

/**
 * 钳制 AI 返回的角色属性增量。
 *
 * 这层把"字段契约的数值"和"时间引擎推进跨度"绑定起来：
 * AI 仍输出本轮语义增量，本地按本轮实际经过的游戏时间决定能落地多少。
 *
 * @param rawDelta - AI 或兜底提取出的原始增量
 * @param key - 角色基础属性键
 * @param daysPassed - 本轮推进天数，来自 RoundContext.daysPassed
 * @returns 钳制后的实际落地增量
 *
 * @example
 * ```ts
 * clampCharacterAttributeDelta(20, 'physique', 365) // 8
 * ```
 */
export function clampCharacterAttributeDelta(
  rawDelta: number,
  key: CharacterBalanceAttributeKey,
  daysPassed: number,
): number {
  const [min, max] = resolveCharacterAttributeDeltaLimit(key, daysPassed)
  return clamp(rawDelta, min, max)
}
