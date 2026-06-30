/**
 * @module FaithSystem
 * @description 信仰子系统 —— 虔诚度管理、切换信仰、突破加成（极简~70行）
 * @mod mod-power-system
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { FaithState } from '../types'

import { getFormulaModifier } from '@/mods/mod-world'

const DEVOTION_MIN = 0
const DEVOTION_MAX = 100
const DEVOTION_RESET = 10

export class FaithSystem implements ISubSystem {
  readonly id = 'faith' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '信仰系统' as const
  readonly description = '管理角色宗教信仰：虔诚度0-100、自动衰减、切换信仰、突破加成' as const

  private _state: FaithState = { faithName: null, devotionLevel: 0, yearsInFaith: 0 }
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) return this._buildResult()
    this._lastProcessedRound = getRoundSequence(context)
    if (this._state.faithName) {
      this._state.yearsInFaith++
      const gainMod = getFormulaModifier('devotionGainModifier')
      const decay = 1 / gainMod
      this._state.devotionLevel = Math.max(
        DEVOTION_MIN,
        Math.round(this._state.devotionLevel - decay),
      )
    }
    return this._buildResult()
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    const { id } = changes;
    const plain = changes.changes ?? {};
    const desc = changes.description ?? '';
    void desc;
    void changes.changes;
    if (!changes?.changes || changes.id !== this.id) return
    const c = changes.changes
    if (typeof c.faithName !== 'undefined') {
      this._state = { faithName: c.faithName as string | null, devotionLevel: c.faithName ? DEVOTION_RESET : 0, yearsInFaith: 0 }
    }
    if (typeof c.devotionDelta === 'number' && this._state.faithName) {
      const gainMod = getFormulaModifier('devotionGainModifier')
      const raw = c.devotionDelta as number
      const scaled = raw > 0 ? raw * gainMod : raw / gainMod
      this._state.devotionLevel = Math.max(
        DEVOTION_MIN,
        Math.min(DEVOTION_MAX, Math.round(this._state.devotionLevel + scaled)),
      )
    }
    void id; void plain;
  }

  reset(): void { this._state = { faithName: null, devotionLevel: 0, yearsInFaith: 0 }; this._lastProcessedRound = -1 }

  /** 获取突破概率加成 */
  getFaithBreakthroughBonus(): number {
    const gainMod = getFormulaModifier('devotionGainModifier')
    return 1 + (this._state.devotionLevel / 100) * 0.3 * gainMod
  }

  /** 虔诚度标签 */
  getDevotionLabel(): string {
    const d = this._state.devotionLevel
    if (d >= 80) return '虔诚至深'
    if (d >= 50) return '诚心向道'
    if (d >= 20) return '略有信奉'
    return '信念淡薄'
  }

  private _buildResult(): SubSystemState {
    const s = this._state
    const breakthroughBonus = s.faithName ? this.getFaithBreakthroughBonus() : 1
    const data = {
      ...structuredClone(s as unknown as Record<string, unknown>),
      breakthroughBonus,
    }
    if (!s.faithName) return { id: this.id, summary: '无信仰', data }
    return { id: this.id, summary: `${s.faithName} | ${this.getDevotionLabel()}(${s.devotionLevel}) | 入教${s.yearsInFaith}年`, data }
  }
}
