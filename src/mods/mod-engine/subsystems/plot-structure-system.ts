/**
 * Purpose: Own the AI-judged plot phase used by the next narrative round.
 * Owner: mod-engine / plot-structure
 * Responsibility: Validate, prepare, commit, persist, and project plot guidance only.
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'

export type PlotPhase =
  | 'setup'
  | 'rising_action'
  | 'climax_approach'
  | 'climax'
  | 'falling_action'
  | 'resolution'
  | 'new_chapter'

const PHASE_LABELS: Record<PlotPhase, string> = {
  setup: '铺垫',
  rising_action: '推进',
  climax_approach: '转折前夕',
  climax: '高潮',
  falling_action: '回落',
  resolution: '收束',
  new_chapter: '新篇章',
}

const AI_PHASES: Readonly<Record<string, PlotPhase>> = {
  铺垫: 'setup',
  推进: 'rising_action',
  转折前夕: 'climax_approach',
  高潮: 'climax',
  回落: 'falling_action',
  收束: 'resolution',
  新篇章: 'new_chapter',
}

const PHASE_GUIDANCE: Record<PlotPhase, string> = {
  setup: '建立当前场景、人物关系和生活秩序，让后续发展拥有清楚起点。',
  rising_action: '沿既有目标、机会、关系与问题继续推进，让人物行动和世界回应共同形成进展。',
  climax_approach: '既有条件与线索正在汇聚，让关键节点自然逼近并保持连续因果。',
  climax: '让当前主线形成决定性行动与真实结果，使人物和世界都留下可延续的变化。',
  falling_action: '承接关键节点的结果，呈现人物、关系与周围世界如何吸收这次变化。',
  resolution: '呈现当前阶段已经形成的稳定结果，并为下一段生活留下自然过渡。',
  new_chapter: '从既有结果中开启新的篇章，让新的场景、人物或目标与此前经历相连。',
}

export interface PlotStructureState {
  enabled: boolean
  currentPhase: PlotPhase
  phaseStartedAtTotalDays: number
  phaseElapsedDays: number
  chapterCount: number
  tensionLevel: number
  progressSummary: string
  phaseHistory: Array<{
    phase: PlotPhase
    roundSequence: number
    totalDays: number
    contextId?: string
  }>
}

export interface PreparedPlotGuidance {
  readonly contextIdentity: {
    readonly contextId: string
    readonly roundSequence?: number
    readonly totalDays: number
  }
  readonly nextState: PlotStructureState
}

function initialState(): PlotStructureState {
  return {
    enabled: true,
    currentPhase: 'setup',
    phaseStartedAtTotalDays: 0,
    phaseElapsedDays: 0,
    chapterCount: 1,
    tensionLevel: 30,
    progressSummary: '人生与世界仍在建立最初的联系。',
    phaseHistory: [],
  }
}

function normalizeText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  return value.trim()
}

function normalizeState(snapshot: unknown): PlotStructureState {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('剧情结构状态无效')
  }
  const value = snapshot as Partial<PlotStructureState>
  if (!value.currentPhase || !(value.currentPhase in PHASE_LABELS)) {
    throw new Error('剧情结构阶段无效')
  }
  if (!Number.isInteger(value.tensionLevel) || value.tensionLevel! < 0 || value.tensionLevel! > 100) {
    throw new Error('剧情结构张力无效')
  }
  if (!Number.isFinite(value.phaseStartedAtTotalDays) || value.phaseStartedAtTotalDays! < 0) {
    throw new Error('剧情结构阶段起点无效')
  }
  if (!Number.isFinite(value.phaseElapsedDays) || value.phaseElapsedDays! < 0) {
    throw new Error('剧情结构阶段历时无效')
  }
  if (!Number.isSafeInteger(value.chapterCount) || value.chapterCount! < 1) {
    throw new Error('剧情结构篇章编号无效')
  }
  if (!Array.isArray(value.phaseHistory)) throw new Error('剧情结构历史无效')
  return {
    enabled: value.enabled !== false,
    currentPhase: value.currentPhase,
    phaseStartedAtTotalDays: value.phaseStartedAtTotalDays!,
    phaseElapsedDays: value.phaseElapsedDays!,
    chapterCount: value.chapterCount!,
    tensionLevel: value.tensionLevel!,
    progressSummary: normalizeText(value.progressSummary, '剧情进展说明'),
    phaseHistory: structuredClone(value.phaseHistory),
  }
}

export class PlotStructureSystem extends BaseSubsystem {
  readonly id = 'plot-structure' as const
  readonly mod = 'mod-engine' as const
  readonly label = '情节结构' as const
  readonly description = '保存剧情引导 AI 对当前阶段、张力与进展位置的判定' as const

  private state = initialState()

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: this.buildPhaseGuidance(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    throw new Error('剧情结构只接受剧情引导专员形成的准备结果')
  }

  prepareGuidance(
    input: { 阶段: string; 张力: number; 进展说明: string },
    context: RoundContext,
  ): PreparedPlotGuidance {
    const nextPhase = AI_PHASES[input.阶段]
    if (!nextPhase) throw new Error(`剧情阶段无效：${input.阶段}`)
    if (!Number.isInteger(input.张力) || input.张力 < 0 || input.张力 > 100) {
      throw new Error('剧情张力必须是 0 至 100 的整数')
    }
    const progressSummary = normalizeText(input.进展说明, '剧情进展说明')
    const phaseChanged = nextPhase !== this.state.currentPhase
    const chapterCount = phaseChanged && nextPhase === 'new_chapter'
      ? this.state.chapterCount + 1
      : this.state.chapterCount
    const phaseStartedAtTotalDays = phaseChanged
      ? context.totalDays
      : this.state.phaseStartedAtTotalDays
    const phaseHistory = phaseChanged
      ? [
          ...this.state.phaseHistory,
          {
            phase: nextPhase,
            roundSequence: context.roundSequence ?? 0,
            totalDays: context.totalDays,
            ...(context.contextId ? { contextId: context.contextId } : {}),
          },
        ]
      : [...this.state.phaseHistory]

    return {
      contextIdentity: {
        contextId: context.contextId,
        roundSequence: context.roundSequence,
        totalDays: context.totalDays,
      },
      nextState: {
        enabled: this.state.enabled,
        currentPhase: nextPhase,
        phaseStartedAtTotalDays,
        phaseElapsedDays: Math.max(0, context.totalDays - phaseStartedAtTotalDays),
        chapterCount,
        tensionLevel: input.张力,
        progressSummary,
        phaseHistory,
      },
    }
  }

  commitPreparedGuidance(prepared: PreparedPlotGuidance, context: RoundContext): void {
    const identity = prepared.contextIdentity
    if (
      identity.contextId !== context.contextId
      || identity.roundSequence !== context.roundSequence
      || identity.totalDays !== context.totalDays
    ) {
      throw new Error('剧情引导准备结果不属于当前回合')
    }
    this.state = normalizeState(prepared.nextState)
  }

  captureTransactionState(): PlotStructureState {
    return structuredClone(this.state)
  }

  restoreTransactionState(snapshot: unknown): void {
    this.state = normalizeState(snapshot)
  }

  capturePersistenceState(): PlotStructureState {
    return this.captureTransactionState()
  }

  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined || snapshot === null) {
      this.reset()
      return
    }
    this.restoreTransactionState(snapshot)
  }

  getCurrentPhase(): PlotPhase {
    return this.state.currentPhase
  }

  getTensionLevel(): number {
    return this.state.tensionLevel
  }

  getState(): PlotStructureState {
    return structuredClone(this.state)
  }

  buildPhaseGuidance(): string {
    if (!this.state.enabled) return ''
    return [
      `剧情阶段：${PHASE_LABELS[this.state.currentPhase]} · 第 ${this.state.chapterCount} 篇`,
      `当前张力：${this.state.tensionLevel}/100`,
      `进展位置：${this.state.progressSummary}`,
      PHASE_GUIDANCE[this.state.currentPhase],
    ].join('\n')
  }

  reset(): void {
    this.state = initialState()
  }
}

export const plotStructure = new PlotStructureSystem()
