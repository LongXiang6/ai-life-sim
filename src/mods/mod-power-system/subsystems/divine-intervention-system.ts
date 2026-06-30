/**
 * @module DivineInterventionSystem
 * @description 神明干预子系统 —— 神谕/神迹/天罚/神选之人（依赖 divine-creation B0）
 * @mod mod-power-system
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { DivineInterventionState } from '../types'

const ORACLE_TYPES = [
  { id: 'doom', name: '末日预兆', hint: '神祇预见了即将降临的灾难' },
  { id: 'hero', name: '英雄降世', hint: '神祇预言一位救世者的诞生' },
  { id: 'trial', name: '天选试炼', hint: '神祇降下考验，通关者获得神恩' },
  { id: 'prophecy', name: '命运转折', hint: '世界的命运即将翻过新的一页' },
  { id: 'warning', name: '神明警告', hint: '神祇对世人的偏离发出警告' },
  { id: 'revelation', name: '真理启示', hint: '神祇揭示了一项隐藏的真理' },
]

const MIRACLE_TYPES = [
  { id: 'holy_light', name: '神光普照', hint: '天降圣光，治愈众生伤病', luckMod: 1, healthMod: 2 },
  { id: 'spring', name: '圣泉涌现', hint: '大地涌出圣泉，万物复苏', luckMod: 1, healthMod: 1 },
  { id: 'fire_rain', name: '天火降世', hint: '神明之怒以天火形式降临', luckMod: -1, healthMod: -1 },
  { id: 'rebirth', name: '涅槃重生', hint: '死者在神迹中复苏', luckMod: 0, healthMod: 3 },
  { id: 'bounty', name: '丰饶神迹', hint: '作物三倍丰收，饥荒终结', luckMod: 2, healthMod: 1 },
]

const CHOSEN_PREFIXES = ['天眷之人', '圣印持有者', '神选之子', '光明化身', '命定之人']

/** 最大同时活跃神谕数 */
const MAX_ACTIVE_ORACLES = 3
/** 最大同时活跃神迹数 */
const MAX_ACTIVE_MIRACLES = 2
/** 神谕所需最低神恩值 */
const FAVOR_ORACLE_THRESHOLD = 50
/** 神迹所需最低神恩值 */
const FAVOR_MIRACLE_THRESHOLD = 70

export class DivineInterventionSystem implements ISubSystem {
  readonly id = 'divine-intervention' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '神明干预' as const
  readonly description = '管理神明干预事件：神谕/神迹/天罚/神选之人，依赖B0 divine-creation' as const

  private _state: DivineInterventionState = {
    initialized: false, enabled: false,
    activeOracles: [], activeMiracles: [],
    miracleCooldownTurns: 0, severity: 0, chosenOnes: [],
  }
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) return this._buildResult()
    this._lastProcessedRound = getRoundSequence(context)

    const divineData = context.subsystemStates['divine-creation']?.data as Record<string, unknown> | undefined
    const faithData = context.subsystemStates['faith']?.data as Record<string, unknown> | undefined

    if (!divineData || !(divineData.enabled as boolean)) {
      this._state.enabled = false
      return this._buildResult()
    }

    this._state.enabled = true
    if (!this._state.initialized) this._state.initialized = true

    // 衰减：神谕/神迹 turnsRemaining -1
    this._state.activeOracles = this._state.activeOracles.filter(o => { o.turnsRemaining--; return o.turnsRemaining > 0 })
    this._state.activeMiracles = this._state.activeMiracles.filter(m => { m.turnsRemaining--; return m.turnsRemaining > 0 })
    if (this._state.miracleCooldownTurns > 0) this._state.miracleCooldownTurns--
    if (this._state.severity > 0) this._state.severity = Math.max(0, this._state.severity - 1)

    const faithLevel = (faithData?.devotionLevel as number) ?? 0
    const divineFavor = (divineData?.divineFavor as Record<string, number>) ?? {}
    const hasFavorForOracle = Object.values(divineFavor).some(f => f >= FAVOR_ORACLE_THRESHOLD)
    const hasFavorForMiracle = Object.values(divineFavor).some(f => f >= FAVOR_MIRACLE_THRESHOLD)

    // 神谕
    if (faithLevel >= 60 && hasFavorForOracle && Math.random() < 0.15) {
      if (this._state.activeOracles.length < MAX_ACTIVE_ORACLES) {
        const oracle = ORACLE_TYPES[Math.floor(Math.random() * ORACLE_TYPES.length)]
        this._state.activeOracles.push({ ...oracle, turnsRemaining: 5 })
      }
    }

    // 神迹
    if (faithLevel >= 80 && hasFavorForMiracle && this._state.miracleCooldownTurns === 0 && Math.random() < 0.08) {
      if (this._state.activeMiracles.length < MAX_ACTIVE_MIRACLES) {
        const miracle = MIRACLE_TYPES[Math.floor(Math.random() * MIRACLE_TYPES.length)]
        this._state.activeMiracles.push({ ...miracle, turnsRemaining: 3 })
        this._state.miracleCooldownTurns = 12
      }
    }

    // 天罚
    if (faithLevel <= 15 && Math.random() < 0.20) {
      this._state.severity = Math.min(100, this._state.severity + 5)
    }

    // 天罚淘汰神选（severity≥80 时移除末位神选）
    if (this._state.severity >= 80 && this._state.chosenOnes.length > 0) {
      this._state.chosenOnes.pop()
    }

    // 神选
    if (faithLevel >= 90 && this._state.chosenOnes.length < 3 && Math.random() < 0.05) {
      const prefix = CHOSEN_PREFIXES[Math.floor(Math.random() * CHOSEN_PREFIXES.length)]
      this._state.chosenOnes.push(prefix)
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
    if (typeof c.severity !== 'undefined') this._state.severity = c.severity as number
    void id; void plain;
  }

  reset(): void {
    this._state = { initialized: false, enabled: false, activeOracles: [], activeMiracles: [], miracleCooldownTurns: 0, severity: 0, chosenOnes: [] }
    this._lastProcessedRound = -1
  }

  private _buildResult(): SubSystemState {
    const s = this._state
    if (!s.enabled) return { id: this.id, summary: '', data: structuredClone(s as unknown as Record<string, unknown>) }
    const parts: string[] = []
    if (s.activeOracles.length > 0) parts.push(`神谕${s.activeOracles.length}条`)
    if (s.activeMiracles.length > 0) parts.push(`神迹${s.activeMiracles.length}个`)
    if (s.severity >= 40) parts.push(`⚠️天罚${s.severity >= 80 ? '·神怒' : ''}严重度${s.severity}`)
    if (s.chosenOnes.length > 0) parts.push(`神选之人${s.chosenOnes.length}位`)
    return { id: this.id, summary: parts.length > 0 ? parts.join(' | ') : '此世界安宁，无神明干预', data: structuredClone(s as unknown as Record<string, unknown>) }
  }
}
