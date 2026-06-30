/**
 * @module ClimateSystem
 * @description 气候子系统：季节推进 + 气温/湿度波动 + 灾害触发/过期
 * @mod mod-environment-ecology
 */
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { ClimateState, ClimateZone, Disaster, SpecialSeason } from '../types'

import {
  SEASON_ORDER,
  SEASON_LABELS,
  SEASON_EFFECTS,
  WORLD_SPECIAL_SEASONS,
  DISASTER_BASE_SEVERITY,
  DISASTER_POOL_BY_WORLDVIEW,
  SEASON_DURATION,
} from '../constants'
import {
  round,
  clamp,
  pickRandom,
  randomInt,
} from '../utils'

import { getFormulaModifier, resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

const CLIMATE_TAG_MAP: AttrTagMap = {
  '气温': 'temperatureOffset', '温度': 'temperatureOffset',
  '湿度': 'humidity', '降雨': 'humidity',
}

export class ClimateSystem implements ISubSystem {
  readonly id = 'climate' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '气候' as const
  readonly description = '管理季节推进、气温湿度波动、灾害触发与过期' as const

  private state: ClimateState = this.createInitialState()
  private _lastProcessedRound = -1

  /** 当前世界观（用于灾害池选择） */
  private _worldview = 'default'

  private createInitialState(): ClimateState {
    return {
      temperatureOffset: 0,
      humidity: 50,
      season: 'spring',
      seasonProgress: 0,
      seasonEffects: { ...SEASON_EFFECTS['spring'] },
      specialSeason: null,
      activeDisasters: [],
      climateZones: {},
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

    const years = getAgeYearsDelta(context)
    if (years <= 0) {
      return {
        id: this.id,
        summary: this.getSummaryText(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }

    // 季节推进（按模拟年缩放）
    this.advanceSeason(years)

    // 气温/湿度随机波动
    this.fluctuateClimate(years)

    // 灾害触发
    this.triggerDisasters(context, years)

    // 灾害过期
    this.expireDisasters(years)

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

    // 设置世界观（用于选择灾害池和特殊季节）
    if (typeof c.worldview === 'string') {
      this._worldview = c.worldview
      this.state.specialSeason = this.checkSpecialSeason()
    }

    // 推进年份
    if (typeof c.yearsAdvanced === 'number') {
      for (let i = 0; i < c.yearsAdvanced; i++) {
        this.advanceSeason(1)
        this.fluctuateClimate(1)
      }
      // 灾害推进
      this.advanceDisasters(c.yearsAdvanced)
    }

    // 直接设置季节
    if (typeof c.setSeason === 'string') {
      const idx = SEASON_ORDER.indexOf(c.setSeason)
      if (idx !== -1) {
        this.state.season = c.setSeason as ClimateState['season']
        this.state.seasonProgress = 0
      }
    }

    // 添加灾害
    if (c.addDisaster && typeof c.addDisaster === 'object') {
      const d = c.addDisaster as Record<string, unknown>
      const disaster: Disaster = {
        type: (typeof d.type === 'string' ? d.type : 'storm') as Disaster['type'],
        severity: typeof d.severity === 'number' ? clamp(d.severity, 0, 100) : 50,
        affectedRegions: Array.isArray(d.affectedRegions)
          ? d.affectedRegions.filter((r): r is string => typeof r === 'string')
          : [],
        year: typeof d.year === 'number' ? d.year : (_context.round?.year ?? 0),
        duration: typeof d.duration === 'number' ? Math.max(1, d.duration) : 3,
      }
      this.state.activeDisasters = [...this.state.activeDisasters, disaster]
    }

    // 清除所有灾害
    if (c.clearDisasters === true) {
      this.state.activeDisasters = []
    }

    // 直接设置温度偏移
    if (typeof c.temperatureOffset === 'number') {
      this.state.temperatureOffset = clamp(c.temperatureOffset, -20, 20)
    }

    // 直接设置湿度
    if (typeof c.humidity === 'number') {
      this.state.humidity = clamp(c.humidity, 0, 100)
    }

    // 设置气候带
    if (c.climateZones && typeof c.climateZones === 'object' && !Array.isArray(c.climateZones)) {
      const zones = c.climateZones as Record<string, unknown>
      for (const [regionId, zone] of Object.entries(zones)) {
        if (typeof zone === 'string') {
          this.state.climateZones[regionId] = zone as ClimateZone
        }
      }
    }

    // P2 降级：AI JSON 未显式声明气候变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || typeof c.setSeason === 'string' ||
      typeof c.addDisaster === 'object' || c.clearDisasters || typeof c.temperatureOffset === 'number' ||
      typeof c.humidity === 'number' || c.climateZones
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, CLIMATE_TAG_MAP)
      if (extracted) {
        if (typeof extracted.temperatureOffset === 'number') {
          this.state.temperatureOffset = clamp(this.state.temperatureOffset + extracted.temperatureOffset, -20, 20)
        }
        if (typeof extracted.humidity === 'number') {
          this.state.humidity = clamp(this.state.humidity + extracted.humidity, 0, 100)
        }
      }
    }
  }

  // ─── 内部推进逻辑 ───

  private advanceSeason(years: number): void {
    this.state.seasonProgress += SEASON_DURATION * years
    if (this.state.seasonProgress >= 100) {
      this.state.seasonProgress = 0
      const currentIdx = SEASON_ORDER.indexOf(this.state.season)
      const nextIdx = (currentIdx + 1) % SEASON_ORDER.length
      this.state.season = SEASON_ORDER[nextIdx] as ClimateState['season']
    }
    // 同步更新季节效果乘数
    const fx = SEASON_EFFECTS[this.state.season]
    if (fx) {
      this.state.seasonEffects = { ...fx }
    }
    // 检查世界观特殊季节
    this.state.specialSeason = this.checkSpecialSeason()
  }

  /** 查询当前世界观是否匹配特殊季节 */
  private checkSpecialSeason(): SpecialSeason | null {
    const seasons = WORLD_SPECIAL_SEASONS[this._worldview]
    if (!seasons || seasons.length === 0) return null
    // 特殊季节在春夏交替时触发（seasonProgress 为 0 时）
    if (this.state.seasonProgress === 0 && this.state.season === 'spring') {
      return seasons[0] ?? null
    }
    return this.state.specialSeason
  }

  private fluctuateClimate(years: number): void {
    this.state.temperatureOffset = round(
      clamp(this.state.temperatureOffset + (Math.random() - 0.5) * 2 * years, -20, 20),
    )
    this.state.humidity = round(
      clamp(this.state.humidity + (Math.random() - 0.5) * 5 * years, 0, 100),
    )
  }

  private triggerDisasters(context: RoundContext, years: number): void {
    // 自然灾害触发概率（基础 3%/年，每个活跃灾害增加 2%）
    const baseProbability = (0.03 + this.state.activeDisasters.length * 0.02) * getFormulaModifier('disasterFrequencyModifier')
    const stepProbability = 1 - Math.pow(1 - baseProbability, years)
    if (Math.random() >= stepProbability) return

    const poolKey = resolveStaticPoolWorldviewKey(this._worldview)
    const pool = DISASTER_POOL_BY_WORLDVIEW[poolKey]
      ?? DISASTER_POOL_BY_WORLDVIEW['default']
    const type = pickRandom(pool)
    const severity = DISASTER_BASE_SEVERITY[type] + randomInt(-10, 10)

    // 获取影响区域（从气候带中随机选取）
    const regionIds = Object.keys(this.state.climateZones)
    const affectedCount = Math.min(randomInt(1, 3), regionIds.length)
    const shuffled = [...regionIds].sort(() => Math.random() - 0.5)
    const affectedRegions = shuffled.slice(0, affectedCount)

    const disaster: Disaster = {
      type,
      severity: clamp(severity, 0, 100),
      affectedRegions,
      year: context.round.year,
      duration: randomInt(2, 6),
    }

    this.state.activeDisasters = [...this.state.activeDisasters, disaster]
  }

  private expireDisasters(years: number): void {
    // 每个活跃灾害：duration 按模拟年递减
    this.state.activeDisasters = this.state.activeDisasters
      .map((d) => ({ ...d, duration: d.duration - years }))
      .filter((d) => d.duration > 0)
  }

  private advanceDisasters(years: number): void {
    this.state.activeDisasters = this.state.activeDisasters
      .map((d) => ({ ...d, duration: d.duration - years }))
      .filter((d) => d.duration > 0)
  }

  // ─── 领域方法 ───

  /** 获取当前季节 */
  getCurrentSeason(): string {
    return this.state.season
  }

  /** 获取当前季节效果乘数 */
  getSeasonEffects() {
    return {
      effects: this.state.seasonEffects,
      specialSeason: this.state.specialSeason,
    }
  }

  /** 获取当前气温偏移 */
  getTemperatureOffset(): number {
    return this.state.temperatureOffset
  }

  /** 获取活跃灾害 */
  getActiveDisasters(): Disaster[] {
    return this.state.activeDisasters
  }

  private getSummaryText(): string {
    const seasonLabel = SEASON_LABELS[this.state.season] ?? this.state.season
    const fx = this.state.seasonEffects
    const fxText = `疾病×${fx.diseaseRiskMultiplier} 收入×${fx.incomeMultiplier} 体力×${fx.staminaCostMultiplier}`
    const count = this.state.activeDisasters.length
    const specialText = this.state.specialSeason ? ` 【${this.state.specialSeason.name}】` : ''
    return `【${this.label}】${seasonLabel}季${specialText} · ${fxText} · 气温 ${this.state.temperatureOffset > 0 ? '+' : ''}${this.state.temperatureOffset.toFixed(0)}° · 湿度 ${this.state.humidity.toFixed(0)}% · 灾害 ${count}个`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
    this._worldview = 'default'
  }
}
