/**
 * Purpose: Define the five narrative difficulty options.
 * Owner: mod-difficulty
 * Responsibility: Difficulty labels, descriptions, and ordering only.
 */

/**
 * @module constants.ts
 * @description 五档叙事难度选项
 * @mod mod-difficulty
 */

import { DIFFICULTY_DESCRIPTIONS, DIFFICULTY_LABELS, DIFFICULTY_ORDER } from '@/foundation'
import type { DifficultyLevel, DifficultyMap } from './types'

export const DIFFICULTY_CONFIG: DifficultyMap = Object.fromEntries(
  DIFFICULTY_ORDER.map((level) => [level, {
    label: DIFFICULTY_LABELS[level],
    description: DIFFICULTY_DESCRIPTIONS[level],
  }]),
) as DifficultyMap

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [...DIFFICULTY_ORDER]

export const DEFAULT_DIFFICULTY: DifficultyLevel = 'normal'

export const STORAGE_KEY_DIFFICULTY = 'mod-difficulty:config:level' as const
