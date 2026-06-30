/**
 * @module GeographySystem
 * @description 地理子系统：区域地形管理 + 板块活动 + 气候带迁移
 * @mod mod-environment-ecology
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { GeographyState, RegionTerrain, TectonicEvent, TerrainType, Disaster } from '../types'

import {
  TERRAIN_MARCH_DIFFICULTY,
  TERRAIN_ELEVATION,
  TERRAIN_LABELS,
  TECTONIC_ACTIVITY_PROBABILITY,
  CLIMATE_SHIFT_RATE,
  FLOOD_TO_SWAMP_CHANCE,
  VOLCANIC_ERUPTION_TERRAIN_CHANCE,
  HUMAN_ACTIVITY_TERRAIN_CHANCE,
  METEOR_STRIKE_PROBABILITY,
  METEOR_TO_VOLCANIC_CHANCE,
} from '../constants'
import {
  round,
  clamp,
  pickRandom,
  randomInRange,
} from '../utils'

/** 板块活动可能导致的随机地形变化 */
const TECTONIC_TERRAIN_OPTIONS: readonly TerrainType[] = [
  'mountain', 'volcanic', 'desert', 'plain', 'swamp',
]

export class GeographySystem implements ISubSystem {
  readonly id = 'geography' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '地理' as const
  readonly description = '管理区域地形、板块活动事件与气候带迁移进度' as const

  private state: GeographyState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): GeographyState {
    return {
      regionTerrains: {},
      tectonicEvents: [],
      climateShiftProgress: 0,
      recentlyChanged: [],
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

    // 板块活动检测
    this.checkTectonicActivity(context.round.year)

    // 气候带迁移推进
    this.advanceClimateShift()

    // 人类活动→地形变化
    this.processHumanActivity()

    // 陨石撞击→火山（独立的低概率事件）
    this.processMeteorStrike()

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
        this.checkTectonicActivity(context.round.year + i)
        this.advanceClimateShift()
      }
    }

    // 添加区域
    if (c.addRegion && typeof c.addRegion === 'object') {
      const r = c.addRegion as Record<string, unknown>
      const regionId = typeof r.regionId === 'string' ? r.regionId : ''
      if (regionId) {
        const terrainType = (typeof r.terrainType === 'string' ? r.terrainType : 'plain') as TerrainType
        this.state.regionTerrains[regionId] = {
          regionId,
          terrainType,
          marchDifficulty: TERRAIN_MARCH_DIFFICULTY[terrainType] ?? 10,
          elevation: TERRAIN_ELEVATION[terrainType] ?? 100,
          detourDistance: typeof r.detourDistance === 'number' ? r.detourDistance : 50,
        }
      }
    }

    // 更新地形
    if (c.updateTerrain && typeof c.updateTerrain === 'object') {
      const u = c.updateTerrain as Record<string, unknown>
      const regionId = typeof u.regionId === 'string' ? u.regionId : ''
      if (regionId && this.state.regionTerrains[regionId]) {
        if (typeof u.terrainType === 'string') {
          const newType = u.terrainType as TerrainType
          this.state.regionTerrains[regionId].terrainType = newType
          this.state.regionTerrains[regionId].marchDifficulty = TERRAIN_MARCH_DIFFICULTY[newType] ?? 10
          this.state.regionTerrains[regionId].elevation = TERRAIN_ELEVATION[newType] ?? 100
        }
        if (typeof u.detourDistance === 'number') {
          this.state.regionTerrains[regionId].detourDistance = u.detourDistance
        }
      }
    }

    // 设置气候迁移进度
    if (typeof c.climateShiftProgress === 'number') {
      this.state.climateShiftProgress = clamp(c.climateShiftProgress, 0, 100)
    }

    // 批量设置区域地形
    if (c.regionTerrains && typeof c.regionTerrains === 'object' && !Array.isArray(c.regionTerrains)) {
      const terrains = c.regionTerrains as Record<string, unknown>
      for (const [regionId, terrainData] of Object.entries(terrains)) {
        if (terrainData && typeof terrainData === 'object' && !Array.isArray(terrainData)) {
          const td = terrainData as Record<string, unknown>
          const terrainType = (typeof td.terrainType === 'string' ? td.terrainType : 'plain') as TerrainType
          this.state.regionTerrains[regionId] = {
            regionId,
            terrainType,
            marchDifficulty: TERRAIN_MARCH_DIFFICULTY[terrainType] ?? 10,
            elevation: TERRAIN_ELEVATION[terrainType] ?? 100,
            detourDistance: typeof td.detourDistance === 'number' ? td.detourDistance : 50,
          }
        }
      }
    }

    // 灾害→地形变换（从其他系统注入活跃灾害数据）
    if (Array.isArray(c.activeDisasters)) {
      this.processDisasterTerrainChanges(c.activeDisasters as Disaster[])
    }
  }

  // ─── 内部推进逻辑 ───

  private checkTectonicActivity(year: number): void {
    if (Math.random() >= TECTONIC_ACTIVITY_PROBABILITY) return

    const regionIds = Object.keys(this.state.regionTerrains)
    if (regionIds.length === 0) return

    const affectedRegion = pickRandom(regionIds)
    const magnitude = randomInRange(3, 9)
    const eventTypes: TectonicEvent['type'][] = ['earthquake', 'volcanic_eruption', 'mountain_rise', 'land_subside']
    const eventType = pickRandom(eventTypes)

    const event: TectonicEvent = {
      type: eventType,
      regionId: affectedRegion,
      magnitude,
      year,
    }

    this.state.tectonicEvents = [...this.state.tectonicEvents.slice(-19), event]

    // 强板块活动可能导致地形变化（magnitude >= 7）
    if (magnitude >= 7 && this.state.regionTerrains[affectedRegion]) {
      const newTerrain = pickRandom(TECTONIC_TERRAIN_OPTIONS)
      const existing = this.state.regionTerrains[affectedRegion]
      if (existing.terrainType !== newTerrain) {
        existing.terrainType = newTerrain
        existing.marchDifficulty = TERRAIN_MARCH_DIFFICULTY[newTerrain] ?? 10
        existing.elevation = TERRAIN_ELEVATION[newTerrain] ?? 100
        this.recordTectonicChange(affectedRegion)
      }
    }
  }

  private advanceClimateShift(): void {
    this.state.climateShiftProgress = round(
      clamp(this.state.climateShiftProgress + CLIMATE_SHIFT_RATE, 0, 100),
    )
  }

  /** 灾害→地形变换：洪水→平原变沼泽、火山喷发→变火山等 */
  private processDisasterTerrainChanges(disasters: Disaster[]): void {
    const changed: string[] = []
    const disasterTypes = new Set(disasters.map((d) => d.type))

    // 洪水→平原变沼泽
    if (disasterTypes.has('flood')) {
      for (const [regionId, terrain] of Object.entries(this.state.regionTerrains)) {
        if (terrain.terrainType === 'plain' && Math.random() < FLOOD_TO_SWAMP_CHANCE) {
          terrain.terrainType = 'swamp'
          terrain.marchDifficulty = TERRAIN_MARCH_DIFFICULTY['swamp'] ?? 10
          terrain.elevation = TERRAIN_ELEVATION['swamp'] ?? 100
          changed.push(regionId)
        }
      }
    }

    // 火山喷发→变火山
    if (disasterTypes.has('volcano')) {
      for (const [regionId, terrain] of Object.entries(this.state.regionTerrains)) {
        if (terrain.terrainType !== 'volcanic' && Math.random() < VOLCANIC_ERUPTION_TERRAIN_CHANCE) {
          terrain.terrainType = 'volcanic'
          terrain.marchDifficulty = TERRAIN_MARCH_DIFFICULTY['volcanic'] ?? 10
          terrain.elevation = TERRAIN_ELEVATION['volcanic'] ?? 100
          changed.push(regionId)
        }
      }
    }

    if (changed.length > 0) {
      this.state.recentlyChanged = [...new Set([...this.state.recentlyChanged, ...changed])].slice(-20)
    }
  }

  /** 陨石撞击：低概率随机选一个非火山区变火山 */
  private processMeteorStrike(): void {
    if (Math.random() >= METEOR_STRIKE_PROBABILITY) return

    const candidates = Object.entries(this.state.regionTerrains)
      .filter(([, t]) => t.terrainType !== 'volcanic')
    if (candidates.length === 0) return

    const [regionId] = candidates[Math.floor(Math.random() * candidates.length)]
    if (Math.random() < METEOR_TO_VOLCANIC_CHANCE) {
      this.state.regionTerrains[regionId].terrainType = 'volcanic'
      this.state.regionTerrains[regionId].marchDifficulty = TERRAIN_MARCH_DIFFICULTY['volcanic'] ?? 10
      this.state.regionTerrains[regionId].elevation = TERRAIN_ELEVATION['volcanic'] ?? 100
      this.state.recentlyChanged = [...new Set([...this.state.recentlyChanged, regionId])].slice(-20)
    }
  }

  /** 人类活动→地形变化：森林/沼泽每年概率变平原 */
  private processHumanActivity(): void {
    const changed: string[] = []

    for (const [regionId, terrain] of Object.entries(this.state.regionTerrains)) {
      if ((terrain.terrainType === 'forest' || terrain.terrainType === 'swamp')
        && Math.random() < HUMAN_ACTIVITY_TERRAIN_CHANCE) {
        terrain.terrainType = 'plain'
        terrain.marchDifficulty = TERRAIN_MARCH_DIFFICULTY['plain'] ?? 10
        terrain.elevation = TERRAIN_ELEVATION['plain'] ?? 100
        changed.push(regionId)
      }
    }

    if (changed.length > 0) {
      this.state.recentlyChanged = [...new Set([...this.state.recentlyChanged, ...changed])].slice(-20)
    }
  }

  /** 记录板块活动导致的地形变化 */
  private recordTectonicChange(regionId: string): void {
    this.state.recentlyChanged = [...new Set([...this.state.recentlyChanged, regionId])].slice(-20)
  }

  // ─── 领域方法 ───

  /** 获取指定区域的地形 */
  getTerrainForRegion(regionId: string): TerrainType | null {
    return this.state.regionTerrains[regionId]?.terrainType ?? null
  }

  /** 获取指定区域的进军难度 */
  getMarchDifficulty(regionId: string): number {
    return this.state.regionTerrains[regionId]?.marchDifficulty ?? 10
  }

  /** 获取所有区域地形 */
  getAllRegionTerrains(): Record<string, RegionTerrain> {
    return this.state.regionTerrains
  }

  /** 获取最近被改变的区域 ID 列表 */
  getRecentlyChanged(): string[] {
    return this.state.recentlyChanged
  }

  /** 生成 AI Prompt 可消费的地形叙事文本 */
  formatTerrainForPrompt(): string {
    const regions = Object.entries(this.state.regionTerrains)
    if (regions.length === 0) return '【地形】暂无数据'

    // 地形分布统计
    const dist: Record<string, number> = {}
    for (const [, t] of regions) {
      dist[t.terrainType] = (dist[t.terrainType] ?? 0) + 1
    }
    const distText = Object.entries(dist)
      .map(([type, count]) => `${TERRAIN_LABELS[type as TerrainType] ?? type}(${count})`)
      .join('/')

    // 行军难度摘要
    const difficultySummary = Object.entries(dist)
      .map(([type]) => `${TERRAIN_LABELS[type as TerrainType] ?? type}=${TERRAIN_MARCH_DIFFICULTY[type as TerrainType]}`)
      .join(' ')

    const lines = [
      `【地形分布】${distText}`,
      `【行军难度】${difficultySummary}`,
      `【板块活动】${this.state.tectonicEvents.length}次记录 · 气候迁移 ${this.state.climateShiftProgress.toFixed(1)}%`,
    ]
    if (this.state.recentlyChanged.length > 0) {
      lines.push(`【地形变动】${this.state.recentlyChanged.map((rid) => {
        const t = this.state.regionTerrains[rid]
        return t ? `${rid}→${TERRAIN_LABELS[t.terrainType]}` : rid
      }).join('、')}`)
    }
    return lines.join('\n')
  }

  private getSummaryText(): string {
    const regionCount = Object.keys(this.state.regionTerrains).length
    const tectonicCount = this.state.tectonicEvents.length
    const changedCount = this.state.recentlyChanged.length
    return `【${this.label}】${regionCount}个区域 · 板块活动 ${tectonicCount}次 · 气候迁移 ${this.state.climateShiftProgress.toFixed(1)}%${changedCount > 0 ? ` · 近期变化 ${changedCount}处` : ''}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
