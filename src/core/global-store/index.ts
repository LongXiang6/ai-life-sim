/**
 * @module index.ts
 * @description 全局 Store 统一导出
 * @mod core
 */

export { useGlobalStore } from './global-store'
export type { GlobalState, GamePhase } from './global-store'

// MOD Store 分片
export {
  useEngineStore,
} from './slices'
