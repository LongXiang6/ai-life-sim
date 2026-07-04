/**
 * @module EcologySystem
 * @description 生态系统子系统（已清空待恢复）
 * @mod mod-environment-ecology
 *
 * ===== 清空说明（模拟系统全面重写 2026-07）=====
 * 抛错桩。属于【④ 剩余模拟系统段】（→ mod-spec-rewrite-tiers.md），将在该段恢复。
 * 恢复后的职责：管理生物多样性指数、物种种群波动、濒危标记、灭绝检测与入侵物种扩散。
 * 恢复时 collectState 读 this.getDaysPassed(context)（旧代码 getAgeYearsDelta 年制→改日制）。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

const CLEARED = '[ecology] 子系统已清空，待【④ 剩余模拟系统段】恢复（simulation-rewrite）'

export class EcologySystem implements ISubSystem {
  readonly id = 'ecology' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '生态' as const
  readonly description = '管理生物多样性指数、物种种群波动、濒危标记、灭绝检测与入侵物种扩散（已清空待恢复）' as const

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
