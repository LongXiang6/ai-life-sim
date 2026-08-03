/**
 * Purpose: Define the stable game difficulty vocabulary and multipliers.
 * Owner: foundation:types
 * Responsibility: Difficulty constants and their compile-time type only.
 */

export type DifficultyLevel = 'normal' | 'hard' | 'nightmare' | 'hell'

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  normal: '普通',
  hard: '困难',
  nightmare: '噩梦',
  hell: '地狱',
}

export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, string> = {
  normal: '标准体验，所有系统按默认速率运转',
  hard: '恢复速率降至 85%，衰减速率升至 130%',
  nightmare: '恢复速率降至 70%，衰减速率升至 170%',
  hell: '恢复速率降至 50%，衰减速率升至 200%',
}

export const DIFFICULTY_MULTIPLIERS_HEALTH: Record<DifficultyLevel, number> = {
  normal: 1.0,
  hard: 0.85,
  nightmare: 0.7,
  hell: 0.5,
}

export const DIFFICULTY_MULTIPLIERS_FORTUNE: Record<DifficultyLevel, number> = {
  normal: 1.0,
  hard: 0.8,
  nightmare: 0.5,
  hell: 0.3,
}
