/**
 * Purpose: Expose the lazy destiny-pattern runtime and page command boundary.
 * Owner: mod-character/destiny-pattern
 * Responsibility: Secondary public exports only; business state remains in the owning subsystem and Store.
 *
 * @module destiny-pattern-access.ts
 * @description 命格子系统页面级懒加载入口（与 subsystems barrel 分离）
 * @mod mod-character
 */

/** 命格子系统懒加载单例 —— 与 MOD loader 注册的运行时实例保持同一权威。 */
export { getDestinyPatternSystem } from './subsystems/destiny-pattern-system'

export {
  loadDestinyPatternPool,
  saveDestinyPatternPool,
} from './utils/destiny-pattern-pool-cache'
export {
  captureDestinyPatternGrowthTransaction,
  commitPreparedDestinyPatternGrowthChoice,
  prepareDestinyPatternGrowthChoice,
  registerDestinyPatternGrowthChoice,
  restoreDestinyPatternGrowthTransaction,
  resolveDestinyPatternGrowthChoice,
} from './destiny-pattern-growth-command'
export { createPendingDestinyPatternGrowth } from './destiny-pattern-growth'
export type {
  DestinyPatternGrowthTransactionSnapshot,
  PreparedDestinyPatternGrowthChoice,
  ResolveDestinyPatternGrowthChoiceResult,
} from './destiny-pattern-growth-command'
export type { DestinyPattern, DestinyPatternGrowthDirection } from './types'
