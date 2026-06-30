/**
 * @module ReputationSystem
 * @description 声望子系统：声望衰退、知名度事件、维度声望管理
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { ReputationState, ReputationDimension, ReputationEntry } from '../types'

import {
  REPUTATION_RANGE,
  REPUTATION_LABELS,
  getReputationRank,
  round,
  clamp,
} from '../constants'

const ALL_DIMENSIONS: ReputationDimension[] = ['military', 'political', 'academic', 'economic', 'moral', 'religious']

const REPUTATION_TAG_MAP: AttrTagMap = {
  '声望': 'fame', '名声': 'fame', '声誉': 'fame', '威望': 'fame',
}

export class ReputationSystem implements ISubSystem {
  readonly id = 'reputation' as const
  readonly mod = 'mod-culture' as const
  readonly label = '声望系统' as const
  readonly description = '管理声望衰退、知名度事件与各维度声望' as const

  private state: ReputationState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): ReputationState {
    const dimensions: Record<ReputationDimension, ReputationEntry> = {} as Record<ReputationDimension, ReputationEntry>
    for (const dim of ALL_DIMENSIONS) {
      const value = Math.floor(Math.random() * 20) + 10
      dimensions[dim] = {
        dimension: dim,
        value,
        source: '初始声望',
        lastChanged: '0年',
      }
    }
    return {
      dimensions,
      globalReputation: this.computeGlobalReputation(dimensions),
      fame: 10,
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

    this.decayReputation(1)

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

    if (typeof c.yearsAdvanced === 'number') {
      this.decayReputation(c.yearsAdvanced)
    }

    if (typeof c.addReputation === 'number' && typeof c.dimension === 'string') {
      const dim = c.dimension as ReputationDimension
      if (this.state.dimensions[dim]) {
        this.adjustReputation(dim, c.addReputation, typeof c.source === 'string' ? c.source : '未知来源')
      }
    }

    if (typeof c.addFame === 'number') {
      this.state.fame = round(clamp(this.state.fame + c.addFame, REPUTATION_RANGE.min, REPUTATION_RANGE.max))
    }

    if (typeof c.setFame === 'number') {
      this.state.fame = round(clamp(c.setFame, REPUTATION_RANGE.min, REPUTATION_RANGE.max))
    }

    if (c.resetAll === true) {
      for (const dim of ALL_DIMENSIONS) {
        this.state.dimensions[dim].value = 0
        this.state.dimensions[dim].source = '重置'
        this.state.dimensions[dim].lastChanged = '现在'
      }
      this.state.globalReputation = 0
    }

    // P2 降级：AI JSON 未显式声明声望变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || typeof c.addReputation === 'number' ||
      typeof c.addFame === 'number' || typeof c.setFame === 'number' || c.resetAll === true
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, REPUTATION_TAG_MAP)
      if (extracted && typeof extracted.fame === 'number') {
        this.state.fame = round(clamp(this.state.fame + extracted.fame, REPUTATION_RANGE.min, REPUTATION_RANGE.max))
      }
    }
  }

  // ─── 内部逻辑 ───

  /** 声望自然衰退 */
  private decayReputation(years: number): void {
    for (let y = 0; y < years; y++) {
      for (const dim of ALL_DIMENSIONS) {
        const entry = this.state.dimensions[dim]
        // 每 5 年衰减 1 点（分散到每年 0.2 + 微弱随机）
        const decay = 0.2 + Math.random() * 0.1
        entry.value = round(clamp(entry.value - decay, REPUTATION_RANGE.min, REPUTATION_RANGE.max))
      }
      // 知名度缓慢衰减
      this.state.fame = round(clamp(this.state.fame - 0.5, REPUTATION_RANGE.min, REPUTATION_RANGE.max))
    }
    this.state.globalReputation = this.computeGlobalReputation(this.state.dimensions)
  }

  /** 调整某维度声望 */
  private adjustReputation(dimension: ReputationDimension, delta: number, source: string): void {
    const entry = this.state.dimensions[dimension]
    entry.value = round(clamp(entry.value + delta, REPUTATION_RANGE.min, REPUTATION_RANGE.max))
    entry.source = source
    entry.lastChanged = '最近'
    this.state.globalReputation = this.computeGlobalReputation(this.state.dimensions)
  }

  /** 综合计算全局声望 */
  private computeGlobalReputation(dimensions: Record<ReputationDimension, ReputationEntry>): number {
    let sum = 0
    let count = 0
    for (const dim of ALL_DIMENSIONS) {
      sum += dimensions[dim].value
      count++
    }
    return count > 0 ? round(clamp(sum / count, REPUTATION_RANGE.min, REPUTATION_RANGE.max)) : 0
  }

  // ─── 领域方法 ───

  getGlobalReputation(): number {
    return this.state.globalReputation
  }

  getFame(): number {
    return this.state.fame
  }

  getTopDimensions(limit = 3): { dimension: ReputationDimension; value: number; label: string }[] {
    return ALL_DIMENSIONS
      .map((dim) => ({
        dimension: dim,
        value: this.state.dimensions[dim].value,
        label: REPUTATION_LABELS[dim],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
  }

  /** 动态属性值：将全局声望映射到 0-100（供其他系统消费） */
  getDynamicAttrValue(): number {
    return round(clamp((this.state.globalReputation + 100) / 2, 0, 100))
  }

  /** 获取指定维度的等级标签 */
  getDimensionRank(dimension: ReputationDimension): string {
    return getReputationRank(this.state.dimensions[dimension].value)
  }

  private getSummaryText(): string {
    const topDims = this.getTopDimensions(3)
      .map((d) => `${d.label}：${d.value}（${getReputationRank(d.value)}）`)
      .join(' · ')
    return `【${this.label}】全局声望：${this.state.globalReputation}（${getReputationRank(this.state.globalReputation)}） · 知名度：${this.state.fame}${topDims ? ` · ${topDims}` : ''}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
