/**
 * @module EventPoolSystem
 * @description 事件池子系统：管理历史事件池的补充、触发、过期清理
 * @mod mod-history-dynamics
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { EventPoolState, EventPoolEntry } from '../types'

import { PRESET_EVENT_POOL, MAX_EVENT_POOL_SIZE, EVENT_POOL_REFRESH_INTERVAL } from '../constants'

export class EventPoolSystem implements ISubSystem {
  readonly id = 'event-pool' as const
  readonly mod = 'mod-history-dynamics' as const
  readonly label = '事件池' as const
  readonly description = '管理历史事件池的预设补充、触发检测与过期清理' as const

  private state: EventPoolState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): EventPoolState {
    return {
      entries: [],
      presetUsedIndices: [],
      lastCleanupYear: 0,
    }
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

    // 1. 清理过期条目：triggeredYear + triggerWindow[1] < currentYear
    this.state.entries = this.state.entries.filter((entry) => {
      if (entry.triggered) {
        const expireYear = entry.triggeredYear + entry.triggerWindow[1]
        if (expireYear < currentYear) {
          entry.expired = true
        }
      }
      return !entry.expired
    })

    // 2. 补充预设事件池
    if (
      this.state.entries.filter((e) => !e.triggered && !e.expired).length < MAX_EVENT_POOL_SIZE &&
      (this.state.lastCleanupYear === 0 || currentYear - this.state.lastCleanupYear >= EVENT_POOL_REFRESH_INTERVAL)
    ) {
      const unusedIndices: number[] = []
      for (let i = 0; i < PRESET_EVENT_POOL.length; i++) {
        if (!this.state.presetUsedIndices.includes(i)) {
          unusedIndices.push(i)
        }
      }

      if (unusedIndices.length > 0) {
        const shuffled = [...unusedIndices].sort(() => Math.random() - 0.5)
        const spaceLeft = MAX_EVENT_POOL_SIZE - this.state.entries.filter((e) => !e.triggered && !e.expired).length
        const addCount = Math.min(shuffled.length, spaceLeft)

        for (let i = 0; i < addCount; i++) {
          const presetIndex = shuffled[i]
          const preset = PRESET_EVENT_POOL[presetIndex]
          const entry: EventPoolEntry = {
            id: `preset-${presetIndex}`,
            name: preset.name,
            description: preset.description,
            source: 'preset',
            triggerCondition: preset.triggerCondition,
            triggerWindow: [preset.triggerWindow[0], preset.triggerWindow[1]],
            affectedRegions: [...preset.affectedRegions],
            severity: preset.severity,
            triggered: false,
            triggeredYear: 0,
            expired: false,
          }
          this.state.entries.push(entry)
          this.state.presetUsedIndices.push(presetIndex)
        }

        this.state.lastCleanupYear = currentYear
      }
    }

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

    // 推进年份（逐条概率触发）
    if (typeof c.yearsAdvanced === 'number') {
      this.advanceEvents(c.yearsAdvanced as number)
    }

    // 触发指定事件
    if (typeof c.triggerEvent === 'string') {
      this.triggerEventById(c.triggerEvent as string, typeof c.triggerYear === 'number' ? c.triggerYear : _context.round.year)
    }

    // 过期指定事件
    if (typeof c.expireEvent === 'string') {
      this.expireEventById(c.expireEvent as string)
    }
  }

  private advanceEvents(yearsAdvanced: number): void {
    const currentYear = this._lastProcessedRound > 0 ? this._lastProcessedRound : 0
    for (const entry of this.state.entries) {
      if (entry.triggered || entry.expired) continue

      // 在触发窗口内按 severity/100 概率每年触发
      const windowStart = entry.triggerWindow[0]
      const windowEnd = entry.triggerWindow[1]
      const baseYear = currentYear + Math.floor(Math.random() * yearsAdvanced)

      if (baseYear >= windowStart && baseYear <= windowEnd) {
        const triggerChance = entry.severity / 100
        if (Math.random() < triggerChance) {
          entry.triggered = true
          entry.triggeredYear = baseYear
        }
      }
    }
  }

  private triggerEventById(eventId: string, year: number): void {
    const entry = this.state.entries.find((e) => e.id === eventId)
    if (entry && !entry.triggered && !entry.expired) {
      entry.triggered = true
      entry.triggeredYear = year
    }
  }

  private expireEventById(eventId: string): void {
    const entry = this.state.entries.find((e) => e.id === eventId)
    if (entry) {
      entry.expired = true
    }
  }

  getSummaryText(): string {
    const active = this.state.entries.filter((e) => !e.triggered && !e.expired).length
    const triggered = this.state.entries.filter((e) => e.triggered && !e.expired).length
    const expired = this.state.entries.filter((e) => e.expired).length
    return `【${this.label}】事件池: ${active}条待触发, 已触发 ${triggered}条, 已过期 ${expired}条`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
