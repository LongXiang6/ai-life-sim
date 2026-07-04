/**
 * @module MonsterSystem
 * @description 怪物子系统（已清空待恢复）
 * @mod mod-power-system
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：按世界观管理怪物种类池、区域威胁等级、生态演化与遭遇判定。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 getAgeYearsDelta/consumeSimulationYears 年制→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[monster] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class MonsterSystem implements ISubSystem {
  readonly id = 'monster' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '怪物生态' as const
  readonly description = '按世界观管理怪物种类池、区域威胁等级、生态演化与遭遇判定（已清空待恢复）' as const

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
