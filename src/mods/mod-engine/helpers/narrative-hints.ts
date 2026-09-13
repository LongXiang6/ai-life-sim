/**
 * Purpose: Build round-specific narrative hints from the current life state.
 * Owner: mod-engine
 * Responsibility: Dynamic hint projection only; fixed writing rules remain in the protected Prompt asset.
 *
 * @module narrative-hints.ts
 * @description 叙事动态提示词生成器 —— 移植自废弃项目 life-sim-narrative.ts + life-sim-lifecycle.ts
 * @mod mod-engine
 *
 * 废弃项目源文件：
 *   - D:\AI\废弃项目\src\lib\prompts\narrative\life-sim-narrative.ts（hint 生成逻辑）
 *   - D:\AI\废弃项目\src\lib\prompts\narrative\life-sim-lifecycle.ts（lifespan）
 *
 * 职责：根据当前回合状态生成 mandatory（必遵）与 optional（参考）两类 hint；
 * 主叙事数据层不再接收这些 hint，只有玩家明确行动进入当前状态字段。
 */

// ═══════════════════ 类型定义 ═══════════════════

export interface NarrativeHintInput {
  currentAge: number
  startingAge: number
  recentEvents: Array<{ narrative?: string; age: number }>
  forceBranch: boolean
}

export interface NarrativeHints {
  mandatory: string[]
  optional: string[]
}

// ═══════════════════ hint 子函数 ═══════════════════

// --- 1. 强制分叉 ---
function hintForceBranch(input: NarrativeHintInput): string[] {
  if (!input.forceBranch) return []
  const agency = input.currentAge === 3 && input.startingAge === 0
    ? '3 岁节点由照料、归属、居所或关键机会等家庭决定承载。'
    : input.currentAge < 6
      ? '角色当前的决定由照料者、监护人或所处环境承载。'
      : '分叉由角色在当前能力与处境下能够作出的决定承载。'
  return [`本轮需要出现一个命运分支。${agency}高优先级事实决定本轮可成立的具体分叉内容。`]
}

// --- 2. 人生阶段跨越；具体时间尺度只由 time-scale-narrative.ts 拥有。 ---
function hintLifeStageTransition(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  const prevEvent = input.recentEvents[input.recentEvents.length - 1]
  if (
    prevEvent?.age !== undefined &&
    input.currentAge > prevEvent.age
  ) {
    hints.push(
      `距上次事件已过${input.currentAge - prevEvent.age}年；上次事件是本轮开端前已经成立的背景，当前年龄是本轮结束节点`,
    )
  }
  return hints
}

// ═══════════════════ 主入口 ═══════════════════

/** 构建本轮叙事动态 hints（mandatory + optional 两类） */
export function buildNarrativeHints(input: NarrativeHintInput): NarrativeHints {
  return {
    mandatory: [
      ...hintForceBranch(input),
    ],
    optional: [
      ...hintLifeStageTransition(input),
    ],
  }
}
