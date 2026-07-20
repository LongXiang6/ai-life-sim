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
 * 由 orchestrator 注入 PromptContext.userInstruction → AI user prompt 的 instruction 字段。
 */

import type { LifeStageId } from '@/mods/mod-character'
import type { TimeStep } from '@/foundation'

// ═══════════════════ 类型定义 ═══════════════════

export interface NarrativeHintInput {
  currentAge: number
  maxAge: number
  startingAge: number
  round: number
  recentEvents: Array<{ narrative?: string; age: number }>
  lastPlayerChoice?: string
  forceBranch: boolean
  branchJustResolved: boolean
  consecutiveSameGoalRounds: number
  /** 当前时间步进（替代旧 timeSkipYears，支持多粒度文本生成） */
  timeStep: TimeStep
  narrativeStyle?: string
  lifeStage: LifeStageId
}

export interface NarrativeHints {
  mandatory: string[]
  optional: string[]
}

// ═══════════════════ 信息优先级常量（注入 worldview rules 或首轮 instruction） ═══════════════════

/**
 * 废弃项目 immutableContext 中的优先级层级，移植为常量。
 * 注入方式：首轮通过 worldRules 或 instruction 注入，后续轮次可选不重复。
 */
export const INFORMATION_PRIORITY_RULE = [
  '【信息优先级】冲突时按此裁决：',
  '1[最高] 世界观逻辑（世界设定 + 世界标签 + 世界法则）= 剧情合理性（因果链、事件连锁反应、人设一致性）',
  '2 基础属性（体魄/心智/悟性/魅力/气运/善恶/健康）',
  '3 生命状态（年龄 + 健康值 + 寿命上限）',
  '4 角色身份/背景',
  '5[最低] 隐藏命格',
  '世界观与剧情合理性同优先级——世界设定的核心规则不可突破，剧情在其边界内追求因果、变化和可玩性。',
].join(' > ')

// ═══════════════════ hint 子函数 ═══════════════════

// --- 1. 强制分叉 ---
function hintForceBranch(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  if (input.forceBranch) {
    const agency = input.currentAge < 6
      ? '角色尚无成人式自主能力：把选择写成照料者、监护人或所处环境替角色作出的家庭层面决定；选项仍须是会长期改变你的核心关系、身份、居所、照料安排或关键机会的不同后果，不能把婴儿的本能反应伪装成选择。'
      : '选项必须是角色在当前能力与处境下确实能作出的选择，不能把日常动作、拖延或不同措辞伪装成不同人生方向。'
    hints.push(`必须生成合格命运分支：“命运分支”为真，提供“分支标题”与二至四个不同长期后果的“分支选项”；“重要程度”为高、“不可逆”为真、“叙事语域”为命运，高潮收束可以为传承。${agency}`)
  }
  if (input.currentAge === 3 && input.startingAge === 0) {
    hints.push('3岁节点如生成分支，仍须是照料、归属、居所或关键机会等不可逆的家庭层面命运转折；普通玩耍和短暂偏好不得生成命运分支。')
  }
  if (input.round > 0 && input.round % 15 === 0 && !input.branchJustResolved) {
    hints.push(
      `已推进${input.round}轮，若当前确有不可逆的人生转折，可以生成命运分支并提供二至四个各有特色的方向；不得为满足轮次机械制造分支`,
    )
  }
  return hints
}

// --- 2. 分支解决 + 玩家选择 ---
function hintBranchResolved(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  if (input.branchJustResolved) {
    hints.push(
      '上轮玩家做出重要选择。叙事不应违背该方向。结果由角色实力、环境和运气决定，可以成功或取得阶段进展，也可以因真实条件失败、转折或付出代价；不得为了制造阻力压低已满足条件的行动',
    )
  }
  if (input.lastPlayerChoice) {
    const choiceLabel =
      input.currentAge < 6
        ? `家庭层面选择"${input.lastPlayerChoice}"`
        : `玩家选择了"${input.lastPlayerChoice}"`
    if (input.branchJustResolved) {
      hints.push(
        `${choiceLabel}。请结合世界规则、角色能力、资源和本轮时间跨度判断行动规模：小型行动可在本轮完成；中大型目标只呈现当前阶段的行动、进展、必要阻碍与后果，并在“语义信号”的“行动规模”中同步记录。`,
      )
    } else if (!input.branchJustResolved) {
      const progressLabel =
        input.currentAge < 6
          ? `家庭持续推进：${input.lastPlayerChoice}`
          : `持续推进：${input.lastPlayerChoice}`
      hints.push(
        `${progressLabel}。根据前序因果写出进展、具体问题、意外收获或人际关系变化；不要为延长目标重复制造同类阻碍`,
      )
    }
  }
  return hints
}

// --- 3. 场景跳跃（根据 timeStep.unit 生成粒度匹配的跳转提示） ---
function hintSceneJump(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  const prevEvent = input.recentEvents[input.recentEvents.length - 1]
  if (
    prevEvent?.age !== undefined &&
    input.currentAge > prevEvent.age
  ) {
    hints.push(
      `距上次事件已过${input.currentAge - prevEvent.age}年，优先体现新阶段最有因果价值的变化，例如机会、关系、能力、处境或合理压力，再选择一个新的剧情节点，避免延续上次事件的同一场景`,
    )
  }

  const { unit, value } = input.timeStep
  const amount = value || 1 // 防御 value=0 的异常情况（旧版 timeSkipYears > 0 等价守卫）

  // 根据时间粒度生成不同的跳转提示，防止 AI 输出与粒度不匹配的内容
  switch (unit) {
    case 'day':
      hints.push(
        amount === 1
          ? '推进1天。近景/现场视角：写当天的一次具体行动、对话或突发状况，强调即时反馈；收尾优先给出直接结果或新的小问题'
          : `推进${amount}天。连续日近景视角：体现起始状况、期间变化与结束节点，不要只写最后一天`,
      )
      break
    case 'month':
      hints.push(
        amount === 1
          ? '推进1个月。中近景视角：先点出本月最重要的变化、机会、目标推进或关系变化，再落到一件代表性小事件；这件事包含角色行动、发展和可见后果，只有因果需要时才写阻力，少写月度清单和纯心理余味'
          : `推进${amount}个月。跨月阶段视角：体现数月内的积累、转折与当前月后果，不要只写最后一个月`,
      )
      break
    case 'season':
      hints.push(
        amount === 1
          ? '推进1个季度。中景视角：体现这一季的环境、制度或人际变化，再写一个改变关系、目标或处境的关键节点；结尾优先落到阶段性后果'
          : `推进${amount}个季度。跨季度中景视角：按季节、制度或关系的阶段变化串起一个核心因果，结尾落到当前季度后果，不要把跨度写成同一季的一幕`,
      )
      break
    case 'year':
    default:
      hints.push(
        amount === 1
          ? '时间推进1年。先确定年度主要变化或你要推进的目标，随后只写一个代表性现场中的行动、发展与可见后果；只有既有因果需要时才写阻力，年度背景最多一句，禁止再写第二个季节、地点或独立日常'
          : `时间跳过${amount}年。完整覆盖起点、期间阶段变化与当前节点；围绕同一条主要因果写出长期改变，代表性节点必须前后承接，不要只写目标年份、逐年记流水账或拼接独立生活切片`,
      )
      break
  }

  return hints
}

// --- 4. 寿命提醒 ---
function hintLifespanReminder(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  const maxAge = input.maxAge
  const currentAge = input.currentAge
  if (maxAge <= 0) return hints
  const pct = currentAge / maxAge

  if (pct >= 0.85) {
    hints.push(
      `【寿命警告】角色逼近寿命上限(${maxAge}岁)，当前${currentAge}岁，步入暮年后健康每况愈下。若健康值极低（重病/重伤缠身），叙事可自然走向生命终点——衰老本身不强制结局，但严重疾病足以致命。`,
    )
  } else if (pct >= 0.5) {
    hints.push(
      `【寿命提醒】角色预期寿命${maxAge}岁，当前${currentAge}岁，距老年尚早。除非遭遇致命危机或健康值严重下降，不得以年迈为由结束生命。`,
    )
  } else if (pct < 0.1 && currentAge <= 3 && currentAge > 0) {
    hints.push(
      `【寿命提醒】角色预期寿命${maxAge}岁，当前${currentAge}岁，非常年轻，严禁以年龄为由触发结局。`,
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
      ...hintLifespanReminder(input),
    ],
    optional: [
      ...hintBranchResolved(input),
      ...hintSceneJump(input),
    ],
  }
}
