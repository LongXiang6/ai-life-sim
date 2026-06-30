/**
 * @module SocialValuesSystem
 * @description 社会价值子系统：主导权竞争机制 + 季度推进 + 跨系统权重修正 + 世界观过滤
 * @mod mod-politics
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { SocialValuesState, SocialValue } from '../types'

import {
  getValuesForWorldview,
  SHIFT_GAP,
  SHIFT_PROGRESS_MAX,
  clamp,
} from '../constants'

export class SocialValuesSystem implements ISubSystem {
  readonly id = 'social-values' as const
  readonly mod = 'mod-politics' as const
  readonly label = '社会价值' as const
  readonly description = '管理社会价值观体系、主导权竞争、跨系统权重修正、世代变迁' as const

  private state: SocialValuesState = this.createInitialState()
  private _lastProcessedRound = -1
  private _worldview = 'historical'

  /** 设置世界观（影响初始价值观选择） */
  setWorldview(wv: string): void {
    this._worldview = wv
    if (this._lastProcessedRound < 0) {
      this.state = this.createInitialState()
    }
  }

  private createInitialState(): SocialValuesState {
    const configs = getValuesForWorldview(this._worldview, 5)
    const values: SocialValue[] = configs.map((cfg) => ({
      name: cfg.name,
      importance: clamp(cfg.defaultPriority + Math.floor(Math.random() * 30) - 15, 10, 100),
      adherentRatio: clamp(0.1 + Math.random() * 0.3, 0, 1),
      description: cfg.description,
      weightModifiers: { ...cfg.weightModifiers },
    }))
    values.sort((a, b) => b.importance - a.importance)

    return {
      values,
      generationalShiftRate: 0.02,
      dominantValue: values.length > 0 ? values[0].name : '',
      valueShiftProgress: 0,
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
    this.advanceValues(getAgeYearsDelta(context))
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

    if (c.adaptationType === 'values-init' && Array.isArray(c.valueNames)) {
      const names = (c.valueNames as unknown[]).filter((v): v is string => typeof v === 'string')
      this.state.values = names.map((name) => ({
        name,
        importance: 30 + Math.floor(Math.random() * 50),
        adherentRatio: 0.05 + Math.random() * 0.3,
        description: `${name}是社会的核心价值取向`,
        weightModifiers: {} as Record<string, number>,
      }))
      this.state.values.sort((a, b) => b.importance - a.importance)
      this.state.dominantValue = this.state.values.length > 0 ? this.state.values[0].name : ''
      this.state.valueShiftProgress = 0
      return
    }

    if (typeof c.generationalShiftRate === 'number') {
      this.state.generationalShiftRate = clamp(c.generationalShiftRate as number, 0, 0.5)
    }

    // 直接设置主导价值观
    if (typeof c.dominantValue === 'string') {
      const exists = this.state.values.some(v => v.name === c.dominantValue)
      if (exists) {
        this.state.dominantValue = c.dominantValue
        this.state.valueShiftProgress = 0
      }
    }

    if (typeof c.valueShiftDelta === 'number') {
      this.state.valueShiftProgress = clamp(
        this.state.valueShiftProgress + (c.valueShiftDelta as number),
        0,
        100,
      )
    }

    if (Array.isArray(c.values)) {
      const newValues: SocialValue[] = []
      for (const v of c.values as unknown[]) {
        if (v && typeof v === 'object') {
          const item = v as Record<string, unknown>
          if (typeof item.name === 'string') {
            newValues.push({
              name: item.name,
              importance: clamp(typeof item.importance === 'number' ? item.importance : 50, 0, 100),
              adherentRatio: clamp(typeof item.adherentRatio === 'number' ? item.adherentRatio : 0.1, 0, 1),
              description: typeof item.description === 'string' ? item.description : '',
              weightModifiers: item.weightModifiers !== null && typeof item.weightModifiers === 'object'
                ? { ...(item.weightModifiers as Record<string, number>) }
                : {} as Record<string, number>,
            })
          }
        }
      }
      if (newValues.length > 0) {
        this.state.values = newValues.sort((a, b) => b.importance - a.importance)
      }
    }
  }

  // ─── 内部推进逻辑 ───

  /**
   * 季度推进（每年 4 个季度）+ 主导权竞争
   * 每季度 importance ±1（匹配废案 ±1/quarter），每年总计 ±4
   */
  private advanceValues(yearsElapsed: number): void {
    const quarters = clamp(Math.round(yearsElapsed * 4), 0, Infinity)
    if (quarters <= 0) return

    for (let q = 0; q < quarters; q++) {
      for (const v of this.state.values) {
        // 重要性每季度 ±1
        v.importance = clamp(
          v.importance + (Math.random() - 0.5) * 2,
          0,
          100,
        )
        // 拥护者比例每季度微幅波动
        v.adherentRatio = clamp(
          v.adherentRatio + (Math.random() - 0.5) * 0.02 * (this.state.generationalShiftRate * 50),
          0,
          1,
        )
      }
      // 按重要性递减排序
      this.state.values.sort((a, b) => b.importance - a.importance)

      // 主导权竞争
      this.processDominantValueCompetition()
    }
  }

  /** 主导权竞争检测：当挑战者 importance 超过主导值 SHIFT_GAP(10) 时积累进度 */
  private processDominantValueCompetition(): void {
    const top = this.state.values[0]
    if (!top) return

    const dominant = this.state.values.find(v => v.name === this.state.dominantValue)
    if (!dominant) {
      this.state.dominantValue = top.name
      this.state.valueShiftProgress = 0
      return
    }

    // 如果顶值不是主导值，且超过主导值的差值 >= SHIFT_GAP
    if (top.name !== dominant.name && top.importance >= dominant.importance + SHIFT_GAP) {
      this.state.valueShiftProgress = Math.min(
        SHIFT_PROGRESS_MAX,
        this.state.valueShiftProgress + 5,
      )

      // 进度达到 100 → 切换主导权
      if (this.state.valueShiftProgress >= SHIFT_PROGRESS_MAX) {
        this.state.dominantValue = top.name
        this.state.valueShiftProgress = 0
      }
    } else {
      // 无挑战者时进度衰减
      this.state.valueShiftProgress = clamp(this.state.valueShiftProgress - 2, 0, Infinity)
    }
  }

  // ─── 领域方法 ───

  /** 获取当前主导价值观 */
  getDominantValue(): SocialValue | undefined {
    return this.state.values.find(v => v.name === this.state.dominantValue)
  }

  /** 获取跨系统权重修正（对指定系统的总修正值） */
  getSystemModifier(systemName: string): number {
    const dominant = this.getDominantValue()
    if (!dominant) return 0
    return dominant.weightModifiers[systemName] ?? 0
  }

  getTopValues(n: number): SocialValue[] {
    return this.state.values.slice(0, n)
  }

  getValueByName(name: string): SocialValue | undefined {
    return this.state.values.find((v) => v.name === name)
  }

  formatForPrompt(): string {
    const top = this.getTopValues(3)
    const dominant = this.getDominantValue()
    const parts: string[] = top.map((v) => {
      const isDominant = v.name === dominant?.name
      const marker = isDominant ? '★主导' : ''
      return `${v.name}（重要度${Math.round(v.importance)}、拥护${Math.round(v.adherentRatio * 100)}%${marker ? `、${marker}` : ''}）`
    })

    if (this.state.valueShiftProgress > 0) {
      parts.push(`【世风渐变】主导权变迁进度 ${Math.round(this.state.valueShiftProgress)}%`)
    }

    return parts.join('、')
  }

  private getSummaryText(): string {
    const top = this.state.values.slice(0, 3)
    const parts = top.map((v) => `${v.name}:${Math.round(v.importance)}`)
    const dv = this.getDominantValue()
    if (dv) {
      return `【${this.label}】主导:${dv.name}，${parts.join('，')}`
    }
    return `【${this.label}】${parts.join('，')}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
    this._worldview = 'historical'
  }
}
