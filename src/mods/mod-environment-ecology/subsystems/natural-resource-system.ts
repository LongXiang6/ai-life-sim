/**
 * @module NaturalResourceSystem
 * @description 自然资源子系统：世界级宏观资源储量、再生速率、消耗速率、危机警报
 * @mod mod-environment-ecology
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { NaturalResourceState, NaturalResourceType, ResourceMetrics } from '../types'

import {
  INITIAL_RESOURCE_RESERVES,
  BASE_REGENERATION_RATE,
  BASE_CONSUMPTION_RATE,
  RESOURCE_DEPLETION_THRESHOLD,
  OVEREXPLOITATION_THRESHOLD,
  LOW_RESERVE_THRESHOLD,
  RESOURCE_TYPE_LABELS,
} from '../constants'
import {
  round,
  clamp,
} from '../utils'

import { getFormulaModifier } from '@/mods/mod-world'

/** 不可再生资源 */
const NON_RENEWABLE: readonly NaturalResourceType[] = ['mineral', 'energy', 'special']

const RESOURCE_TAG_MAP: AttrTagMap = {
  '资源': 'totalReserves', '矿产': 'totalReserves', '能源': 'totalReserves',
  '消耗': 'consumptionRate', '再生': 'regenerationRate',
}

export class NaturalResourceSystem implements ISubSystem {
  readonly id = 'natural-resource' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '自然资源' as const
  readonly description = '管理世界级宏观资源储量、再生速率、消耗速率与危机警报' as const

  private state: NaturalResourceState = this.createInitialState()
  private _lastProcessedRound = -1
  private _worldview = 'default'

  private createInitialState(worldview?: string): NaturalResourceState {
    const resources = {} as Record<NaturalResourceType, ResourceMetrics>
    const types: NaturalResourceType[] = ['mineral', 'forest', 'water', 'farmland', 'energy', 'special']

    for (const type of types) {
      let base = INITIAL_RESOURCE_RESERVES[type]

      if (worldview === 'cultivation' && type === 'special') {
        base += 20
      } else if (worldview === 'post-apocalyptic') {
        base -= 30
      } else if (worldview === 'sci-fi' && type === 'energy') {
        base += 10
      }

      resources[type] = {
        type,
        totalReserves: clamp(base, 0, 100),
        regenerationRate: BASE_REGENERATION_RATE[type],
        consumptionRate: BASE_CONSUMPTION_RATE[type],
        renewable: !NON_RENEWABLE.includes(type),
      }
    }

    return {
      resources,
      alarms: [],
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

    // 每回合更新所有资源储量
    this.updateAllResources(context)

    // 检查警报
    this.checkAlarms()

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

    // 设置世界观（影响初始储量）
    if (typeof c.worldview === 'string') {
      this._worldview = c.worldview
    }

    // 推进年份
    if (typeof c.yearsAdvanced === 'number') {
      for (let i = 0; i < c.yearsAdvanced; i++) {
        this.updateAllResources(context)
      }
      this.checkAlarms()
    }

    // 设置特定资源储量
    if (c.setReserves && typeof c.setReserves === 'object') {
      const reserves = c.setReserves as Record<string, unknown>
      for (const [type, value] of Object.entries(reserves)) {
        if (this.state.resources[type as NaturalResourceType] && typeof value === 'number') {
          this.state.resources[type as NaturalResourceType].totalReserves = clamp(value, 0, 100)
        }
      }
    }

    // 调整消耗速率
    if (c.adjustConsumptionRate && typeof c.adjustConsumptionRate === 'object') {
      const rates = c.adjustConsumptionRate as Record<string, unknown>
      for (const [type, value] of Object.entries(rates)) {
        if (this.state.resources[type as NaturalResourceType] && typeof value === 'number') {
          this.state.resources[type as NaturalResourceType].consumptionRate = clamp(value, 0, Infinity)
        }
      }
    }

    // 调整再生速率
    if (c.adjustRegenerationRate && typeof c.adjustRegenerationRate === 'object') {
      const rates = c.adjustRegenerationRate as Record<string, unknown>
      for (const [type, value] of Object.entries(rates)) {
        if (this.state.resources[type as NaturalResourceType] && typeof value === 'number') {
          this.state.resources[type as NaturalResourceType].regenerationRate = clamp(value, 0, Infinity)
        }
      }
    }

    // P2 降级：AI JSON 未显式声明资源变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || c.setReserves || c.adjustConsumptionRate || c.adjustRegenerationRate
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, RESOURCE_TAG_MAP)
      if (extracted) {
        if (typeof extracted.totalReserves === 'number') {
          for (const type of Object.keys(this.state.resources) as NaturalResourceType[]) {
            this.state.resources[type].totalReserves = clamp(
              this.state.resources[type].totalReserves + extracted.totalReserves, 0, 100,
            )
          }
        }
        if (typeof extracted.consumptionRate === 'number') {
          for (const type of Object.keys(this.state.resources) as NaturalResourceType[]) {
            this.state.resources[type].consumptionRate = clamp(this.state.resources[type].consumptionRate + extracted.consumptionRate, 0, Infinity)
          }
        }
        if (typeof extracted.regenerationRate === 'number') {
          for (const type of Object.keys(this.state.resources) as NaturalResourceType[]) {
            this.state.resources[type].regenerationRate = clamp(this.state.resources[type].regenerationRate + extracted.regenerationRate, 0, Infinity)
          }
        }
      }
    }
  }

  // ─── 内部推进逻辑 ───

  private updateAllResources(context?: RoundContext): void {
    const types: NaturalResourceType[] = ['mineral', 'forest', 'water', 'farmland', 'energy', 'special']
    const climateStability = this.getClimateStability(context)

    for (const type of types) {
      const res = this.state.resources[type]

      // 气候-资源联动：气候不稳定时森林/水源消耗加速
      let effectiveConsumption = res.consumptionRate * getFormulaModifier('resourceConsumptionModifier')
      if (climateStability < 60 && (type === 'forest' || type === 'water')) {
        effectiveConsumption *= 1 + (60 - climateStability) / 100
      }

      // 过度开发加速：储量 > OVEREXPLOITATION_THRESHOLD 时消耗速率 ×1.5
      const effectiveRegeneration = res.regenerationRate
      if (res.totalReserves > OVEREXPLOITATION_THRESHOLD) {
        effectiveConsumption *= 1.5
      }

      // 储量变更 = 再生 - 消耗
      const netChange = effectiveRegeneration - effectiveConsumption
      res.totalReserves = round(clamp(res.totalReserves + netChange, 0, 100))

      // 再生速率微小随机波动 ±5%
      const fluctuation = 1 + (Math.random() - 0.5) * 0.1
      res.regenerationRate = round(
        clamp(BASE_REGENERATION_RATE[type] * fluctuation, 0, Infinity),
      )

      // 低储量时再生速率打 8 折（低品位矿难再生）
      if (res.totalReserves < LOW_RESERVE_THRESHOLD) {
        res.regenerationRate = round(res.regenerationRate * 0.8)
      }
    }
  }

  /** 从气候子系统数据推导气候稳定性（0-100），无气候数据则降级为 100 */
  private getClimateStability(context?: RoundContext): number {
    if (!context) return 100

    const climateData = context.subsystemStates['climate']?.data as Record<string, unknown> | undefined
    if (!climateData) return 100

    let stability = 100

    const activeDisasters = climateData['activeDisasters'] as unknown[] | undefined
    if (Array.isArray(activeDisasters)) {
      stability -= activeDisasters.length * 15
    }

    const tempOffset = climateData['temperatureOffset'] as number | undefined
    if (typeof tempOffset === 'number' && Math.abs(tempOffset) > 10) {
      stability -= (Math.abs(tempOffset) - 10) * 2
    }

    const humidity = climateData['humidity'] as number | undefined
    if (typeof humidity === 'number') {
      if (humidity < 20) stability -= (20 - humidity) * 0.5
      if (humidity > 80) stability -= (humidity - 80) * 0.5
    }

    return clamp(stability, 0, 100)
  }

  private checkAlarms(): void {
    const newAlarms: string[] = []
    const types: NaturalResourceType[] = ['mineral', 'forest', 'water', 'farmland', 'energy', 'special']

    for (const type of types) {
      const res = this.state.resources[type]
      const label = RESOURCE_TYPE_LABELS[type] ?? type

      if (res.totalReserves < RESOURCE_DEPLETION_THRESHOLD) {
        newAlarms.push(`${label}资源濒临枯竭（储量${res.totalReserves.toFixed(0)}）`)
      } else if (res.totalReserves < RESOURCE_DEPLETION_THRESHOLD * 2) {
        newAlarms.push(`${label}资源储量偏低（储量${res.totalReserves.toFixed(0)}）`)
      }
    }

    this.state.alarms = newAlarms
  }

  // ─── 领域方法 ───

  /** 获取指定资源的储量 */
  getReserves(type: NaturalResourceType): number {
    return this.state.resources[type]?.totalReserves ?? 0
  }

  /** 获取所有资源指标 */
  getAllResources(): Record<NaturalResourceType, ResourceMetrics> {
    return this.state.resources
  }

  /** 获取当前警报 */
  getAlarms(): string[] {
    return this.state.alarms
  }

  private getSummaryText(): string {
    const mineral = this.state.resources['mineral']?.totalReserves.toFixed(0) ?? '0'
    const forest = this.state.resources['forest']?.totalReserves.toFixed(0) ?? '0'
    const water = this.state.resources['water']?.totalReserves.toFixed(0) ?? '0'
    const farmland = this.state.resources['farmland']?.totalReserves.toFixed(0) ?? '0'
    const energy = this.state.resources['energy']?.totalReserves.toFixed(0) ?? '0'
    return `【${this.label}】矿产 ${mineral} · 森林 ${forest} · 水源 ${water} · 耕地 ${farmland} · 能源 ${energy} · 警报 ${this.state.alarms.length}`
  }

  reset(): void {
    this.state = this.createInitialState(this._worldview)
    this._lastProcessedRound = -1
    this._worldview = 'default'
  }
}
