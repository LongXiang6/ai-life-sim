/**
 * @module event-types.ts
 * @description 全局事件类型定义
 * @mod core
 *
 * 规范来源：mod-specification.md §6.2 事件命名规范
 * 格式：{mod}:{verb}-{noun}
 */

/** 核心事件 */
export const CoreEvents = {
  /** 所有 MOD 加载完成 */
  ALL_MODS_LOADED: 'core:all-mods-loaded',
} as const

/** 引擎事件 */
export const EngineEvents = {
  ROUND_START: 'mod-engine:round-start',
  ROUND_COMPLETE: 'mod-engine:round-complete',
  NARRATIVE_STREAM: 'mod-engine:narrative-stream',
} as const

/** 世界事件 */
export const WorldEvents = {
  INITIALIZED: 'mod-world:initialized',
} as const

/** 角色事件 */
export const CharacterEvents = {
  CREATED: 'mod-character:created',
  DIED: 'mod-character:died',
} as const

/** 存储事件 */
export const StorageEvents = {
  SAVE_COMPLETE: 'mod-storage:save-complete',
} as const

/** 所有事件名联合类型 */
export type EventName =
  | typeof CoreEvents[keyof typeof CoreEvents]
  | typeof EngineEvents[keyof typeof EngineEvents]
  | typeof WorldEvents[keyof typeof WorldEvents]
  | typeof CharacterEvents[keyof typeof CharacterEvents]
  | typeof StorageEvents[keyof typeof StorageEvents]
  | string
