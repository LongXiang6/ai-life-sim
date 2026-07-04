/**
 * @module PersonalAbilitySystem
 * @description 个人能力子系统（已清空待恢复）
 * @mod mod-culture
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：管理技能经验/升级/衰退、知识遗忘/复习、技能上限。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 getAgeYearsDelta 年制→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[personal-ability] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class PersonalAbilitySystem implements ISubSystem {
  readonly id = 'personal-ability' as const
  readonly mod = 'mod-culture' as const
  readonly label = '个人能力' as const
  readonly description = '管理技能经验/升级/衰退、知识遗忘/复习、技能上限（已清空待恢复）' as const

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
