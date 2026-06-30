/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 四档难度系统
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

export { applyCeilingSuppress } from './utils'

export { useDifficultyStore } from './store'
