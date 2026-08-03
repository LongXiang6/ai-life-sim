/**
 * @module narrative-hints.ts
 * @description 叙事动态提示词生成器 —— 移植自废弃项目 life-sim-narrative.ts + life-sim-lifecycle.ts
 * @mod mod-engine
 *
 * 废弃项目源文件：
 *   - D:\AI\废弃项目\src\lib\prompts\narrative\life-sim-narrative.ts（hint 生成逻辑）
 *   - D:\AI\废弃项目\src\lib\prompts\narrative\life-sim-lifecycle.ts（lifespan）
 *
 * 职责：根据当前回合状态生成 mandatory（必遵）与 optional（参考）两类 hint，
 * 由 orchestrator 注入 PromptContext.roundSystemGuidanceText，再由本地引导编译器投影到 AI 输入。
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
  const hints: string[] = []
  if (input.forceBranch) {
    const agency = input.currentAge < 6
      ? '角色尚无成人式自主能力：把选择写成照料者、监护人或所处环境替角色作出的家庭层面决定；选项仍须是会长期改变你的核心关系、身份、居所、照料安排或关键机会的不同后果，不能把婴儿的本能反应伪装成选择。'
      : '选项必须是角色在当前能力与处境下确实能作出的选择，不能把日常动作、拖延或不同措辞伪装成不同人生方向。'
    hints.push(`本轮围绕会长期改变身份、核心关系、居所、目标或关键机会的选择现场推进，并尽量提供二至四个不同方向。${agency}若高优先级事实不支持真实分叉，仍须完整写完正文。`)
  }
  if (input.currentAge === 3 && input.startingAge === 0) {
    hints.push('3岁节点如生成分支，仍须是照料、归属、居所或关键机会等不可逆的家庭层面命运转折；普通玩耍和短暂偏好不得生成命运分支。')
  }
  return hints
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
      `距上次事件已过${input.currentAge - prevEvent.age}年，按本轮时间尺度呈现这段跨度内已经成立的阶段变化与当前结果，不得继续停留在上次事件的同一现场`,
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
