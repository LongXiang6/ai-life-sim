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
  MORALITY_GOOD_KEYWORDS_MINOR,
  MORALITY_GOOD_KEYWORDS_MODERATE,
  MORALITY_GOOD_KEYWORDS_MAJOR,
  MORALITY_EVIL_KEYWORDS_MINOR,
  MORALITY_EVIL_KEYWORDS_MODERATE,
  MORALITY_EVIL_KEYWORDS_MAJOR,
  MORALITY_SCORE_MINOR,
  MORALITY_SCORE_MODERATE,
  MORALITY_SCORE_MAJOR_GOOD,
  MORALITY_SCORE_MAJOR_EVIL,
  MORALITY_EXCLUDE_KEYWORDS,
  MORALITY_DELTA_CLAMP,
} from '../constants'
import { round } from '../utils'

export class MoralitySystem implements ISubSystem {
  readonly id = 'morality' as const
  readonly mod = 'mod-character' as const
  readonly label = '善恶值' as const
  readonly description = '持有善恶值，每轮由叙事解析器通过关键词分级匹配提取变化' as const

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

    // 叙事关键词匹配结果
    if (typeof ch.delta === 'number') {
      this.applyDelta(ch.delta)
    }

    // 叙事文本（由 B1 Orchestrator 解析后传入 delta）
    if (typeof ch.narrativeText === 'string' && typeof ch.delta === 'undefined') {
      const delta = this.parseNarrative(ch.narrativeText)
      this.applyDelta(delta)
    }
  }

  reset(): void {
    this.state = { value: 0, level: 'balanced', roundDelta: 0 }
    this._lastProcessedRound = -1
  }

  // -------- 公共方法 --------

  /** 从叙事文本解析善恶变化（对齐废弃项目 extractMoralityChanges） */
  parseNarrative(narrative: string): number {
    let totalDelta = 0

    // 按句子分割
    const sentences = narrative.split(/[。？！；\n]/)
    for (const sentence of sentences) {
      // 排除非玩家行为的句子
      if (MORALITY_EXCLUDE_KEYWORDS.some((kw) => sentence.includes(kw))) {
        continue
      }

      // 只处理含"你"的句子（isPlayerAction）
      if (!sentence.includes('你')) {
        continue
      }

      // 分级匹配恶性关键词（恶性优先匹配，因为恶性权重更高）
      if (MORALITY_EVIL_KEYWORDS_MAJOR.some((kw) => sentence.includes(kw))) {
        totalDelta += MORALITY_SCORE_MAJOR_EVIL
      } else if (MORALITY_EVIL_KEYWORDS_MODERATE.some((kw) => sentence.includes(kw))) {
        totalDelta -= MORALITY_SCORE_MODERATE
      } else if (MORALITY_EVIL_KEYWORDS_MINOR.some((kw) => sentence.includes(kw))) {
        totalDelta -= MORALITY_SCORE_MINOR
      }

      // 分级匹配善行关键词
      if (MORALITY_GOOD_KEYWORDS_MAJOR.some((kw) => sentence.includes(kw))) {
        totalDelta += MORALITY_SCORE_MAJOR_GOOD
      } else if (MORALITY_GOOD_KEYWORDS_MODERATE.some((kw) => sentence.includes(kw))) {
        totalDelta += MORALITY_SCORE_MODERATE
      } else if (MORALITY_GOOD_KEYWORDS_MINOR.some((kw) => sentence.includes(kw))) {
        totalDelta += MORALITY_SCORE_MINOR
      }
    }

    return totalDelta
  }

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
