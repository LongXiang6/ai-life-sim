/**
 * @module ConflictCycleSystem
 * @description 冲突周期子系统（已清空待恢复）
 * @mod mod-politics
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：管理六阶段冲突推进、对手系统与戏剧张力（可选子系统）。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 getAgeYearsDelta 年制→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[conflict-cycle] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class ConflictCycleSystem implements ISubSystem {
  readonly id = 'conflict-cycle' as const
  readonly mod = 'mod-politics' as const
  readonly label = '冲突周期' as const
  readonly description = '管理六阶段冲突推进、对手系统与戏剧张力（可选子系统，已清空待恢复）' as const

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
