/**
 * @module EducationSystem
 * @description 教育子系统（已清空待恢复）
 * @mod mod-culture
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：管理教育制度类型、识字率增长、知识积累、科研产出与教育普及度。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 getAgeYearsDelta 年制→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[education] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class EducationSystem implements ISubSystem {
  readonly id = 'education' as const
  readonly mod = 'mod-culture' as const
  readonly label = '教育' as const
  readonly description = '管理教育制度类型、识字率增长、知识积累、科研产出与教育普及度（已清空待恢复）' as const

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
