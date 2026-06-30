/**
 * @module DiscipleSystem
 * @description 弟子子系统：弟子生命周期管理、能力成长、忠诚度变化、成名与陨落
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { DiscipleState, Disciple, DiscipleStatus } from '../types'

import {
  INITIAL_DISCIPLE_CAPACITY,
  MAX_DISCIPLE_CAPACITY,
  DISCIPLE_NAME_PREFIXES,
  DISCIPLE_STATUS_LABELS,
  clamp,
  round,
} from '../constants'

export class DiscipleSystem implements ISubSystem {
  readonly id = 'disciple' as const
  readonly mod = 'mod-culture' as const
  readonly label = '弟子门徒' as const
  readonly description = '管理弟子能力成长、忠诚度变化、生命周期与成名陨落' as const

  private state: DiscipleState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): DiscipleState {
    return {
      disciples: [],
      maxCapacity: INITIAL_DISCIPLE_CAPACITY,
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

    this.advanceDisciples(context)

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

    // 招募新弟子
    if (c.recruitDisciple === true) {
      this.recruitDisciple(
        typeof c.discipleName === 'string' ? c.discipleName : undefined,
        typeof c.discipleTalent === 'number' ? c.discipleTalent : undefined,
        typeof c.discipleFocus === 'string' ? c.discipleFocus : '修炼',
      )
    }

    // 移除弟子（叛离/出师/死亡）
    if (typeof c.removeDiscipleId === 'string') {
      this.removeDisciple(c.removeDiscipleId)
    }

    // 调整弟子忠诚度
    if (typeof c.discipleId === 'string' && typeof c.loyaltyDelta === 'number') {
      const d = this.state.disciples.find((disc) => disc.id === c.discipleId)
      if (d) {
        d.loyalty = clamp(d.loyalty + c.loyaltyDelta, 0, 100)
      }
    }

    // 调整容量
    if (typeof c.maxCapacity === 'number') {
      this.state.maxCapacity = clamp(c.maxCapacity, 0, MAX_DISCIPLE_CAPACITY)
    }

    // 直接设置弟子列表（AI 适配）
    if (Array.isArray(c.disciples)) {
      this.state.disciples = c.disciples as Disciple[]
    }

    // 设置弟子阶段
    if (typeof c.discipleId === 'string' && typeof c.discipleStatus === 'string') {
      const d = this.state.disciples.find((disc) => disc.id === c.discipleId)
      if (d) {
        d.status = c.discipleStatus as DiscipleStatus
      }
    }
  }

  // ─── 内部推进逻辑 ───

  private advanceDisciples(context: RoundContext): void {
    const years = getAgeYearsDelta(context)
    if (years <= 0) return

    const toRemove: string[] = []

    for (const disciple of this.state.disciples) {
      for (let y = 0; y < years; y++) {
        // 年龄增长
        disciple.age++

        // 已故或远离的弟子跳过其他计算
        if (disciple.status === 'deceased' || disciple.status === 'departed') continue

        // ── 能力成长（天赋驱动） ──
        if (disciple.status === 'apprentice' || disciple.status === 'mature') {
          const abilityGain = round((disciple.talent / 10) * (0.5 + Math.random()))
          disciple.abilityScore = clamp(disciple.abilityScore + abilityGain, 0, 100)
        }

        // ── 忠诚度自然漂移 ──
        const drift = disciple.loyalty > 50 ? -1 : 1
        disciple.loyalty = clamp(disciple.loyalty + drift, 0, 100)

        // ── 生命周期阶段过渡 ──

        // 入门 → 出师（能力≥50 时）
        if (disciple.status === 'apprentice' && disciple.abilityScore >= 50) {
          disciple.status = 'mature'
        }

        // 出师 → 名扬（每年 4% 概率）
        if (disciple.status === 'mature' && Math.random() < 0.04) {
          disciple.status = 'famous'
          disciple.achievement = `第${this._lastProcessedRound}年名扬天下`
        }

        // 年龄≥75 时陨落检测（每年 10% 概率）
        if (disciple.age >= 75 && Math.random() < 0.1) {
          disciple.status = 'deceased'
        }

        // 叛离检测（忠诚度<10 时 5% 概率）
        if (disciple.loyalty < 10 && Math.random() < 0.05) {
          toRemove.push(disciple.id)
        }
      }
    }

    // 清理叛离弟子
    if (toRemove.length > 0) {
      this.state.disciples = this.state.disciples.filter((d) => !toRemove.includes(d.id))
    }
  }

  private recruitDisciple(name?: string, talent?: number, focus?: string): void {
    if (this.state.disciples.length >= this.state.maxCapacity) return

    const randomPrefix = DISCIPLE_NAME_PREFIXES[
      Math.floor(Math.random() * DISCIPLE_NAME_PREFIXES.length)
    ]
    const discipleName = name ?? `${randomPrefix}弟子`

    const newDisciple: Disciple = {
      id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: discipleName,
      loyalty: 50 + Math.floor(Math.random() * 20),
      talent: talent ?? (20 + Math.floor(Math.random() * 60)),
      focus: focus ?? '修炼',
      abilityScore: 5 + Math.floor(Math.random() * 10),
      joinedYear: (this._lastProcessedRound > 0 ? this._lastProcessedRound : 1),
      age: 16 + Math.floor(Math.random() * 10),
      status: 'apprentice',
    }

    this.state.disciples.push(newDisciple)
  }

  private removeDisciple(discipleId: string): void {
    this.state.disciples = this.state.disciples.filter((d) => d.id !== discipleId)
  }

  // ─── 领域方法 ───

  getDiscipleCount(): number {
    return this.state.disciples.filter(
      (d) => d.status !== 'deceased' && d.status !== 'departed',
    ).length
  }

  getMaxCapacity(): number {
    return this.state.maxCapacity
  }

  getDisciples(): Disciple[] {
    return this.state.disciples
  }

  hasCapacity(): boolean {
    return this.getDiscipleCount() < this.state.maxCapacity
  }

  getPosthumousBonus(): number {
    return this.state.disciples.filter((d) => d.status === 'famous').length * 3
  }

  formatForPrompt(): string {
    const lines: string[] = []
    const active = this.state.disciples.filter(
      (d) => d.status !== 'deceased' && d.status !== 'departed',
    )
    const famous = this.state.disciples.filter((d) => d.status === 'famous')

    lines.push(`【弟子概况】共 ${active.length} 位门徒，其中名扬 ${famous.length} 人`)
    lines.push(`容量：${this.getDiscipleCount()}/${this.state.maxCapacity}`)
    lines.push('')

    if (active.length > 0) {
      lines.push('当前弟子：')
      for (const d of active) {
        const statusLabel = DISCIPLE_STATUS_LABELS[d.status] ?? d.status
        const progress = d.abilityScore < 50
          ? `进度 ${Math.round(d.abilityScore / 50 * 100)}%`
          : `能力 ${d.abilityScore}`
        lines.push(`  · ${d.name}（${d.age}岁·${statusLabel}·${progress}·忠诚 ${d.loyalty}·天赋 ${d.talent}）`)
      }
    } else {
      lines.push('尚无弟子。')
    }
    lines.push('')

    const inactive = this.state.disciples.filter(
      (d) => d.status === 'deceased' || d.status === 'departed',
    )
    if (inactive.length > 0) {
      lines.push('已故/远离弟子：')
      for (const d of inactive) {
        const statusLabel = DISCIPLE_STATUS_LABELS[d.status] ?? d.status
        lines.push(`  · ${d.name}（${statusLabel}，终年 ${d.age} 岁${d.achievement ? `，${d.achievement}` : ''}）`)
      }
    }

    return lines.join('\n')
  }

  private getSummaryText(): string {
    const active = this.state.disciples.filter(
      (d) => d.status !== 'deceased' && d.status !== 'departed',
    ).length
    return `【${this.label}】弟子数: ${active}, 容量: ${this.state.maxCapacity}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
