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
 *   2. 阶段判定纯本地规则（规范时间 + 子系统数据变化 + 闭环事件）
 *   3. Prompt 注入极简（~80字），不增加 AI 调用
 *   4. 含 enabled 开关，用户可选择性启用
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import { BaseSubsystem } from '@/core/subsystem-base'
import type { NarrativeSemanticSignals } from '../helpers/narrative-semantic-signals'
// mod-engine 使用 system-safety 的 clampNumber（含 safeNumber 保护）
import { clampNumber } from '../helpers/system-safety'
import { CALENDAR } from '../constants'



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

/** 各阶段默认持续时间。年只用于配置可读性，运行判定统一换算为规范天数。 */
const DEFAULT_PHASE_DURATIONS: Record<PlotPhase, { minDays: number; maxDays: number }> = {
  setup: { minDays: 3 * CALENDAR.DAYS_PER_YEAR, maxDays: 8 * CALENDAR.DAYS_PER_YEAR },
  rising_action: { minDays: 4 * CALENDAR.DAYS_PER_YEAR, maxDays: 15 * CALENDAR.DAYS_PER_YEAR },
  climax_approach: { minDays: CALENDAR.DAYS_PER_YEAR, maxDays: 3 * CALENDAR.DAYS_PER_YEAR },
  climax: { minDays: CALENDAR.DAYS_PER_YEAR, maxDays: CALENDAR.DAYS_PER_YEAR },
  falling_action: { minDays: CALENDAR.DAYS_PER_YEAR, maxDays: 3 * CALENDAR.DAYS_PER_YEAR },
  resolution: { minDays: 2 * CALENDAR.DAYS_PER_YEAR, maxDays: 5 * CALENDAR.DAYS_PER_YEAR },
  new_chapter: { minDays: CALENDAR.DAYS_PER_YEAR, maxDays: 2 * CALENDAR.DAYS_PER_YEAR },
}

/** 情节结构状态 */
export interface PlotStructureState {
  enabled: boolean
  currentPhase: PlotPhase
  phaseStartedAtTotalDays: number
  phaseElapsedDays: number
  chapterCount: number
  tensionLevel: number
  lastClimaxTotalDays: number
  lastConflictIntensity: number
  consecutiveConflictRounds: number
  lastNarrativeRegister: NarrativeSemanticSignals['narrativeRegister']
  /** 最近一次已接受叙事所关联的历史事件账本条目。 */
  lastHistoricalEventIds: string[]
  phaseHistory: Array<{
    phase: PlotPhase
    roundSequence: number
    totalDays: number
    contextId?: string
  }>,
}

function normalizeHistoricalEventIds(ids?: readonly string[]): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))]
}

// ============================================================
// 阶段引导模板
// ============================================================

const PHASE_GUIDANCE: Record<PlotPhase, string> = {
  setup: '建立当前场景、人物关系和初始状态，让后续发展拥有清楚起点，不预设必须发生哪类事件。',
  rising_action: '主线正在推进，既有目标、机会、关系或问题逐步发展。通过新信息、能力运用、人物回应或因果变化提高投入感，不机械制造威胁、审查或针对。',
  climax_approach: '关键节点正在接近，既有条件、线索和关系开始汇聚。营造期待感，但不得临时添加与前序无关的障碍。',
  climax: '关键节点发生，角色采取与既有事实相符的决定性行动，并形成突破、兑现、改变、失败或其他真实结果。让本轮成为当前主线的重要节点。',
  falling_action: '关键节点已经发生，展现结果和后续影响。角色作出反应与调整，开始收束既有叙事线索。',
  resolution: '呈现这一阶段已经形成的变化和稳定结果，为下一段剧情留下自然过渡。',
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
    phaseStartedAtTotalDays: 0,
    phaseElapsedDays: 0,
    chapterCount: 1,
    tensionLevel: 30,
    lastClimaxTotalDays: 0,
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
      phaseStartedAtTotalDays: 0,
      phaseElapsedDays: 0,
      chapterCount: 1,
      tensionLevel: 30,
      lastClimaxTotalDays: 0,
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
    const tension = Math.round(this.state.tensionLevel)
    const elapsedDays = this.state.phaseElapsedDays

    return [
      `【当前情节阶段】${label}（已持续${elapsedDays}天）`,
      `张力：${tension}/100`,
      `引导：${guidance}`,
      tension >= 70 ? '高张力：为关键转折做铺垫，沿用既有因果，不新增无关障碍。' : '',
      tension <= 20 ? '低张力：可以平稳推进既有目标、生活或关系，不要求制造冲突。' : '',
    ].filter(Boolean).join('\n')
  }

  // ---- 私有方法 ----

  /** 推进情节阶段 */
  private advancePhase(context: RoundContext): void {
    const daysPassed = this.getDaysPassed(context)
    if (!Number.isSafeInteger(daysPassed) || daysPassed < 0) {
      throw new Error(`[${this.id}] RoundContext.daysPassed 必须是非负安全整数`)
    }
    if (!Number.isSafeInteger(context.totalDays) || context.totalDays < 0) {
      throw new Error(`[${this.id}] RoundContext.totalDays 必须是非负安全整数`)
    }
    if (context.totalDays < this.state.phaseStartedAtTotalDays) {
      throw new Error(`[${this.id}] 规范时间早于当前剧情阶段起点`)
    }

    this.state.phaseElapsedDays = context.totalDays - this.state.phaseStartedAtTotalDays

    this.applyPhaseTensionDrift(daysPassed)

    // 检查是否需要转移阶段
    const nextPhase = this.shouldTransition()
    if (nextPhase) {
      this.performTransition(nextPhase, context)
    }
  }

  /** 转移阶段 */
  private performTransition(nextPhase: PlotPhase, context: RoundContext): void {
    this.state.phaseHistory.push({
      phase: this.state.currentPhase,
      roundSequence: getRoundSequence(context),
      totalDays: context.totalDays,
      contextId: context.contextId,
    })

    this.state.currentPhase = nextPhase
    this.state.phaseStartedAtTotalDays = context.totalDays
    this.state.phaseElapsedDays = 0

    if (nextPhase === 'climax') {
      this.state.lastClimaxTotalDays = context.totalDays
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
    const elapsedDays = this.state.phaseElapsedDays

    // 阶段特定转移条件
    switch (phase) {
      case 'setup':
        // 铺垫期：达到最短规范时间 + 有事件触发时转移
        if (elapsedDays >= durations.minDays && this.state.lastConflictIntensity >= 30) {
          return 'rising_action'
        }
        // 超过最长规范时间强制转移
        if (elapsedDays >= durations.maxDays) {
          return 'rising_action'
        }
        break

      case 'rising_action':
        // 冲突升级：张力 ≥ 60 且达到最短规范时间 → 进入转折前
        if (this.state.tensionLevel >= 60 && elapsedDays >= durations.minDays) {
          return 'climax_approach'
        }
        // 超过最长规范时间强制转移
        if (elapsedDays >= durations.maxDays) {
          return 'climax_approach'
        }
        break

      case 'climax_approach':
        // 转折前：达到最短规范时间后自动进入高潮
        if (elapsedDays >= durations.minDays) {
          return 'climax'
        }
        break

      case 'climax':
        if (elapsedDays >= durations.minDays) {
          return 'falling_action'
        }
        break

      case 'falling_action':
        if (elapsedDays >= durations.minDays) {
          return 'resolution'
        }
        break

      case 'resolution':
        if (elapsedDays >= durations.minDays) {
          return 'new_chapter'
        }
        break

      case 'new_chapter':
        if (elapsedDays >= durations.minDays) {
          return 'setup'
        }
        break
    }

    return null
  }

  /** 阶段自身的确定性张力漂移；按规范天数缩放，叙事语义增量另行叠加。 */
  private applyPhaseTensionDrift(daysPassed: number): void {
    const elapsedYears = daysPassed / CALENDAR.DAYS_PER_YEAR
    this.state.tensionLevel = clampNumber(
      this.state.tensionLevel + this.getAnnualPhaseTensionDrift() * elapsedYears,
      0,
      100,
    )
  }

  /** 获取阶段每个规范年的基础张力漂移。 */
  private getAnnualPhaseTensionDrift(): number {
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
