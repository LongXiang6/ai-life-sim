/**
 * @module plot-structure-system.ts
 * @description 情节结构系统 —— 管理叙事的情节阶段推进，为 AI 提供宏观结构约束
 * @mod mod-engine
 *
 * 设计理念：
 *   连续叙事需要清晰的情节结构（铺垫→推进升温→转折→高潮→收尾）。
 *   本系统通过本地状态机判定当前情节阶段，在 Prompt 中注入阶段引导，
 *   让 AI 叙事在宏观结构约束下自由发挥。
 *
 * 核心机制：
 *   1. 7 阶段状态机：setup → rising_action → climax_approach → climax → falling_action → resolution → new_chapter
 *   2. 阶段判定纯本地规则（回合数 + 子系统数据变化 + 闭环事件）
 *   3. Prompt 注入极简（~80字），不增加 AI 调用
 *   4. 含 enabled 开关，用户可选择性启用
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import { BaseSubsystem } from '@/core'
import type { NarrativeSemanticSignals } from '../helpers/narrative-semantic-signals'
// mod-engine 使用 system-safety 的 clampNumber（含 safeNumber 保护）
import { clampNumber } from '../helpers/system-safety'



// ============================================================
// 类型定义
// ============================================================

/** 情节阶段 */
export type PlotPhase =
  | 'setup'           // 铺垫期 — 建立场景和人物关系
  | 'rising_action'   // 推进升温 — 目标、机会或矛盾逐步加深
  | 'climax_approach' // 转折前 — 张力逼近顶点
  | 'climax'          // 高潮 — 关键事件爆发
  | 'falling_action'  // 高潮回落 — 处理后果
  | 'resolution'      // 收尾 — 恢复平静
  | 'new_chapter'     // 新篇章 — 下一段剧情开始

/** 情节阶段标签 */
const PHASE_LABELS: Record<PlotPhase, string> = {
  setup: '铺垫期',
  rising_action: '推进升温',
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
  lastConflictIntensity: number
  consecutiveConflictRounds: number
  lastNarrativeRegister: NarrativeSemanticSignals['narrativeRegister']
  /** 最近一次已接受叙事所关联的历史事件账本条目。 */
  lastHistoricalEventIds: string[]
  phaseHistory: Array<{ phase: PlotPhase; round: number; contextId?: string }>,
}

function normalizeHistoricalEventIds(ids?: readonly string[]): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))]
}

// ============================================================
// 阶段引导模板
// ============================================================

const PHASE_GUIDANCE: Record<PlotPhase, string> = {
  setup: '建立场景氛围和人物关系，展现角色的日常生活和初始状态，为后续发展做铺垫。避免过早引入重大冲突。',
  rising_action: '主线正在推进，既有目标、机会或矛盾逐步加深。通过新信息、能力运用、关系变化或因果挑战提高投入感；不得为增加张力机械制造威胁、审查或针对。',
  climax_approach: '关键转折正在逼近，既有条件、线索和关系开始汇聚。营造期待感，但不得临时添加与前序无关的障碍。',
  climax: '关键转折发生，角色采取决定性行动，既可突破、兑现或获得成果，也可承受由既有因果带来的冲突与代价。让本轮成为当前主线的核心。',
  falling_action: '关键转折已经发生，展现成果、代价和后续影响。角色作出反应与调整，开始收束既有叙事线索。',
  resolution: '恢复平静，总结这一阶段的变化。展现角色从中获得的成长。为下一段剧情留下自然的过渡。',
  new_chapter: '开启新的篇章。引入新的场景、人物或目标。从之前的剧情自然过渡到新的起点。',
}

// ============================================================
// PlotStructureSystem
// ============================================================

export class PlotStructureSystem extends BaseSubsystem {
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
    lastConflictIntensity: 0,
    consecutiveConflictRounds: 0,
    lastNarrativeRegister: 'life',
    lastHistoricalEventIds: [],
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
      lastConflictIntensity: 0,
      consecutiveConflictRounds: 0,
      lastNarrativeRegister: 'life',
      lastHistoricalEventIds: [],
      phaseHistory: [],
    }
    this._lastProcessedRound = -1
  }

  /** 预生成会临时推进情节阶段；结束后必须完整恢复真实时间线。 */
  capturePreviewState(): unknown {
    return structuredClone({
      state: this.state,
      lastProcessedRound: this._lastProcessedRound,
    })
  }

  restorePreviewState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as {
      state?: PlotStructureState
      lastProcessedRound?: number
    }
    if (value.state) {
      this.state = {
        ...structuredClone(value.state),
        lastHistoricalEventIds: normalizeHistoricalEventIds(value.state.lastHistoricalEventIds),
      }
    }
    if (typeof value.lastProcessedRound === 'number') {
      this._lastProcessedRound = value.lastProcessedRound
    }
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

  getConsecutiveConflictRounds(): number {
    return this.state.consecutiveConflictRounds
  }

  /** 消费主叙事 AI 的结构化语义，不读取正文。 */
  recordNarrativeSignals(
    signals: NarrativeSemanticSignals,
    historicalEventIds?: readonly string[],
  ): void {
    this.state.lastConflictIntensity = signals.conflictIntensity
    this.state.lastNarrativeRegister = signals.narrativeRegister
    this.state.lastHistoricalEventIds = normalizeHistoricalEventIds(historicalEventIds)
    this.state.consecutiveConflictRounds = signals.conflictIntensity >= 40
      ? this.state.consecutiveConflictRounds + 1
      : 0
    this.state.tensionLevel = clampNumber(
      this.state.tensionLevel + signals.tensionDelta,
      0,
      100,
    )
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
      `张力：${tension}/100`,
      `引导：${guidance}`,
      tension >= 70 ? '高张力：为关键转折做铺垫，沿用既有因果，不新增无关障碍。' : '',
      tension <= 20 ? '低张力：可以引入新目标、机会、发现、欲望或关系变化；不要求制造冲突。' : '',
    ].filter(Boolean).join('\n')
  }

  // ---- 私有方法 ----

  /** 推进情节阶段 */
  private advancePhase(context: RoundContext): void {
    this.state.phaseRound++

    this.applyPhaseTensionDrift()

    // 检查是否需要转移阶段
    const nextPhase = this.shouldTransition()
    if (nextPhase) {
      this.performTransition(nextPhase, getRoundSequence(context), context.contextId)
    }
  }

  /** 转移阶段 */
  private performTransition(nextPhase: PlotPhase, round: number, contextId?: string): void {
    this.state.phaseHistory.push({
      phase: this.state.currentPhase,
      round,
      contextId,
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
  private shouldTransition(): PlotPhase | null {
    const phase = this.state.currentPhase
    const durations = DEFAULT_PHASE_DURATIONS[phase]
    const directionModifier = 1.0

    const adjustedMin = Math.max(1, Math.round(durations.min * directionModifier))
    const adjustedMax = Math.max(adjustedMin, Math.round(durations.max * directionModifier))

    // 阶段特定转移条件
    switch (phase) {
      case 'setup':
        // 铺垫期：达到最小轮数 + 有事件触发时转移
        if (this.state.phaseRound >= adjustedMin && this.state.lastConflictIntensity >= 30) {
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

  /** 阶段自身的确定性张力漂移；叙事语义增量由 recordNarrativeSignals 提供。 */
  private applyPhaseTensionDrift(): void {
    this.state.tensionLevel = clampNumber(
      this.state.tensionLevel + this.getPhaseTensionDecay(),
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
