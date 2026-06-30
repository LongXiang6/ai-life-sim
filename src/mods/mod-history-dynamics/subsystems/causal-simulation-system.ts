/**
 * @module CausalSimulationSystem
 * @description 因果模拟子系统：从 AI 叙事捕获因果链、管理队列、延时触发
 * @mod mod-history-dynamics
 */
import { getRoundSequence } from '@/foundation'
import { clamp } from '@/core/shared'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { CausalSimulationState, CausalEvent } from '../types'

import {
  CAUSAL_REGEX_RULES,
  CAUSAL_DELAY_RANGE,
  MAX_CAUSAL_PER_DECADE,
  MAX_CAUSAL_PER_30_YEARS,
  MAX_CAUSAL_QUEUE_SIZE,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

export class CausalSimulationSystem implements ISubSystem {
  readonly id = 'causal-simulation' as const
  readonly mod = 'mod-history-dynamics' as const
  readonly label = '因果模拟' as const
  readonly description = '从 AI 叙事捕获因果行为链，管理待处理队列与延时触发解决' as const

  private state: CausalSimulationState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): CausalSimulationState {
    return {
      queue: {
        pending: [],
        resolved: [],
        recentDecadeCount: 0,
        recent30YearCount: 0,
      },
      lastProcessYear: 0,
    }
  }

  /**
   * 从 AI 叙事中捕获因果事件
   * @param narrative - AI 生成的叙事文本
   * @param year - 捕获年份
   * @returns 成功捕获的 CausalEvent，或 null（频率限制 / 无匹配）
   */
  captureCausalEvent(narrative: string, year: number): CausalEvent | null {
    if (!narrative || typeof narrative !== 'string') return null

    const rateMod = getFormulaModifier('causalCaptureRate')
    const decadeCap = Math.max(1, Math.round(MAX_CAUSAL_PER_DECADE * rateMod))
    const cap30 = Math.max(1, Math.round(MAX_CAUSAL_PER_30_YEARS * rateMod))

    // 频率限制检查
    if (this.state.queue.recentDecadeCount >= decadeCap) return null
    if (this.state.queue.recent30YearCount >= cap30) return null

    // 检查队列最大长度
    if (this.state.queue.pending.length >= MAX_CAUSAL_QUEUE_SIZE) return null

    // 遍历正则规则匹配
    for (const rule of CAUSAL_REGEX_RULES) {
      const match = rule.pattern.test(narrative)
      // 重置 lastIndex（因为全局正则会记住位置）
      rule.pattern.lastIndex = 0

      if (match) {
        if (rateMod <= 1 && Math.random() >= rateMod) {
          continue
        }

        const delay = CAUSAL_DELAY_RANGE[0] + Math.floor(Math.random() * (CAUSAL_DELAY_RANGE[1] - CAUSAL_DELAY_RANGE[0]))

        const event: CausalEvent = {
          id: `causal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          actionType: rule.actionType,
          captureDescription: narrative,
          initiator: '未知',
          target: '未知',
          captureYear: year,
          triggerYear: year + delay,
          consequence: '',
          resolved: false,
        }

        this.state.queue.pending.push(event)
        this.state.queue.recentDecadeCount++
        this.state.queue.recent30YearCount++

        return event
      }
    }

    return null
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.getSummaryText(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    const currentYear = context.round.year

    // 处理待处理队列：triggerYear <= 当前年份的移入已解决
    const remainingPending: CausalEvent[] = []
    for (const event of this.state.queue.pending) {
      if (event.triggerYear <= currentYear) {
        this.state.queue.resolved.push({ ...event, resolved: true })
      } else {
        remainingPending.push(event)
      }
    }
    this.state.queue.pending = remainingPending

    // 频率限制衰减：跨过 10 年 / 30 年边界时重置计数
    if (this.state.lastProcessYear > 0) {
      const yearsPassed = currentYear - this.state.lastProcessYear
      if (yearsPassed >= 10) {
        this.state.queue.recentDecadeCount = clamp(this.state.queue.recentDecadeCount - 1, 0, Infinity)
      }
      if (yearsPassed >= 30) {
        this.state.queue.recent30YearCount = clamp(this.state.queue.recent30YearCount - 1, 0, Infinity)
      }
    }

    this.state.lastProcessYear = currentYear

    return {
      id: this.id,
      summary: this.getSummaryText(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    const c = changes.changes as Record<string, unknown>

    // 解决因果事件（设置后果）
    if (typeof c.resolveEvent === 'string') {
      this.resolveEvent(c.resolveEvent as string, typeof c.consequence === 'string' ? c.consequence : '')
    }

    // 添加因果事件
    if (c.addEvent && typeof c.addEvent === 'object') {
      const data = c.addEvent as Partial<CausalEvent>
      if (data.captureDescription && data.actionType) {
        this.captureCausalEvent(data.captureDescription, typeof data.captureYear === 'number' ? data.captureYear : _context.round.year)
      }
    }
  }

  private resolveEvent(eventId: string, consequence: string): void {
    // 在 pending 中查找
    let event = this.state.queue.pending.find((e) => e.id === eventId)
    if (event) {
      event.consequence = consequence
      event.resolved = true
      this.state.queue.resolved.push(event)
      this.state.queue.pending = this.state.queue.pending.filter((e) => e.id !== eventId)
      return
    }

    // 在 resolved 中查找
    event = this.state.queue.resolved.find((e) => e.id === eventId)
    if (event) {
      event.consequence = consequence
    }
  }

  getSummaryText(): string {
    const pending = this.state.queue.pending.length
    const resolved = this.state.queue.resolved.length
    return `【${this.label}】待处理: ${pending}条, 已解决: ${resolved}条`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
