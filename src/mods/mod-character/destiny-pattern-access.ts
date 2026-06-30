/**
 * @module destiny-pattern-access.ts
 * @description 命格子系统页面级懒加载入口（与 subsystems barrel 分离）
 * @mod mod-character
 */

import { DestinyPatternSystem } from './subsystems/destiny-pattern-system'

let _destinyPatternSystem: DestinyPatternSystem | undefined

/** 命格子系统懒加载单例 —— 页面级共享状态，避免模块顶层实例化 */
export function getDestinyPatternSystem(): DestinyPatternSystem {
  if (!_destinyPatternSystem) {
    _destinyPatternSystem = new DestinyPatternSystem()
  }
  return _destinyPatternSystem
}

export {
  loadDestinyPatternPool,
  saveDestinyPatternPool,
} from './utils/destiny-pattern-pool-cache'
export {
  estimateDestinyPatternTokenBudget,
  resolveDestinyPatternWorldTags,
} from './prompts/destiny-pattern-context'
