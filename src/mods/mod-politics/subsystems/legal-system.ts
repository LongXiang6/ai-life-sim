/**
 * @module LegalSystem
 * @description 法律子系统（已清空待恢复）
 * @mod mod-politics
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：管理法律体系类型、法律条目、执法力度与腐败程度。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 getAgeYearsDelta 年制→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[legal] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class LegalSystem implements ISubSystem {
  readonly id = 'legal' as const
  readonly mod = 'mod-politics' as const
  readonly label = '法律' as const
  readonly description = '管理法律体系类型、法律条目、执法力度与腐败程度（已清空待恢复）' as const

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
