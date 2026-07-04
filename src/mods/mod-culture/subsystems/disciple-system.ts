/**
 * @module DiscipleSystem
 * @description 弟子子系统（已清空待恢复）
 * @mod mod-culture
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 本子系统被清空为「抛错桩」——collectState/applyChanges 抛出，强制暴露仍依赖它的调用方
 * （引擎 Round1/2/3 收集与 RoundCommit 均有 try-catch 兜底，抛出被捕获记录、不致回合崩溃）。
 * 属于【④ 剩余模拟系统段】（→ .agents/skills/mod-dev-skill/resources/mod-spec-rewrite-tiers.md），将在该段恢复。
 *
 * 恢复后的职责：管理弟子能力成长、忠诚度变化、生命周期与成名陨落。
 * 恢复时（参照 templates/subsystem.template.ts，extends BaseSubsystem）：
 *   collectState 读 this.getDaysPassed(context)（旧代码 getAgeYearsDelta 年制→改日制）推进 → summary → { id, summary, data }
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[disciple] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class DiscipleSystem implements ISubSystem {
  readonly id = 'disciple' as const
  readonly mod = 'mod-culture' as const
  readonly label = '弟子门徒' as const
  readonly description = '管理弟子能力成长、忠诚度变化、生命周期与成名陨落（已清空待恢复）' as const

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
