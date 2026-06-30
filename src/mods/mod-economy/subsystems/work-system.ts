/**
 * @module WorkSystem
 * @description 工作子系统：职业晋升、收入变化、满意度变化、晋升进度管理
 * @mod mod-economy
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { WorkState, Profession } from '../types'

import {
  PROFESSION_LABELS,
  PROFESSION_BASE_INCOME,
  PROMOTION_XP_THRESHOLD,
  clamp,
  round,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

export class WorkSystem implements ISubSystem {
  readonly id = 'work' as const
  readonly mod = 'mod-economy' as const
  readonly label = '职业工作' as const
  readonly description = '管理职业晋升、收入变化、工作满意度与晋升进度' as const

  private state: WorkState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): WorkState {
    return {
      profession: 'farmer',
      professionLevel: 1,
      income: 5,
      satisfaction: 50,
      promotionProgress: 0,
      careerHistory: [{ profession: 'farmer', years: 0 }],
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

    // 每轮自动推进：收入更新 + 满意度漂移 + 晋升进度积累
    this.advanceWork(context)

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

    // 职业切换
    if (typeof c.profession === 'string') {
      const newProfession = c.profession as Profession
      if (newProfession !== this.state.profession) {
        // 记录旧职业历史
        const existing = this.state.careerHistory.find(
          (h) => h.profession === this.state.profession,
        )
        if (existing) {
          existing.years += 1
        } else {
          this.state.careerHistory.push({
            profession: this.state.profession,
            years: 1,
          })
        }
        this.state.profession = newProfession
        this.state.professionLevel = 1
        this.state.promotionProgress = 0
        this.state.income = PROFESSION_BASE_INCOME[newProfession] ?? 5
        this.state.satisfaction = clamp(this.state.satisfaction - 10, 0, 100)
      }
    }

    // 直接设置职业等级
    if (typeof c.professionLevel === 'number') {
      this.state.professionLevel = clamp(c.professionLevel, 1, 10)
      this.recalcIncome()
    }

    // 直接设置满意度
    if (typeof c.satisfaction === 'number') {
      this.state.satisfaction = clamp(c.satisfaction, 0, 100)
    }

    // 直接设置晋升进度
    if (typeof c.promotionProgress === 'number') {
      this.state.promotionProgress = clamp(c.promotionProgress, 0, 100)
    }

    // 强制晋升
    if (c.forcePromotion === true) {
      this.tryPromotion()
    }

    // 直接设置收入
    if (typeof c.income === 'number') {
      this.state.income = Math.max(0, c.income)
    }
  }

  // ─── 内部推进逻辑 ───

  private advanceWork(context: RoundContext): void {
    const years = getAgeYearsDelta(context)
    if (years <= 0) return

    for (let y = 0; y < years; y++) {
      // 收入基于等级和职业基础调整
      this.recalcIncome()

      // 满意度自然漂移：向中性 50 回归，每次 ±2
      const drift = this.state.satisfaction > 50 ? -2 : 2
      this.state.satisfaction = clamp(this.state.satisfaction + drift, 0, 100)

      // 晋升进度积累：每轮获得 5~15 经验
      const xpGain = 5 + Math.floor(Math.random() * 11)
      this.state.promotionProgress = clamp(
        this.state.promotionProgress + xpGain,
        0,
        PROMOTION_XP_THRESHOLD,
      )

      // 晋升检测
      if (this.state.promotionProgress >= PROMOTION_XP_THRESHOLD) {
        this.tryPromotion()
      }

      // 更新职业历史中年数
      const currentHistory = this.state.careerHistory.find(
        (h) => h.profession === this.state.profession,
      )
      if (currentHistory) {
        currentHistory.years += 1
      }
    }
  }

  private tryPromotion(): void {
    if (this.state.professionLevel >= 10) {
      this.state.promotionProgress = PROMOTION_XP_THRESHOLD
      return
    }
    this.state.professionLevel += 1
    this.state.promotionProgress = 0
    this.state.satisfaction = clamp(this.state.satisfaction + 15, 0, 100)
    this.recalcIncome()
  }

  private recalcIncome(): void {
    const base = PROFESSION_BASE_INCOME[this.state.profession] ?? 5
    // 等级乘数：1 + (level-1) * 0.3
    const multiplier = 1 + (this.state.professionLevel - 1) * 0.3
    // 满意度修正：±20%
    const satisfactionMod = 0.8 + (this.state.satisfaction / 100) * 0.4
    this.state.income = round(
      base * multiplier * satisfactionMod * getFormulaModifier('incomeModifier'),
    )
  }

  // ─── 领域方法 ───

  /** 获取当前职业 */
  getProfession(): Profession {
    return this.state.profession
  }

  /** 获取当前收入 */
  getIncome(): number {
    return this.state.income
  }

  /** 获取职业等级 */
  getProfessionLevel(): number {
    return this.state.professionLevel
  }

  /** 获取工作满意度 */
  getSatisfaction(): number {
    return this.state.satisfaction
  }

  private getSummaryText(): string {
    const profLabel = PROFESSION_LABELS[this.state.profession] ?? this.state.profession
    return `【${this.label}】职业: ${profLabel}, 等级: ${this.state.professionLevel}, 收入: ${this.state.income}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
