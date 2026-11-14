/**
 * Purpose: Expose the difficulty MOD public API.
 * Owner: mod-difficulty
 * Responsibility: Public difficulty exports only.
 */

/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 五档叙事难度
 * @mod mod-difficulty
 */

export type {
  DifficultyLevel,
  DifficultyConfig,
  DifficultyMap,
  ModEvents,
  ModEventPayloads,
} from './types'

export {
  DIFFICULTY_CONFIG,
  DIFFICULTY_LEVELS,
  DEFAULT_DIFFICULTY,
  STORAGE_KEY_DIFFICULTY,
} from './constants'

export { useDifficultyStore } from './store'
