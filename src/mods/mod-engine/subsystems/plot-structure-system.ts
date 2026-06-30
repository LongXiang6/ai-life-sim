/**
 * @module plot-structure-system.ts
 * @description 情节结构系统 —— 管理叙事的情节阶段推进，为 AI 提供宏观结构约束
 * @mod mod-engine
 *
 * 设计理念：
 *   网文创作需要清晰的情节结构（铺垫→冲突升级→转折→高潮→收尾）。
 *   本系统通过本地状态机判定当前情节阶段，在 Prompt 中注入阶段引导，
 *   让 AI 叙事在宏观结构约束下自由发挥。
 *
 * 核心机制：
 *   1. 7 阶段状态机：setup → rising_action → climax_approach → climax → falling_action → resolution → new_chapter
 *   2. 阶段判定纯本地规则（回合数 + 子系统数据变化 + 闭环事件）
 *   3. Prompt 注入极简（~80字），不增加 AI 调用
 *   4. 含 enabled 开关，用户可选择性启用
 */

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import { getRoundSequence } from '@/foundation'
// mod-engine 使用 system-safety 的 clampNumber（含 safeNumber 保护）
import { clampNumber } from '../helpers/system-safety'



// ============================================================
// 类型定义
// ============================================================

/** 情节阶段 */
export type PlotPhase =
  | 'setup'           // 铺垫期 — 建立场景和人物关系
  | 'rising_action'   // 冲突升级 — 矛盾不断激化
  | 'climax_approach' // 转折前 — 张力逼近顶点
  | 'climax'          // 高潮 — 关键事件爆发
  | 'falling_action'  // 高潮回落 — 处理后果
  | 'resolution'      // 收尾 — 恢复平静
  | 'new_chapter'     // 新篇章 — 下一段剧情开始

/** 情节阶段标签 */
const PHASE_LABELS: Record<PlotPhase, string> = {
  setup: '铺垫期',
  rising_action: '冲突升级',
  climax_approach: '转折前夕',
  climax: '高潮',
  falling_action: '回落',
  resolution: '收尾',
  new_chapter: '新篇章',
}

/** 各阶段默认持续时间（轮次） */
const DEFAULT_PHASE_DURATIONS: Record<PlotPhase, { min: number; max: number }> = {
  setup: { min: 3, max: 8 },
  rising_action: { min: 4, max: 15 },
  climax_approach: { min: 1, max: 3 },
  climax: { min: 1, max: 1 },
  falling_action: { min: 1, max: 3 },
  resolution: { min: 2, max: 5 },
  new_chapter: { min: 1, max: 2 },
}

/** 情节结构状态 */
export interface PlotStructureState {
  enabled: boolean
  currentPhase: PlotPhase
  phaseRound: number
  chapterCount: number
  tensionLevel: number
  lastClimaxRound: number
  phaseHistory: Array<{ phase: PlotPhase; round: number }>,
}

// ============================================================
// 张力关卡键词（用于从叙事中检测张力信号）
// ============================================================

const TENSION_KEYWORDS: Record<string, number> = {
  // 高强度
  杀: 15, 死: 15, 毁灭: 15, 背叛: 12, 崩: 12, 袭: 10,
  决战: 15, 爆发: 12, 围攻: 10, 灾难: 12, 天劫: 15,
  // 中强度
  敌: 8, 战: 7, 威胁: 8, 危机: 8, 冲突: 7, 阴谋: 7,
  伤势: 7, 困境: 7, 险: 6, 逃: 6, 追: 6, 斗: 6,
  试探: 5, 暗流: 6, 压力: 7, 紧张: 6,
  // 低强度（日常）
  日常: -5, 平静: -5, 安逸: -5, 休息: -3, 闲: -3,
}

// ============================================================
// 阶段引导模板
// ============================================================

const PHASE_GUIDANCE: Record<PlotPhase, string> = {
  setup: '建立场景氛围和人物关系，展现角色的日常生活和初始状态，为后续发展做铺垫。避免过早引入重大冲突。',
  rising_action: '矛盾正在激化，冲突逐步升级。为即将到来的转折点积累张力。引入新的威胁或挑战，让角色面临越来越大的压力。',
  climax_approach: '张力逼近顶点，关键时刻即将到来。所有线索汇聚，角色面临最严峻的考验。营造紧张感和期待感。',
  climax: '这是剧情的高潮时刻！关键冲突爆发，角色做出决定性行动。场面要宏大、紧张、有冲击力。这是本轮叙事的核心。',
  falling_action: '高潮已经过去，展现冲突的后果和影响。角色在经历重大事件后的反应和调整。开始收束叙事线索。',
  resolution: '恢复平静，总结这一阶段的变化。展现角色从中获得的成长。为下一段剧情留下自然的过渡。',
  new_chapter: '开启新的篇章。引入新的场景、人物或目标。从之前的剧情自然过渡到新的起点。',
}

// ============================================================
// PlotStructureSystem
// ============================================================

export class PlotStructureSystem implements ISubSystem {
  readonly id = 'plot-structure' as const
  readonly mod = 'mod-engine' as const
  readonly label = '情节结构' as const
  readonly description = '管理叙事的情节阶段推进，为 AI 提供结构约束（可选子系统）' as const

  private state: PlotStructureState = {
    enabled: true,
    currentPhase: 'setup',
    phaseRound: 0,
    chapterCount: 1,
    tensionLevel: 30,
    lastClimaxRound: 0,
    phaseHistory: [],
  }

  private _lastProcessedRound = -1

  // ---- ISubSystem 接口 ----

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.buildPhaseGuidance(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    if (!this.state.enabled) {
      return {
        id: this.id,
        summary: '',
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }

    // 推进情节阶段
    this.advancePhase(context)

    return {
      id: this.id,
      summary: this.buildPhaseGuidance(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes`);
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`);
    }
    if (!changes.changes || typeof changes.changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes.changes`);
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`);
    }
    // 情节结构不接受外部变更，阶段由本地规则自行推进
  }

  reset(): void {
    this.state = {
      enabled: true,
      currentPhase: 'setup',
      phaseRound: 0,
      chapterCount: 1,
      tensionLevel: 30,
      lastClimaxRound: 0,
      phaseHistory: [],
    }
    this._lastProcessedRound = -1
  }

  // ---- 公共访问器 ----

  /** 获取当前阶段 */
  getCurrentPhase(): PlotPhase {
    return this.state.currentPhase
  }

  /** 获取张力水平 */
  getTensionLevel(): number {
    return this.state.tensionLevel
  }

  /** 获取情节状态 */
  getState(): PlotStructureState {
    return { ...this.state }
  }

  /** 设置是否启用 */
  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled
  }

  // ---- 核心方法：构建 Prompt 注入文本 ----

  /** 生成情节阶段引导文本（注入 Prompt） */
  buildPhaseGuidance(): string {
    if (!this.state.enabled) return ''

    const phase = this.state.currentPhase
    const label = PHASE_LABELS[phase]
    const guidance = PHASE_GUIDANCE[phase]
    const tension = this.state.tensionLevel
    const round = this.state.phaseRound

    return [
      `【当前情节阶段】${label}（第${round}轮）`,
      `- 张力值：${tension}/100`,
      `- 引导：${guidance}`,
      tension >= 70 ? '- ⚠ 注意：张力已突破高位，为高潮或转折做铺垫' : '',
      tension <= 20 ? '- ℹ 提示：张力较低，可以引入新的矛盾或冲突元素' : '',
    ].filter(Boolean).join('\n')
  }

  // ---- 私有方法 ----

  /** 推进情节阶段 */
  private advancePhase(context: RoundContext): void {
    this.state.phaseRound++

    // 从叙事中估算张力变化
    this.updateTension(context)

    // 检查是否需要转移阶段
    const nextPhase = this.shouldTransition(context)
    if (nextPhase) {
      this.performTransition(nextPhase, context.round.year)
    }
  }

  /** 转移阶段 */
  private performTransition(nextPhase: PlotPhase, round: number): void {
    this.state.phaseHistory.push({
      phase: this.state.currentPhase,
      round,
    })

    this.state.currentPhase = nextPhase
    this.state.phaseRound = 0

    if (nextPhase === 'climax') {
      this.state.lastClimaxRound = round
    }
    if (nextPhase === 'setup') {
      this.state.chapterCount++
    }

    // 高潮后重置部分张力
    if (nextPhase === 'falling_action') {
      this.state.tensionLevel = Math.max(20, this.state.tensionLevel - 40)
    }
    if (nextPhase === 'resolution') {
      this.state.tensionLevel = 20
    }
  }

  /** 判断是否应该进入下一阶段 */
  private shouldTransition(context: RoundContext): PlotPhase | null {
    const phase = this.state.currentPhase
    const durations = DEFAULT_PHASE_DURATIONS[phase]
    const directionModifier = 1.0

    const adjustedMin = Math.max(1, Math.round(durations.min * directionModifier))
    const adjustedMax = Math.max(adjustedMin, Math.round(durations.max * directionModifier))

    // 阶段特定转移条件
    switch (phase) {
      case 'setup':
        // 铺垫期：达到最小轮数 + 有事件触发时转移
        if (this.state.phaseRound >= adjustedMin && this.hasConflictSignal(context)) {
          return 'rising_action'
        }
        // 超过最大轮数强制转移
        if (this.state.phaseRound >= adjustedMax) {
          return 'rising_action'
        }
        break

      case 'rising_action':
        // 冲突升级：张力 ≥ 60 且 达到最小轮数 → 进入转折前
        if (this.state.tensionLevel >= 60 && this.state.phaseRound >= adjustedMin) {
          return 'climax_approach'
        }
        // 超过最大轮数强制转移
        if (this.state.phaseRound >= adjustedMax) {
          return 'climax_approach'
        }
        break

      case 'climax_approach':
        // 转折前：达到最小轮数后自动进入高潮
        if (this.state.phaseRound >= adjustedMin) {
          return 'climax'
        }
        break

      case 'climax':
        // 高潮只持续 1 轮
        return 'falling_action'

      case 'falling_action':
        if (this.state.phaseRound >= adjustedMin) {
          return 'resolution'
        }
        break

      case 'resolution':
        if (this.state.phaseRound >= adjustedMin) {
          return 'new_chapter'
        }
        break

      case 'new_chapter':
        if (this.state.phaseRound >= adjustedMin) {
          return 'setup'
        }
        break
    }

    return null
  }

  /** 检查上下文中有无冲突信号 */
  private hasConflictSignal(context: RoundContext): boolean {
    const summaries = Object.values(context.subsystemStates ?? {})
    const combinedText = summaries
      .map((s) => s.summary ?? '')
      .join('')

    // 检测冲突关键词
    const conflictKeywords = ['敌', '战', '冲突', '威胁', '挑衅', '攻击', '入侵', '危机', '阴谋', '陷害', '仇']
    return conflictKeywords.some((kw) => combinedText.includes(kw))
  }

  /** 更新张力水平 */
  private updateTension(context: RoundContext): void {
    // 从子系统摘要中估算张力变化
    const summaries = Object.values(context.subsystemStates ?? {})
    const combinedText = summaries
      .map((s) => s.summary ?? '')
      .join('')

    let delta = 0
    for (const [keyword, weight] of Object.entries(TENSION_KEYWORDS)) {
      if (combinedText.includes(keyword)) {
        delta += weight
      }
    }

    // 钳制变化量
    // 紧张度变化不超过 [-10, 15]，防止单轮跳变过大
    delta = clampNumber(delta, -10, 15)

    // 阶段影响基础衰减
    const phaseDecay = this.getPhaseTensionDecay()

    // 紧张度限制在 [0, 100]
    this.state.tensionLevel = clampNumber(
      this.state.tensionLevel + delta + phaseDecay,
      0,
      100,
    )
  }

  /** 获取阶段的基础张力衰减 */
  private getPhaseTensionDecay(): number {
    switch (this.state.currentPhase) {
      case 'setup': return 2      // 铺垫期张力自然积累
      case 'rising_action': return 3 // 冲突期张力快速上升
      case 'climax_approach': return 5
      case 'climax': return 0      // 高潮期不减
      case 'falling_action': return -8
      case 'resolution': return -10
      case 'new_chapter': return -3
      default: return 0
    }
  }
}

/** 全局单例 */
export const plotStructure = new PlotStructureSystem()
