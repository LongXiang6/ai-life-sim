/**
 * Purpose: Define the difficulty MOD public and store types.
 * Owner: mod-difficulty
 * Responsibility: Difficulty type declarations only.
 */

/**
 * @module types.ts
 * @description MOD 类型定义 —— 五档叙事难度
 * @mod mod-difficulty
 */

import type { DifficultyLevel as DifficultyLevelBase } from '@/foundation'

export type DifficultyLevel = DifficultyLevelBase

export interface DifficultyConfig {
  label: string
  description: string
}

export type DifficultyMap = Record<DifficultyLevel, DifficultyConfig>

export interface ModEventPayloads {
  'mod-difficulty:changed': { level: DifficultyLevel; config: DifficultyConfig }
}

export type ModEvents = ModEventPayloads

export interface DifficultyStoreState {
  level: DifficultyLevel
  setLevel: (level: DifficultyLevel) => void
  getConfig: () => DifficultyConfig
}
