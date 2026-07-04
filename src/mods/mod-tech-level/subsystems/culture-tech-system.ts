/**
 * @module CultureTechSystem
 * @description 文化技术子系统（已清空待恢复）
 * @mod mod-tech-level
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：管理技术等级 1-10 逐年积累、6 类 54 思潮触发消退、知识加成与工作质量加成。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 consumeSimulationYears 年累加器→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[culture-tech] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class CultureTechSystem implements ISubSystem {
  readonly id = 'culture-tech' as const
  readonly mod = 'mod-tech-level' as const
  readonly label = '文化技术' as const
  readonly description = '管理技术等级 1-10 逐年积累、6 类 54 思潮触发消退、知识加成与工作质量加成（已清空待恢复）' as const

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
