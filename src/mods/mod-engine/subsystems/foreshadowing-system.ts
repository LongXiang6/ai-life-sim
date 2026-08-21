/**
 * @module foreshadowing-system.ts
 * @description 伏笔追踪系统 —— 记录、潜伏、回收 AI 结构化标注的叙事伏笔
 * @mod mod-engine
 *
 * 设计理念：
 *   网文创作强调"草蛇灰线，伏脉千里"。本系统追踪 AI 叙事中埋设的伏笔，
 *   在条件满足时引导 AI 自然回收。本地只管理生命周期，不扫描正文判断语义。
 *
 * 核心机制：
 *   1. 伏笔来源：AI 主动标注 foreshadowing
 *   2. 生命周期：埋设 → 潜伏 → AI 按稳定 ID 回收 → 归档
 *   3. Prompt 注入极简（~150字），仅注入接近触发的伏笔
 *   4. 安全上限：活跃伏笔 ≤ 10 条，超时自动归档
 *   5. 含 enabled 开关
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import { BaseSubsystem } from '@/core'

import {
  MemoryLifecycleSystem,
  memoryLifecycle,
} from './memory-lifecycle-system'
import {
  SummaryCompressorSystem,
  summaryCompressor,
} from './summary-compressor-system'
import { clampNumber } from '../helpers/system-safety'

// ============================================================
// 类型定义
// ============================================================

/** 伏笔类型 */
export type ForeshadowingType =
  | 'prophecy'           // 预言/命运
  | 'mysterious_item'    // 神秘物品
  | 'secret_identity'    // 身世之谜
  | 'unfinished_business' // 未竟之事
  | 'oath'               // 誓言/约定
  | 'mysterious_person'  // 神秘人物
  | 'hidden_power'       // 隐藏力量
  | 'ancient_ruin'       // 上古遗迹
  | 'other'              // 其他

/** 伏笔类型标签 */
const FORESHADOWING_TYPE_LABELS: Record<ForeshadowingType, string> = {
  prophecy: '预言',
  mysterious_item: '神秘物品',
  secret_identity: '身世之谜',
  unfinished_business: '未竟之事',
  oath: '誓言',
  mysterious_person: '神秘人物',
  hidden_power: '隐藏力量',
  ancient_ruin: '上古遗迹',
  other: '其他',
}

/** 伏笔触发条件 */
export interface ForeshadowingTriggerConditions {
  /** 最少延迟回合数 */
  minRound?: number
}

/** 伏笔记录 */
export interface ForeshadowingRecord {
  id: string
  scope: 'global' | 'context' | 'travel'
  contextId?: string
  relatedEntityIds?: string[]
  /** 种植该伏笔时已经成立的历史事件。 */
  plantedFromEventIds?: string[]
  type: ForeshadowingType
  /** 描述摘要（≤ 50 字） */
  description: string
  /** 埋设回合 */
  plantedRound: number
  /** 埋设时角色年龄 */
  plantedAge: number
  /** 优先级 (1-10)，高优先级优先回收 */
  priority: number
  /** 触发条件 */
  triggerConditions: ForeshadowingTriggerConditions
  /** 是否已回收 */
  resolved: boolean
  /** 回收回合 */
  resolvedRound?: number
  /** 回收叙事摘要 */
  resolvedNarrative?: string
  /** 完成回收时形成或确认的历史事件。 */
  resolvedByEventIds?: string[]
}

function normalizeHistoricalEventIds(ids?: readonly string[]): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))]
}

function formatForeshadowingDisplayId(internalId: string): string {
  return internalId.startsWith('fs_') ? `伏笔_${internalId.slice(3)}` : internalId
}

/** 伏笔系统状态 */
export interface ForeshadowingState {
  enabled: boolean
  /** 活跃伏笔（最多 10 条） */
  active: ForeshadowingRecord[]
  /** 已回收 */
  resolved: ForeshadowingRecord[]
  /** 未回收（超时或死亡） */
  unresolved: ForeshadowingRecord[]
  stats: {
    totalPlanted: number
    totalResolved: number
    totalUnresolved: number
  }
}

// ============================================================
// 常量
// ============================================================

// ============================================================
// ForeshadowingSystem
// ============================================================

export class ForeshadowingSystem extends BaseSubsystem {
  readonly id = 'foreshadowing' as const
  readonly mod = 'mod-engine' as const
  readonly label = '伏笔追踪' as const
  readonly description = '检测/追踪/回收 AI 叙事中的伏笔，引导长线叙事（可选子系统）' as const

  constructor(
    private readonly memoryLifecycleRuntime: MemoryLifecycleSystem = memoryLifecycle,
    private readonly summaryCompressorRuntime: SummaryCompressorSystem = summaryCompressor,
  ) {
    super()
  }

  private state: ForeshadowingState = {
    enabled: true,
    active: [],
    resolved: [],
    unresolved: [],
    stats: { totalPlanted: 0, totalResolved: 0, totalUnresolved: 0 },
  }

  private _lastProcessedRound = -1

  // ---- ISubSystem 接口 ----

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.buildForeshadowingText(context.contextId),
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

    return {
      id: this.id,
      summary: this.buildForeshadowingText(context.contextId),
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
    // 伏笔不接受外部变更，由系统自行管理
  }

  reset(): void {
    this.state = {
      enabled: true,
      active: [],
      resolved: [],
      unresolved: [],
      stats: { totalPlanted: 0, totalResolved: 0, totalUnresolved: 0 },
    }
    this._lastProcessedRound = -1
  }

  /** 导出伏笔计时的完整持久状态。 */
  capturePersistenceState(): unknown {
    return structuredClone({
      state: this.state,
      lastProcessedRound: this._lastProcessedRound,
    })
  }

  restorePersistenceState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as {
      state?: ForeshadowingState
      lastProcessedRound?: number
    }
    if (value.state) {
      this.state = structuredClone(value.state)
      this.state.active = this.state.active.map((record) => ({ ...record, scope: record.scope ?? 'global' }))
      this.state.resolved = this.state.resolved.map((record) => ({ ...record, scope: record.scope ?? 'global' }))
      this.state.unresolved = this.state.unresolved.map((record) => ({ ...record, scope: record.scope ?? 'global' }))
    }
    if (typeof value.lastProcessedRound === 'number') {
      this._lastProcessedRound = value.lastProcessedRound
    }
  }

  // ---- 公共访问器 ----

  /** 获取伏笔状态 */
  getState(): ForeshadowingState {
    return {
      ...this.state,
      active: [...this.state.active],
      resolved: [...this.state.resolved],
      unresolved: [...this.state.unresolved],
    }
  }

  /** 设置是否启用 */
  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled
  }

  /** 获取统计 */
  getStats() {
    return { ...this.state.stats }
  }

  // ---- 核心方法：检测新伏笔 ----

  /**
   * 消费 AI 主动标注的新伏笔
   * 调用时机：AI 叙事输出后、解析完成时
   *
   * @param round 当前回合
   * @param age 角色年龄
   * @param aiMarked AI 主动标注的伏笔（来自 output JSON 的可选字段）
   */
  detectForeshadowing(
    round: number,
    age: number,
    aiMarked?: Array<{ type: string; description: string; priority?: number }>,
    contextId?: string,
    plantedFromEventIds?: readonly string[],
  ): ForeshadowingRecord[] {
    if (!this.state.enabled) return []

    const detected: ForeshadowingRecord[] = []
    if (aiMarked && aiMarked.length > 0) {
      for (const mark of aiMarked) {
        const record = this.createForeshadowingRecord(
          (mark.type as ForeshadowingType) || 'other',
          mark.description,
          round,
          age,
          mark.priority ?? 5,
          contextId,
          plantedFromEventIds,
        )
        if (record) {
          this.addActive(record)
          detected.push(record)
        }
      }
    }

    return detected
  }

  /** 按 AI 返回的稳定 ID 回收伏笔。 */
  resolveForeshadowing(
    ids: string[],
    narrative: string,
    round: number,
    currentContextId?: string,
    resolvedByEventIds?: readonly string[],
  ): ForeshadowingRecord[] {
    if (!this.state.enabled) return []

    const resolved: ForeshadowingRecord[] = []

    const requested = new Set(ids)
    for (const record of [...this.state.active]) {
      if (!requested.has(record.id)) continue
      if (record.scope === 'context' && record.contextId !== currentContextId) continue
      record.resolved = true
      record.resolvedRound = round
      record.resolvedNarrative = narrative
      const normalizedResolvedByEventIds = normalizeHistoricalEventIds(resolvedByEventIds)
      record.resolvedByEventIds = normalizedResolvedByEventIds.length > 0
        ? normalizedResolvedByEventIds
        : undefined
      this.state.active = this.state.active.filter((item) => item.id !== record.id)
      this.state.resolved.push(record)
      this.state.stats.totalResolved++
      this.memoryLifecycleRuntime.resolveForeshadowMark(record.plantedRound, record.contextId)
      resolved.push(record)
    }

    return resolved
  }

  // ---- 核心方法：生成 Prompt 注入文本 ----

  /** 生成伏笔注入文本（含种植时的叙事上下文） */
  buildForeshadowingText(currentContextId?: string): string {
    if (!this.state.enabled || this.state.active.length === 0) return ''

    // 计算每条伏笔的"接近触发"分数
    const scored = this.state.active
      .filter((record) => record.scope !== 'context' || record.contextId === currentContextId)
      .map((r) => ({
        record: r,
        score: this.calculateTriggerScore(r),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) return ''

    const lines: string[] = ['【待回收伏笔】（按优先级排列）']
    for (const { record, score } of scored) {
      const typeLabel = FORESHADOWING_TYPE_LABELS[record.type]
      const hint = this.buildResolutionHint(record, score)
      lines.push(`\n▪ [编号=${formatForeshadowingDisplayId(record.id)}·${record.priority}级·${typeLabel}] 第${record.plantedRound}轮：${record.description}`)

      const context = this.getPlantedContext(record.plantedRound, record.contextId)
      if (context) {
        lines.push(`  种植背景：${context}`)
      }

      if (hint) lines.push(`  回收提示：${hint}`)
    }
    lines.push('\n请在叙事中自然地回收这些伏笔，不要强行植入。')

    return lines.join('\n')
  }

  // ---- 私有方法 ----

  /** 从压缩摘要中获取指定轮次的上下文（用于伏笔注入时附带种植背景） */
  private getPlantedContext(round: number, contextId?: string): string | null {
    const summaries = this.summaryCompressorRuntime.getSummaries()
    const memory = summaries.summaries.find(
      (summary) => summary.sourceRound === round
        && (!contextId || !summary.contextId || summary.contextId === contextId),
    )
    if (memory) return memory.content
    return null
  }

  /** 创建伏笔记录 */
  private createForeshadowingRecord(
    type: ForeshadowingType,
    description: string,
    round: number,
    age: number,
    priority: number,
    contextId?: string,
    plantedFromEventIds?: readonly string[],
  ): ForeshadowingRecord | null {
    const id = `fs_${round}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const normalizedPlantedFromEventIds = normalizeHistoricalEventIds(plantedFromEventIds)

    return {
      id,
      scope: contextId ? 'context' : 'global',
      contextId,
      plantedFromEventIds: normalizedPlantedFromEventIds.length > 0
        ? normalizedPlantedFromEventIds
        : undefined,
      type,
      description: description,
      plantedRound: round,
      plantedAge: age,
      priority: Math.max(1, Math.min(10, priority)),
      triggerConditions: this.inferTriggerConditions(type, description),
      resolved: false,
    }
  }

  /** 根据伏笔类型推断触发条件 */
  private inferTriggerConditions(
    type: ForeshadowingType,
    _description: string,
  ): ForeshadowingTriggerConditions {
    switch (type) {
      case 'prophecy':
        return { minRound: 20 }
      case 'mysterious_item':
        return { minRound: 10 }
      case 'secret_identity':
        return { minRound: 15 }
      case 'unfinished_business':
        return { minRound: 8 }
      case 'oath':
        return { minRound: 5 }
      case 'mysterious_person':
        return { minRound: 10 }
      case 'hidden_power':
        return { minRound: 12 }
      case 'ancient_ruin':
        return { minRound: 15 }
      default:
        return { minRound: 8 }
    }
  }

  /** 添加活跃伏笔 */
  private addActive(record: ForeshadowingRecord): void {
    this.state.active.push(record)
    this.state.stats.totalPlanted++

    // 标记为不可遗忘事件
    this.memoryLifecycleRuntime.markForeshadowEvent(record.plantedRound, record.description, record.contextId)
  }

  /** 计算伏笔的"接近触发"分数 (0-10) */
  private calculateTriggerScore(record: ForeshadowingRecord): number {
    const { triggerConditions } = record

    let score = 0

    // 基于最少延迟：越接近触发时间，分数越高
    if (triggerConditions.minRound) {
      const elapsed = this._lastProcessedRound - record.plantedRound
      if (elapsed >= triggerConditions.minRound) {
        score += 5  // 已到触发时间
      } else if (elapsed >= triggerConditions.minRound * 0.7) {
        score += 2  // 接近触发时间
      }
    } else {
      score += 3  // 无延迟限制，随时可触发
    }

    // 优先级加成
    score += record.priority / 10

    // 埋设时间太长还没回收 → 降低分数
    const age = this._lastProcessedRound - record.plantedRound
    if (age > 100) score -= 3
    if (age > 50) score -= 1

    return clampNumber(score, 0, 10)
  }

  /** 生成回收提示文本 */
  private buildResolutionHint(record: ForeshadowingRecord, score: number): string {
    if (score >= 8) return '时机成熟，应在本轮或下轮叙事中回收此伏笔。'
    if (score >= 5) return '可以在叙事中巧妙呼应此伏笔，为后续回收做铺垫。'
    return '条件接近满足，可以在合适的时机自然回收。'
  }
}

/** 全局单例 */
export const foreshadowing = new ForeshadowingSystem()
