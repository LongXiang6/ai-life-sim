/**
 * @module subsystem-base.ts
 * @description 子系统抽象基类 —— 统一子系统必实现方法、共享工具方法，实现 ISubSystemV2
 * @mod core
 *
 * 背景：模拟系统全面重写（2026-07-04 起，`ai-life-sim/docs/simulation-rewrite-architecture.md` §二）。
 * 此前 74 个子系统各自 `implements ISubSystem`：有的读 `getAgeYearsDelta`、有的不读；
 * 跨系统数据用 `as Record<string, unknown>` 强转；`applyChanges` 有的抛异常有的静默忽略。
 * 引入本基类后，AI 恢复/新建子系统时只需看 `abstract` 标记的方法即为必做项。
 *
 * 为什么 implements ISubSystemV2 而不是更早的 ISubSystem：
 * - V2 新增的 collectStateUpdate/collectStateFinalFix 两个可选方法（三回合加载，
 *   吸收 Factorio data.lua → data-updates.lua → data-final-fixes.lua 设计）已被
 *   6 个真实子系统采用，包括从未清空过的 `mod-character/subsystems/lifespan-system.ts`，
 *   本基类必须支持它们，因此实现 ISubSystemV2（继承自 ISubSystem）而非仅 V1。
 * - V3（ISubSystemV3 的 ReadonlyRoundContext/WritableRoundContext 泛型阶段隔离）目前
 *   项目内零采用（仅类型声明，无任何子系统或引擎代码引用），暂不引入，避免无人使用的
 *   额外复杂度——待实际有子系统需要编译期阶段隔离时再评估升级。
 *
 * daysPassed 字段说明：RoundContext 已正式扩展 `daysPassed`/`totalDays` 两个字段
 * （2026-07 时间引擎重写落地，取代旧的 ageYearsDelta/simulationTicks/calendarDaysDelta）。
 * TimeSystem 是这两个字段的唯一写入者，子系统只读。getDaysPassed() 保留运行时非空校验，
 * 防止上游未正确注入 context 时子系统按 0 天静默推进。
 */

import type { ISubSystemV2, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'

export abstract class BaseSubsystem implements ISubSystemV2 {
  // ==================== 四个声明（每个子系统必填） ====================
  abstract readonly id: string
  abstract readonly mod: string
  abstract readonly label: string
  abstract readonly description: string

  // ==================== 三个必实现方法 ====================
  abstract collectState(context: RoundContext): SubSystemState
  abstract applyChanges(changes: SubSystemChanges, context: RoundContext): void
  abstract reset(): void

  // ==================== 可选方法（V1，默认空实现） ====================

  /** 本地模拟推进（非叙事回合的纯规则计算）。不实现则子系统只在叙事回合响应。 */
  advance(_context: RoundContext): void {}

  // ==================== 可选方法（V2，三回合加载，默认无操作） ====================

  /** Round 2 收集：在所有子系统 Round 1 collectState 完成后执行，可基于其他系统最新状态修正自身 */
  collectStateUpdate(_context: RoundContext): SubSystemState | null {
    return null
  }

  /** Round 3 收集：全局一致性修复（如总人口不为负） */
  collectStateFinalFix(_context: RoundContext): SubSystemState | null {
    return null
  }

  /**
   * 生成注入 AI Prompt 的额外格式化文本（非 ISubSystem/V2 接口方法，项目内约定的扩展点）。
   * 多数子系统不需要覆盖——collectState 返回的 summary 已足够。
   */
  formatForPrompt(_context?: RoundContext): string {
    return ''
  }

  // ==================== 共享工具方法（直接调用，不需要重写） ====================

  /** 数值限幅到 [min, max] 区间 */
  protected clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  /**
   * 时间读取唯一入口——返回本轮推进的整数天数。
   * daysPassed 缺失时抛出而非静默跳过，因为这意味着时间引擎未正确注入 context，
   * 属于上游 bug，不应该被下游悄悄吞掉导致子系统按 0 天推进。
   */
  protected getDaysPassed(context: RoundContext): number {
    if (context.daysPassed === undefined || context.daysPassed === null) {
      throw new Error(
        `[${this.id}] RoundContext.daysPassed 未设置 —— 时间引擎是否正确注入？`
      )
    }
    return context.daysPassed
  }

  /**
   * 类型安全读取另一个子系统的当前数据（配合 foundation/subsystem-contracts/ 契约类型使用）。
   * 注意：此转换是 TypeScript 编译期约束，运行时不做 schema 校验——数据正确性由
   * "契约文件由数据提供方维护，消费方只读不写"的约定保证，而非运行时强制。
   */
  protected readSubsystem<T>(context: RoundContext, subsystemId: string): T | undefined {
    const state = context.subsystemStates[subsystemId]
    if (!state?.data) return undefined
    return state.data as T
  }
}
