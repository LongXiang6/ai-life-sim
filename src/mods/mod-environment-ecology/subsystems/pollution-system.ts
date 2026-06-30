/**
 * @module PollutionSystem
 * @description 污染子系统：区域污染累积 + 自然衰减 + 污染等级判定 + 全球污染指数
 * @mod mod-environment-ecology
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { PollutionState, PollutionLevel, RegionPollution, IndustryType } from '../types'

import {
  NATURAL_DECAY_RATE,
  INDUSTRY_EMISSION_MAP,
} from '../constants'
import {
  getPollutionLevel,
  round,
  clamp,
} from '../utils'

import { getFormulaModifier } from '@/mods/mod-world'
const DISASTER_PULSE_PER_DISASTER = 2

const POLLUTION_TAG_MAP: AttrTagMap = {
  '污染': 'globalPollutionIndex', '排放': 'globalPollutionIndex', '排污': 'globalPollutionIndex',
}

export class PollutionSystem implements ISubSystem {
  readonly id = 'pollution' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '污染' as const
  readonly description = '管理区域污染累积、自然衰减、污染等级判定与全球污染指数' as const

  private state: PollutionState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): PollutionState {
    return {
      regionPollutions: {},
      globalPollutionIndex: 0,
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

    // 更新所有区域污染（含灾害联动 & 产业差异化排放）
    this.updateAllRegions(context)

    // 重新计算全球污染指数
    this.recalculateGlobalIndex()

    return {
      id: this.id,
      summary: this.getSummaryText(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
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

    // 推进年份
    if (typeof c.yearsAdvanced === 'number') {
      for (let i = 0; i < c.yearsAdvanced; i++) {
        this.updateAllRegions(context)
      }
      this.recalculateGlobalIndex()
    }

    // 添加/初始化区域污染
    if (c.addRegionPollution && typeof c.addRegionPollution === 'object') {
      const r = c.addRegionPollution as Record<string, unknown>
      const regionId = typeof r.regionId === 'string' ? r.regionId : ''
      if (regionId) {
        const industrialEmission = typeof r.industrialEmission === 'number' ? r.industrialEmission : 0
        const level = getPollutionLevel(industrialEmission)
        const industryType = (typeof r.industryType === 'string' ? r.industryType : 'mixed') as IndustryType
        this.state.regionPollutions[regionId] = {
          regionId,
          industrialEmission,
          level,
          decayRate: typeof r.decayRate === 'number' ? r.decayRate : NATURAL_DECAY_RATE,
          industryType,
        }
      }
    }

    // 设置排放量
    if (c.setEmission && typeof c.setEmission === 'object') {
      const emission = c.setEmission as Record<string, unknown>
      for (const [regionId, value] of Object.entries(emission)) {
        if (typeof value === 'number') {
          if (this.state.regionPollutions[regionId]) {
            this.state.regionPollutions[regionId].industrialEmission = clamp(value, 0, 100)
            this.state.regionPollutions[regionId].level = getPollutionLevel(
              this.state.regionPollutions[regionId].industrialEmission,
            )
          }
        }
      }
    }

    // P2 降级：AI JSON 未显式声明污染变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || c.addRegionPollution || c.setEmission
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, POLLUTION_TAG_MAP)
      if (extracted && typeof extracted.globalPollutionIndex === 'number') {
        this.recalculateGlobalIndex()
        this.state.globalPollutionIndex = clamp(
          this.state.globalPollutionIndex + extracted.globalPollutionIndex, 0, 100,
        )
      }
    }
  }

  // ─── 内部推进逻辑 ───

  private updateAllRegions(context: RoundContext): void {
    // 从 climate 子系统读取活跃灾害数
    let activeDisasterCount = 0
    const climateState = context.subsystemStates['climate']
    if (climateState?.data) {
      const data = climateState.data as { activeDisasters?: unknown[] }
      activeDisasterCount = data.activeDisasters?.length ?? 0
    }

    for (const [regionId, pollution] of Object.entries(this.state.regionPollutions)) {
      // 1. 产业差异化排放（按区域 industryType 查表）
      const emissionValue = INDUSTRY_EMISSION_MAP[pollution.industryType] ?? INDUSTRY_EMISSION_MAP.mixed
      const emissionIncrement = emissionValue + (Math.random() - 0.3) * 0.5
      pollution.industrialEmission = round(
        clamp(pollution.industrialEmission + emissionIncrement, 0, 100),
      )

      // 2. 自然衰减
      const decay = pollution.decayRate * getFormulaModifier('pollutionDecayModifier') * (1 + (Math.random() - 0.5) * 0.2)
      pollution.industrialEmission = round(
        clamp(pollution.industrialEmission - decay, 0, 100),
      )

      // 3. 灾害脉冲：每个活跃灾害 +2 污染
      if (activeDisasterCount > 0) {
        const pulse = activeDisasterCount * DISASTER_PULSE_PER_DISASTER
        pollution.industrialEmission = round(
          clamp(pollution.industrialEmission + pulse, 0, 100),
        )
      }

      // 重新计算污染等级
      pollution.level = getPollutionLevel(pollution.industrialEmission)

      this.state.regionPollutions[regionId] = pollution
    }
  }

  private recalculateGlobalIndex(): void {
    const regions = Object.values(this.state.regionPollutions)
    if (regions.length === 0) {
      this.state.globalPollutionIndex = 0
      return
    }
    const sum = regions.reduce((acc, r) => acc + r.industrialEmission, 0)
    this.state.globalPollutionIndex = round(sum / regions.length)
  }

  // ─── 领域方法 ───

  /** 获取全球污染指数 */
  getGlobalPollutionIndex(): number {
    return this.state.globalPollutionIndex
  }

  /** 获取指定区域的污染等级 */
  getRegionPollutionLevel(regionId: string): PollutionLevel {
    return this.state.regionPollutions[regionId]?.level ?? 0
  }

  /** 获取所有区域污染数据 */
  getAllRegionPollutions(): Record<string, RegionPollution> {
    return this.state.regionPollutions
  }

  /** 基于全球污染指数获取健康修正值 */
  getPollutionHealthMod(): number {
    const index = this.state.globalPollutionIndex
    if (index < 20) return 0
    if (index < 40) return -3
    if (index < 60) return -6
    if (index < 80) return -10
    return -15
  }

  private getSummaryText(): string {
    const regionCount = Object.keys(this.state.regionPollutions).length
    const fatalCount = Object.values(this.state.regionPollutions).filter(
      (r) => r.level === 5,
    ).length
    return `【${this.label}】全球污染指数 ${this.state.globalPollutionIndex.toFixed(1)} · 区域 ${regionCount}个 · 致命区域 ${fatalCount}个`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
