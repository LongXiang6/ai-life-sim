/**
 * @module FactionDynamicsSystem
 * @description 派系动态子系统（已清空待恢复）
 * @mod mod-politics
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：管理派系影响力变化、派系间关系网、玩家加入派系与贡献晋升、新派系涌现与涨跌状态。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 consumeSimulationYears 年累加器→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[faction-dynamics] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class FactionDynamicsSystem implements ISubSystem {
  readonly id = 'faction-dynamics' as const
  readonly mod = 'mod-politics' as const
  readonly label = '派系动态' as const
  readonly description = '管理派系影响力变化、派系间关系网、玩家加入派系与贡献晋升、新派系涌现与涨跌状态（已清空待恢复）' as const

  collectState(_context: RoundContext): SubSystemState {
    throw new Error(CLEARED)
  }

  applyChanges(_changes: SubSystemChanges, _context: RoundContext): void {
    throw new Error(CLEARED)
  }

  reset(): void {
    // 已清空，无内部状态可重置
  }
}
