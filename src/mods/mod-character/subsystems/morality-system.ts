/**
 * @module morality-system.ts
 * @description 善恶值子系统
 * @mod mod-character
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { MoralityState, MoralityLevel } from '../types'

import {
  MORALITY_LEVELS,
  MORALITY_DELTA_CLAMP,
} from '../constants'
import { round } from '../utils'
import { useCharacterStore } from '../store'

export class MoralitySystem implements ISubSystem {
  readonly id = 'morality' as const
  readonly mod = 'mod-character' as const
  readonly label = '善恶值' as const
  readonly description = '持有善恶值，每轮只接受 AI 结构化 morality.delta 变化' as const

  private state: MoralityState = {
    value: 0,
    level: 'balanced',
    roundDelta: 0,
  }

  /** 上次处理善恶的轮次（防止 collectState 被同一轮多次调用时丢失 delta） */
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    const s = this.state
    const levelLabel = this.getLevelLabel(s.level)
    const levelDesc = this.getLevelDescription(s.level)
    const descPart = levelDesc ? `（${levelDesc}）` : ''
    const currentRound = getRoundSequence(context)

    // 构建结果（在重置 delta 之前读取）
    const result = {
      id: this.id,
      summary: `【${this.label}】当前值 ${s.value} | 档位：${levelLabel}${descPart} | 本轮变化：${this.formatDelta(s.roundDelta)}`,
      data: structuredClone({
        contextId: context.contextId,
        value: s.value,
        level: s.level,
        roundDelta: s.roundDelta,
      }),
    }

    // 仅在新轮次时重置 delta（幂等保护，重置放在读取之后）
    if (currentRound !== this._lastProcessedRound) {
      this._lastProcessedRound = currentRound
      this.state.roundDelta = 0
    }

    return result
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return
    const ch = changes.changes

    // 善恶判定由 AI 输出结构化 delta，系统只负责钳制与落地，不再从叙事文本猜测。
    if (typeof ch.delta === 'number') {
      this.applyDelta(ch.delta)
    }
  }

  reset(): void {
    this.state = { value: 0, level: 'balanced', roundDelta: 0 }
    this._lastProcessedRound = -1
  }

  hydrateFromStore(): void {
    this.restoreCollectedState(useCharacterStore.getState().morality)
  }

  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as Partial<MoralityState>
    if (typeof value.value !== 'number' || typeof value.level !== 'string' || typeof value.roundDelta !== 'number') return
    this.state = structuredClone({
      value: value.value,
      level: value.level,
      roundDelta: value.roundDelta,
    }) as MoralityState
    this._lastProcessedRound = -1
  }

  // -------- 公共方法 --------

  // -------- 内部方法 --------

  private applyDelta(delta: number): void {
    const clamped = round(
      Math.max(MORALITY_DELTA_CLAMP[0], Math.min(MORALITY_DELTA_CLAMP[1], delta))
    )
    this.state.roundDelta += clamped
    this.state.value = round(this.state.value + clamped)
    this.state.level = this.computeLevel(this.state.value)
  }

  private computeLevel(value: number): MoralityLevel {
    for (const entry of MORALITY_LEVELS) {
      const [low, high] = entry.range
      if (value >= low && value < high) {
        return entry.level
      }
    }
    return value >= 0 ? 'supremeGood' : 'supremeEvil'
  }

  private getLevelLabel(level: MoralityLevel): string {
    const entry = MORALITY_LEVELS.find((e) => e.level === level)
    return entry?.label ?? level
  }

  private getLevelDescription(level: MoralityLevel): string {
    const entry = MORALITY_LEVELS.find((e) => e.level === level)
    return entry?.description ?? ''
  }

  private formatDelta(delta: number): string {
    if (delta === 0) return '0'
    return delta > 0 ? `+${delta}` : `${delta}`
  }
}

let runtimeMoralitySystem: MoralitySystem | undefined

/** Loader 与引擎共享的懒加载善恶单例。 */
export function getMoralitySystem(): MoralitySystem {
  runtimeMoralitySystem ??= new MoralitySystem()
  return runtimeMoralitySystem
}
