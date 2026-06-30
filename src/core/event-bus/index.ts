/**
 * @module index.ts
 * @description 事件总线统一导出
 * @mod core
 */

export { eventBus } from './event-bus'
export {
  CoreEvents,
  EngineEvents,
  WorldEvents,
  CharacterEvents,
  StorageEvents,
} from './event-types'
export type { EventName } from './event-types'
