/**
 * @module WorldMapSystem
 * @description 世界地图子系统 —— 10 种模板地图生成 + 世界观适配 + 区域演变（边界变更/新区域/合并/势力冲突/覆灭/分裂）+ AI 区域名称/叙事背景适配 + Prompt 格式化
 *   v3: 世界观全适配（命名/资源/势力名/人口/气候/模板可用性）、AI 初始值参与（模板选择 + 叙事背景）、新模板 3 种（环形世界/地心世界/星云型）、算法扩展（stellar线性/斐波那契群岛/Voronoi大陆/Perlin盘古/planar动态层数）、动态演变增强（势力覆灭/分裂/全模板新区域发现/天象概率影响）
 * @mod mod-base-universe
 */
import { getRoundSequence } from '@/foundation'
// 统一使用 shared/ 的 clamp 替代内联 Math.max/Math.min
import { clamp } from '@/core/shared'

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import { saveStore } from '@/core'
import type {
  WorldMapState,
  WorldRegion,
  MapTemplate,
  MapTemplateOptions,
  TerrainType,
  RegionResource,
  FactionRelationEntry,
  FactionRelationType,
} from '../types'

import {
  MAP_TEMPLATE_REGION_COUNT,
  MAP_TEMPLATE_TERRAINS,
  REGION_NAME_PREFIXES,
  REGION_NAME_SUFFIXES,
  TERRAIN_RESOURCE_POOL,
  TERRAIN_DEVELOPMENT_RANGES,
  TERRAIN_ZH_MAP,
  MAP_TEMPLATE_LABELS,
  COORD_RANGE,
  ADJACENT_DISTANCE,
  BORDER_CHANGE_CHANCE,
  NEW_REGION_CHANCE,
  REGION_MERGE_CHANCE,
  FACTION_ATTRITION_CHANCE,
  POPULATION_MIN,
  POPULATION_MAX,
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  HUMIDITY_MIN,
  HUMIDITY_MAX,
  round,
  REGION_NAME_PREFIXES_BY_WORLDVIEW,
  REGION_NAME_SUFFIXES_BY_WORLDVIEW,
  FACTION_PREFIXES_BY_WORLDVIEW,
  FACTION_SUFFIXES_BY_WORLDVIEW,
  TERRAIN_RESOURCE_POOL_BY_WORLDVIEW,
  POPULATION_RANGE_BY_WORLDVIEW,
  TEMPERATURE_RANGE_BY_WORLDVIEW,
  HUMIDITY_RANGE_BY_WORLDVIEW,
  AVAILABLE_TEMPLATES_BY_WORLDVIEW,
  STELLAR_LINEAR_PARAMS,
  PLANAR_LAYER_PARAMS,
  ARCHIPELAGO_SPIRAL_PARAMS,
  FACTION_RELATION_LABELS,
  FACTION_RELATION_MARKS,
  FACTION_RELATION_GENERATION_WEIGHTS,
  FACTION_RELATION_EVOLVE_CHANCE,
  FACTION_TENSION_INITIAL,
  FACTION_TENSION_DRIFT,
  FACTION_TENSION_WAR_THRESHOLD,
  FACTION_TENSION_ALLIANCE_THRESHOLD,
  FACTION_TENSION_CELESTIAL_BONUS,
} from '../constants'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

/** 带距离信息的邻接区域 */
export interface AdjacentRegionEntry {
  region: WorldRegion
  distance: number,
}

/** 势力覆灭概率（每 10 年，有势力区域） */
const FACTION_DESTRUCTION_CHANCE = 0.01

/** 势力分裂概率（每 10 年，多区域势力） */
const FACTION_SPLIT_CHANCE = 0.02

export class WorldMapSystem implements ISubSystem {
  readonly id = 'world-map' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '世界地图' as const
  readonly description = '生成和管理世界地理区域，支持 10 种地图模板、世界观全适配和区域动态演变' as const

  private _state: WorldMapState = {
    initialized: false,
    mapTemplate: 'continental',
    regions: [],
    templateOptions: undefined,
    factionRelations: undefined,
  }

  private _lastProcessedRound = -1
  private _worldview = 'default'
  private _lastPlayerLocationSummary = ''

  /** 已用区域名集合（去重用） */
  private _usedNames = new Set<string>()

  /** 已用势力名集合（去重用） */
  private _usedFactionNames = new Set<string>()

  /** 静态池 lookup 键（AI/自定义世界 → default） */
  private _poolWorldviewKey(): string {
    return resolveStaticPoolWorldviewKey(this._worldview)
  }

  collectState(context: RoundContext): SubSystemState {
    // round-idempotent 守卫
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this._buildPlayerLocationSummary(context),
        data: structuredClone(this._state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    // 解析世界观
    this._worldview = this._getWorldview(context)

    // 首次调用初始化地图
    if (!this._state.initialized) {
      this._createInitialMap()
      this._state.initialized = true
    } else {
      this._advanceRegions(context)
    }

    return {
      id: this.id,
      summary: this._buildPlayerLocationSummary(context),
      data: structuredClone(this._state as unknown as Record<string, unknown>),
    }
  }

  collectStateFinalFix(context: RoundContext): SubSystemState | null {
    const summary = this._buildPlayerLocationSummary(context)
    if (summary === this._lastPlayerLocationSummary) return null
    this._lastPlayerLocationSummary = summary
    return {
      id: this.id,
      summary,
      data: structuredClone(this._state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    // 校验变更顶层结构
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch: expected ${this.id}, got ${changes.id}`)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }

    const c = changes.changes

    // AI 接触点：区域名称适配
    if (
      c.adaptationType === 'region-names'
      && Array.isArray(c.regionNames)
      && this._state.regions.length > 0
    ) {
      const names = c.regionNames as string[]
      for (let i = 0; i < Math.min(names.length, this._state.regions.length); i++) {
        this._state.regions[i].name = String(names[i])
      }
    }
    // AI 接触点：区域叙事背景适配
    else if (
      c.adaptationType === 'region-narratives'
      && Array.isArray(c.regionNarratives)
      && this._state.regions.length > 0
    ) {
      const narratives = c.regionNarratives as Array<{
        regionIndex?: number
        regionId?: string
        narrativeBackground: string
      }>
      for (const entry of narratives) {
        const region = entry.regionId
          ? this._state.regions.find((r) => r.id === entry.regionId)
          : typeof entry.regionIndex === 'number'
            ? this._state.regions[entry.regionIndex]
            : undefined
        if (region) {
          region.narrativeBackground = entry.narrativeBackground
        }
      }
    }
    // AI 接触点：叙事驱动边界变更
    else if (
      c.adaptationType === 'border-event'
      && typeof c.borderEvent === 'object'
    ) {
      const event = c.borderEvent as {
        sourceRegionId: string
        targetRegionId: string
        action: 'expand' | 'swap' | 'destroy'
        newFaction?: string
      }
      const source = this._state.regions.find((r) => r.id === event.sourceRegionId)
      const target = this._state.regions.find((r) => r.id === event.targetRegionId)
      if (source && target) {
        if (event.action === 'expand') {
          target.ownerFaction = source.ownerFaction || event.newFaction || null
        } else if (event.action === 'swap') {
          const temp = source.ownerFaction
          source.ownerFaction = target.ownerFaction
          target.ownerFaction = temp
        } else if (event.action === 'destroy') {
          target.ownerFaction = null
        }
      }
    }
    // AI 接触点：势力覆灭/分裂
    else if (
      c.adaptationType === 'faction-event'
      && typeof c.factionEvent === 'object'
    ) {
      const event = c.factionEvent as {
        factionName: string
        action: 'destroy' | 'split',
      }
      if (event.action === 'destroy') {
        for (const region of this._state.regions) {
          if (region.ownerFaction === event.factionName) {
            region.ownerFaction = null
          }
        }
      } else if (event.action === 'split') {
        const affectedRegions = this._state.regions.filter(
          (r) => r.ownerFaction === event.factionName,
        )
        if (affectedRegions.length > 1) {
          const mid = Math.floor(affectedRegions.length / 2)
          const newFaction = this._generateFactionName()
          for (let i = mid; i < affectedRegions.length; i++) {
            affectedRegions[i].ownerFaction = newFaction
          }
        }
      }
    } else {
      // 直接控制：模板变更
      if (typeof c.mapTemplateOverride === 'string') {
        this._state.mapTemplate = c.mapTemplateOverride as MapTemplate
      }
      // 直接控制：模板选项
      if (c.templateOptions && typeof c.templateOptions === 'object') {
        this._state.templateOptions = c.templateOptions as MapTemplateOptions
      }
      // 直接控制：区域数据覆盖（AI 可预生成完整区域列表）
      if (Array.isArray(c.regionsOverride)) {
        this._state.regions = c.regionsOverride as WorldRegion[]
      }
    }
  }

  reset(): void {
    this._state = {
      initialized: false,
      mapTemplate: 'continental',
      regions: [],
      templateOptions: undefined,
      factionRelations: undefined,
    }
    this._lastProcessedRound = -1
    this._worldview = 'default'
    this._lastPlayerLocationSummary = ''
    this._usedNames = new Set()
    this._usedFactionNames = new Set()
  }

  /** 持久化：将当前地图状态保存 */
  saveMap(worldCode: number): void {
    try {
      const payload = {
        state: this._state,
        worldview: this._worldview,
        usedNames: Array.from(this._usedNames),
        usedFactionNames: Array.from(this._usedFactionNames),
      }
      saveStore.set('mod-base-universe', 0, `world-map:${worldCode}`, payload)
    } catch {
      // 存储满或不可用时静默失败
    }
  }

  /** 从持久化恢复地图状态 */
  loadMap(worldCode: number): boolean {
    try {
      const payload = saveStore.get<{
        state: WorldMapState
        worldview: string
        usedNames: string[]
        usedFactionNames: string[],
      }>('mod-base-universe', 0, `world-map:${worldCode}`)

      if (!payload) return false
      this._state = payload.state
      this._worldview = payload.worldview
      this._usedNames = new Set(payload.usedNames)
      this._usedFactionNames = new Set(payload.usedFactionNames)
      return true
    } catch {
      return false
    }
  }

  /** 清除当前世界的缓存地图 */
  clearMapCache(worldCode: number): void {
    try {
      saveStore.remove('mod-base-universe', 0, `world-map:${worldCode}`)
    } catch {
      // 静默
    }
  }

  // ============================================================
  // 领域方法（供 MOD 内和其他 MOD 使用）
  // ============================================================

  getRegionsByTerrain(terrain: TerrainType): WorldRegion[] {
    return this._state.regions.filter((r) => r.terrain === terrain)
  }

  /** 获取邻接区域（带距离，按距离升序排列） */
  getAdjacentRegions(regionId: string): AdjacentRegionEntry[] {
    const target = this._state.regions.find((r) => r.id === regionId)
    if (!target) return []
    return this._state.regions
      .filter((r) => r.id !== regionId)
      .map((r) => {
        const dx = r.coordinates.x - target.coordinates.x
        const dy = r.coordinates.y - target.coordinates.y
        return { region: r, distance: round(Math.sqrt(dx * dx + dy * dy)) }
      })
      .filter((item) => item.distance < ADJACENT_DISTANCE)
      .sort((a, b) => a.distance - b.distance)
  }

  getRegionCount(): number {
    return this._state.regions.length
  }

  formatForPrompt(context?: RoundContext): string {
    return this._buildPlayerLocationSummary(context)
  }

  // ============================================================
  // 内部：世界观解析
  // ============================================================

  /** 从上下文读取世界观（来自 world-init 子系统） */
  private _getWorldview(context: RoundContext): string {
    const worldInit = context.subsystemStates['world-init']
    if (worldInit?.data && typeof (worldInit.data as Record<string, unknown>).worldview === 'string') {
      return (worldInit.data as Record<string, unknown>).worldview as string
    }
    return 'default'
  }

  /** 解析世界观适配的模板选择（AI 可通过 templateOptions 覆盖程序化选择） */
  private _resolveTemplate(): MapTemplate {
    // 如果 AI 已指定模板选项，直接使用
    if (this._state.templateOptions) {
      return this._state.mapTemplate
    }

    // 世界观允许的模板列表
    const allowed = AVAILABLE_TEMPLATES_BY_WORLDVIEW[this._poolWorldviewKey()]
    if (!allowed || allowed.length === 0) {
      // undefined = 全部可用
      const all: MapTemplate[] = [
        'continental', 'archipelago', 'pangea', 'multicontinental',
        'oceanWorld', 'planar', 'stellar', 'ringWorld', 'hollowEarth', 'nebula',
      ]
      return all[Math.floor(Math.random() * all.length)]
    }

    return allowed[Math.floor(Math.random() * allowed.length)]
  }

  // ============================================================
  // 内部：创建初始地图
  // ============================================================

  /** 创建初始地图 */
  private _createInitialMap(): void {
    // 世界观感知的模板选择
    this._state.mapTemplate = this._resolveTemplate()
    const template = this._state.mapTemplate
    const regionCount = MAP_TEMPLATE_REGION_COUNT[template]
    const terrainWeights = MAP_TEMPLATE_TERRAINS[template]

    const regions: WorldRegion[] = []
    for (let i = 0; i < regionCount; i++) {
      const terrain = this._pickWeightedTerrain(terrainWeights)
      const coords = this._generateCoords(template, i, regionCount)
      const name = this._generateRegionName()

      const region: WorldRegion = {
        id: `region-${i}`,
        name,
        terrain,
        coordinates: { x: coords.x, y: coords.y },
        planeIndex: this._computePlaneIndex(template, i, regionCount),
        directionLabel: this._getDirectionLabel(coords.x, coords.y),
        neighbors: [],
        temperature: round(this._generateTemperature(coords.y)),
        humidity: round(this._generateHumidity(coords.y)),
        pollution: 0,
        resources: this._generateResources(terrain),
        ownerFaction: null,
        population: this._generatePopulation(terrain),
        development: this._generateDevelopment(terrain),
      }
      regions.push(region)
    }

    // 计算邻居关系
    for (const region of regions) {
      region.neighbors = regions
        .filter((r) => r.id !== region.id)
        .filter((r) => {
          const dx = r.coordinates.x - region.coordinates.x
          const dy = r.coordinates.y - region.coordinates.y
          return Math.sqrt(dx * dx + dy * dy) < ADJACENT_DISTANCE
        })
        .map((r) => r.id)
    }

    this._state.regions = regions
    // 初始化外交关系网络
    this._state.factionRelations = []
  }

  /** 权重随机选择地形 */
  private _pickWeightedTerrain(weights: { terrain: TerrainType; weight: number }[]): TerrainType {
    const total = weights.reduce((sum, w) => sum + w.weight, 0)
    let roll = Math.random() * total
    for (const w of weights) {
      roll -= w.weight
      if (roll <= 0) return w.terrain
    }
    return weights[0].terrain
  }

  // ============================================================
  // 内部：坐标生成（10 模板 × 多算法变体）
  // ============================================================

  /** 按模板生成坐标（含算法变体） */
  private _generateCoords(template: MapTemplate, index: number, total: number): { x: number; y: number } {
    switch (template) {
      case 'continental':
        return this._posContinental(index, total)
      case 'archipelago':
        return this._posArchipelago(index, total)
      case 'pangea':
        return this._posPangea(index, total)
      case 'multicontinental':
        return this._posMulticontinental(index, total)
      case 'oceanWorld':
        return this._posOceanWorld(index, total)
      case 'planar':
        return this._posPlanar(index, total)
      case 'stellar':
        return this._posStellar(index, total)
      case 'ringWorld':
        return this._posRingWorld(index, total)
      case 'hollowEarth':
        return this._posHollowEarth(index, total)
      case 'nebula':
        return this._posNebula(index, total)
    }
  }

  /** continental: Voronoi 风格（随机种子 → 模拟簇中心分布） */
  private _posContinental(index: number, _total: number): { x: number; y: number } {
    // 生成 4~6 个随机种子点（大陆核心），区域围绕核心分布
    const seedCount = 4 + Math.floor(Math.random() * 3)
    const seeds: { x: number; y: number }[] = []
    for (let s = 0; s < seedCount; s++) {
      seeds.push({
        x: COORD_RANGE * 0.2 + Math.random() * COORD_RANGE * 0.6,
        y: COORD_RANGE * 0.2 + Math.random() * COORD_RANGE * 0.6,
      })
    }
    const seed = seeds[index % seedCount]
    const r = 30 + Math.random() * 120
    const angle = Math.random() * 2 * Math.PI
    return {
      x: round(clamp(seed.x + Math.cos(angle) * r, 0, COORD_RANGE)),
      y: round(clamp(seed.y + Math.sin(angle) * r, 0, COORD_RANGE)),
    }
  }

  /** archipelago: 双频螺旋（默认） + 斐波那契螺旋变体（随机 30%） */
  private _posArchipelago(index: number, total: number): { x: number; y: number } {
    // 30% 概率使用斐波那契螺旋（自然散落）
    if (Math.random() < 0.3) {
      return this._posArchipelagoFibonacci(index, total)
    }
    // 默认双频螺旋
    const cosPart = Math.cos((index / total) * Math.PI * 2 + index * 0.5)
    const sinPart = Math.sin((index / total) * Math.PI * 3 + index * 0.3)
    const jitterX = (Math.random() - 0.5) * 60
    const jitterY = (Math.random() - 0.5) * 60
    return {
      x: round((cosPart * 0.4 + 0.5) * COORD_RANGE + jitterX),
      y: round((sinPart * 0.4 + 0.5) * COORD_RANGE + jitterY),
    }
  }

  /** archipelago 斐波那契螺旋变体 */
  private _posArchipelagoFibonacci(index: number, total: number): { x: number; y: number } {
    const { goldenAngle, spreadFactor } = ARCHIPELAGO_SPIRAL_PARAMS
    const angle = index * goldenAngle
    const r = spreadFactor * COORD_RANGE * Math.sqrt(index / total)
    const jitterX = (Math.random() - 0.5) * 40
    const jitterY = (Math.random() - 0.5) * 40
    return {
      x: round(Math.cos(angle) * r + COORD_RANGE / 2 + jitterX),
      y: round(Math.sin(angle) * r + COORD_RANGE / 2 + jitterY),
    }
  }

  /** pangea: Perlin 噪声风格（多层随机偏移模拟不规则团块） */
  private _posPangea(index: number, total: number): { x: number; y: number } {
    // 多频叠加模拟 Perlin 噪声
    const cx = COORD_RANGE / 2 + (Math.random() - 0.5) * 100
    const cy = COORD_RANGE / 2 + (Math.random() - 0.5) * 100
    // 3 层频率叠加
    const freq1 = 1.5
    const freq2 = 3.0
    const freq3 = 6.0
    const ratio = index / total
    const noise =
      Math.sin(ratio * Math.PI * freq1) * 0.5 +
      Math.sin(ratio * Math.PI * freq2 + 1.3) * 0.3 +
      Math.sin(ratio * Math.PI * freq3 + 2.7) * 0.2
    const r = COORD_RANGE * (0.25 + noise * 0.12)
    const angle = ratio * 2 * Math.PI + (Math.random() - 0.5) * 0.4
    return {
      x: round(cx + Math.cos(angle) * r),
      y: round(cy + Math.sin(angle) * r),
    }
  }

  /** multicontinental: 4 簇 */
  private _posMulticontinental(index: number, total: number): { x: number; y: number } {
    const clusters = 4
    const perCluster = Math.ceil(total / clusters)
    const clusterIndex = Math.floor(index / perCluster)
    const cx = (clusterIndex % 2 === 0 ? 0.25 : 0.75) * COORD_RANGE
    const cy = (clusterIndex < 2 ? 0.25 : 0.75) * COORD_RANGE
    const r = COORD_RANGE * 0.1 + Math.random() * COORD_RANGE * 0.1
    const angle = Math.random() * 2 * Math.PI
    return {
      x: round(cx + Math.cos(angle) * r),
      y: round(cy + Math.sin(angle) * r),
    }
  }

  /** oceanWorld: 多层圆环（类似土星环） */
  private _posOceanWorld(index: number, total: number): { x: number; y: number } {
    const ringLayers = 2 + Math.floor(Math.random() * 2) // 2~3 层环
    const ringIndex = index % ringLayers
    const rFraction = 0.2 + (ringIndex / ringLayers) * 0.3
    const angle = (2 * Math.PI * index) / total + (Math.random() - 0.5) * 0.5
    const r = COORD_RANGE * rFraction + (Math.random() - 0.5) * 30
    return {
      x: round(Math.cos(angle) * r + COORD_RANGE / 2),
      y: round(Math.sin(angle) * r + COORD_RANGE / 2),
    }
  }

  /** planar: 动态层数（2~5 层可选，默认 3 层） */
  private _posPlanar(index: number, total: number): { x: number; y: number } {
    const layers = this._state.templateOptions?.planarLayers ?? PLANAR_LAYER_PARAMS.defaultLayers
    const clampedLayers = clamp(layers, PLANAR_LAYER_PARAMS.minLayers, PLANAR_LAYER_PARAMS.maxLayers)
    const perLayer = Math.ceil(total / clampedLayers)
    const layer = Math.floor(index / perLayer)
    const offset = index % perLayer
    const x = 0.15 * COORD_RANGE + offset * (0.8 * COORD_RANGE / perLayer) + (Math.random() - 0.5) * 60
    const y = 100 + layer * (COORD_RANGE * 0.8 / clampedLayers) + Math.sin(index * 1.7) * 80 + (Math.random() - 0.5) * 50
    return {
      x: round(clamp(x, 0, COORD_RANGE)),
      y: round(clamp(y, 0, COORD_RANGE)),
    }
  }

  /** stellar: circular（日心轨道）或 linear（线性星链） */
  private _posStellar(index: number, total: number): { x: number; y: number } {
    const mode = this._state.templateOptions?.stellarLayoutMode ?? 'circular'
    if (mode === 'linear') {
      return this._posStellarLinear(index, total)
    }
    // 默认日心轨道
    const angle = (2 * Math.PI * index) / total
    const r = COORD_RANGE * 0.4 + Math.random() * COORD_RANGE * 0.15
    return {
      x: round(Math.cos(angle) * r + COORD_RANGE / 2),
      y: round(Math.sin(angle) * r + COORD_RANGE / 2),
    }
  }

  /** stellar 线性排列（星链/贸易路线风格） */
  private _posStellarLinear(index: number, total: number): { x: number; y: number } {
    const { spacing, sineAmplitude, sineFrequency } = STELLAR_LINEAR_PARAMS
    const x = COORD_RANGE * spacing + index * (COORD_RANGE * (1 - 2 * spacing) / Math.max(total - 1, 1))
    const y =
      COORD_RANGE / 2 +
      Math.sin(index * Math.PI * sineFrequency / total) * COORD_RANGE * sineAmplitude +
      (Math.random() - 0.5) * 20
    return {
      x: round(clamp(x, 0, COORD_RANGE)),
      y: round(clamp(y, 0, COORD_RANGE)),
    }
  }

  /** ringWorld: 环形世界（双层环带） */
  private _posRingWorld(index: number, total: number): { x: number; y: number } {
    const outerRing = Math.ceil(total * 0.6)
    const isInner = index >= outerRing
    const subIndex = isInner ? index - outerRing : index
    const subTotal = isInner ? total - outerRing : outerRing
    const rFraction = isInner ? 0.25 : 0.4
    const angle = (2 * Math.PI * subIndex) / subTotal + (Math.random() - 0.5) * 0.3
    const r = COORD_RANGE * (rFraction + (Math.random() - 0.5) * 0.08)
    return {
      x: round(Math.cos(angle) * r + COORD_RANGE / 2),
      y: round(Math.sin(angle) * r + COORD_RANGE / 2),
    }
  }

  /** hollowEarth: 双层世界（地表 + 地心） */
  private _posHollowEarth(index: number, total: number): { x: number; y: number } {
    const surfaceCount = Math.ceil(total * 0.55)
    const isInterior = index >= surfaceCount
    const subIndex = isInterior ? index - surfaceCount : index
    const subTotal = isInterior ? total - surfaceCount : surfaceCount

    if (isInterior) {
      // 地心：紧凑圆形
      const angle = (2 * Math.PI * subIndex) / subTotal + (Math.random() - 0.5) * 0.5
      const r = COORD_RANGE * 0.1 + Math.random() * COORD_RANGE * 0.12
      return {
        x: round(Math.cos(angle) * r + COORD_RANGE / 2),
        y: round(Math.sin(angle) * r + COORD_RANGE / 2),
      }
    }
    // 地表：宽圆环
    const angle = (2 * Math.PI * subIndex) / subTotal + (Math.random() - 0.5) * 0.3
    const r = COORD_RANGE * 0.3 + Math.random() * COORD_RANGE * 0.2
    return {
      x: round(Math.cos(angle) * r + COORD_RANGE / 2),
      y: round(Math.sin(angle) * r + COORD_RANGE / 2),
    }
  }

  /** nebula: 星云型（不规则气体云状散落） */
  private _posNebula(index: number, total: number): { x: number; y: number } {
    // 多频螺旋叠加 + 大范围抖动模拟星云不规则性
    const ratio = index / total
    const angle = ratio * Math.PI * 5 + index * 0.7
    const r1 = COORD_RANGE * (0.1 + ratio * 0.3)
    const r2 = COORD_RANGE * 0.15 * Math.sin(ratio * Math.PI * 3)
    const r = r1 + r2
    const jitterX = (Math.random() - 0.5) * 100
    const jitterY = (Math.random() - 0.5) * 100
    return {
      x: round(clamp(Math.cos(angle) * r + COORD_RANGE / 2 + jitterX, 0, COORD_RANGE)),
      y: round(clamp(Math.sin(angle) * r + COORD_RANGE / 2 + jitterY, 0, COORD_RANGE)),
    }
  }

  /** 计算位面索引：planar 模板与坐标层关联，stellar/其他模板保持随机 */
  private _computePlaneIndex(template: MapTemplate, index: number, total: number): number {
    if (template === 'planar') {
      const layers = this._state.templateOptions?.planarLayers ?? PLANAR_LAYER_PARAMS.defaultLayers
      const perLayer = Math.ceil(total / layers)
      return Math.floor(index / perLayer)
    }
    if (template === 'stellar' || template === 'nebula') {
      return Math.floor(Math.random() * 5)
    }
    if (template === 'hollowEarth') {
      return index < Math.ceil(total * 0.55) ? 0 : 1
    }
    return 0
  }

  // ============================================================
  // 内部：命名生成（世界观感知）
  // ============================================================

  /** 世界观感知的区域名生成 */
  private _generateRegionName(): string {
    const prefixes = REGION_NAME_PREFIXES_BY_WORLDVIEW[this._poolWorldviewKey()]
      ?? REGION_NAME_PREFIXES_BY_WORLDVIEW['default']
      ?? REGION_NAME_PREFIXES
    const suffixes = REGION_NAME_SUFFIXES_BY_WORLDVIEW[this._poolWorldviewKey()]
      ?? REGION_NAME_SUFFIXES_BY_WORLDVIEW['default']
      ?? REGION_NAME_SUFFIXES

    for (let attempt = 0; attempt < 200; attempt++) {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
      const name = `${prefix}${suffix}`
      if (!this._usedNames.has(name)) {
        this._usedNames.add(name)
        return name
      }
    }
    return `区域${Math.floor(Math.random() * 10000)}`
  }

  /** 世界观感知的势力名生成 */
  private _generateFactionName(): string {
    const prefixes = FACTION_PREFIXES_BY_WORLDVIEW[this._poolWorldviewKey()]
      ?? FACTION_PREFIXES_BY_WORLDVIEW['default']
      ?? ['天', '炎', '金', '暗', '苍', '灵', '血', '紫', '黑', '圣']
    const suffixes = FACTION_SUFFIXES_BY_WORLDVIEW[this._poolWorldviewKey()]
      ?? FACTION_SUFFIXES_BY_WORLDVIEW['default']
      ?? ['龙派', '凤阁', '影会', '星团', '月教', '云门', '雷宗', '剑盟']

    for (let attempt = 0; attempt < 200; attempt++) {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
      const name = `${prefix}${suffix}`
      if (!this._usedFactionNames.has(name)) {
        this._usedFactionNames.add(name)
        return name
      }
    }
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}${Math.floor(Math.random() * 100)}`
  }

  // ============================================================
  // 内部：方位标签
  // ============================================================

  private _getDirectionLabel(x: number, y: number): string {
    const cx = COORD_RANGE / 2
    const cy = COORD_RANGE / 2
    const dy = y - cy
    const dx = x - cx
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (absDx < 100 && absDy < 100) return '中央'

    let label = ''
    if (absDy > absDx) {
      label += dy < 0 ? '北' : '南'
      if (absDx > absDy * 0.3) label += dx < 0 ? '西' : '东'
    } else {
      label += dx < 0 ? '西' : '东'
      if (absDy > absDx * 0.3) label += dy < 0 ? '北' : '南'
    }
    return label + '部'
  }

  // ============================================================
  // 内部：属性生成（世界观感知）
  // ============================================================

  /** 世界观感知的温度生成 */
  private _generateTemperature(y: number): number {
    const [tMin, tMax] = TEMPERATURE_RANGE_BY_WORLDVIEW[this._poolWorldviewKey()]
      ?? [TEMPERATURE_MIN, TEMPERATURE_MAX]
    const midY = COORD_RANGE / 2
    const ratio = 1 - (y - midY) / midY
    const base = tMin + (tMax - tMin) * ((ratio + 1) / 2)
    return Math.max(tMin, Math.min(tMax, base + (Math.random() - 0.5) * 10))
  }

  /** 世界观感知的湿度生成 */
  private _generateHumidity(y: number): number {
    const [hMin, hMax] = HUMIDITY_RANGE_BY_WORLDVIEW[this._poolWorldviewKey()]
      ?? [HUMIDITY_MIN, HUMIDITY_MAX]
    const midY = COORD_RANGE / 2
    const distFromMid = Math.abs(y - midY) / midY
    const base = hMax - (hMax - hMin) * distFromMid
    return Math.max(hMin, Math.min(hMax, base + (Math.random() - 0.5) * 15))
  }

  /** 世界观感知的资源生成 */
  private _generateResources(terrain: TerrainType): RegionResource[] {
    // 世界观特定资源池 → 默认资源池回退
    const worldviewPool = TERRAIN_RESOURCE_POOL_BY_WORLDVIEW[this._poolWorldviewKey()]?.[terrain]
    const pool = worldviewPool ?? TERRAIN_RESOURCE_POOL[terrain] ?? ['未知资源']
    const count = 1 + Math.floor(Math.random() * 3)
    const resources: RegionResource[] = []
    const used = new Set<string>()

    for (let i = 0; i < Math.min(count, pool.length); i++) {
      let resource: string
      let attempts = 0
      do {
        resource = pool[Math.floor(Math.random() * pool.length)]
        attempts++
      } while (used.has(resource) && attempts < 10)
      used.add(resource)
      resources.push({
        type: resource,
        abundance: round(10 + Math.random() * 80),
        quality: round(1 + Math.random() * 9),
      })
    }
    return resources
  }

  /** 世界观感知的人口生成 */
  private _generatePopulation(terrain: TerrainType): number {
    const [popMin, popMax] = POPULATION_RANGE_BY_WORLDVIEW[this._poolWorldviewKey()]
      ?? [POPULATION_MIN, POPULATION_MAX]
    const dev = TERRAIN_DEVELOPMENT_RANGES[terrain]
    const devRatio = (dev.max - dev.min) / 80
    const pop = popMin + Math.random() * (popMax - popMin) * devRatio
    return Math.floor(pop)
  }

  private _generateDevelopment(terrain: TerrainType): number {
    const range = TERRAIN_DEVELOPMENT_RANGES[terrain]
    return round(range.min + Math.random() * (range.max - range.min))
  }

  // ============================================================
  // 内部：动态演变（v3 增强）
  // ============================================================

  /** 每轮推进区域演变 */
  private _advanceRegions(context: RoundContext): void {
    // 每 10 年触发一次
    if (context.round.year % 10 !== 0) return

    // 天象跨域效果消费
    this._applyCelestialWorldMapEffect(context)

    // 天象影响演变概率（异象 → 边界变更概率翻倍）
    const celestialBonus = this._getCelestialProbabilityBonus(context)

    const roll = Math.random()

    // 边界变更（基础 10% + 天象加成）
    if (roll < BORDER_CHANGE_CHANCE + celestialBonus) {
      this._applyBorderChange()
    }

    // 新区域发现 5%（所有模板，概率受天象影响）
    if (roll < BORDER_CHANGE_CHANCE + NEW_REGION_CHANCE + celestialBonus) {
      this._addNewRegion()
    }

    // 区域合并 3%
    if (roll < BORDER_CHANGE_CHANCE + NEW_REGION_CHANCE + REGION_MERGE_CHANCE + celestialBonus) {
      this._applyRegionMerge()
    }

    // 势力冲突 2%
    if (roll < BORDER_CHANGE_CHANCE + NEW_REGION_CHANCE + REGION_MERGE_CHANCE + FACTION_ATTRITION_CHANCE + celestialBonus) {
      this._applyFactionConflict()
    }

    // 势力覆灭 1%
    if (roll < BORDER_CHANGE_CHANCE + NEW_REGION_CHANCE + REGION_MERGE_CHANCE + FACTION_ATTRITION_CHANCE + FACTION_DESTRUCTION_CHANCE + celestialBonus) {
      this._applyFactionDestruction()
    }

    // 势力分裂 2%
    if (roll < BORDER_CHANGE_CHANCE + NEW_REGION_CHANCE + REGION_MERGE_CHANCE + FACTION_ATTRITION_CHANCE + FACTION_DESTRUCTION_CHANCE + FACTION_SPLIT_CHANCE + celestialBonus) {
      this._applyFactionSplit()
    }

    // 势力外交关系演变（每 10 年 8%，受天象加成）
    if (Math.random() < FACTION_RELATION_EVOLVE_CHANCE + celestialBonus) {
      this._evolveFactionRelations(context)
    }
  }

  /** 计算天象对演变概率的加成 */
  private _getCelestialProbabilityBonus(context: RoundContext): number {
    const celestial = context.subsystemStates['celestial']
    if (!celestial?.data) return 0
    const data = celestial.data as Record<string, unknown>
    const currentPhase = data.currentPhase as string | undefined
    // 异象阶段 → 概率 +0.05，凶兆 → +0.02
    if (currentPhase === 'anomaly') return 0.05
    if (currentPhase === 'omen') return 0.02
    return 0
  }

  /** 边界变更：三态逻辑（扩张 / 交换 / 跳过） */
  private _applyBorderChange(): void {
    if (this._state.regions.length < 2) return
    const i = Math.floor(Math.random() * this._state.regions.length)
    let j = Math.floor(Math.random() * this._state.regions.length)
    if (i === j) j = (j + 1) % this._state.regions.length

    const factionA = this._state.regions[i].ownerFaction
    const factionB = this._state.regions[j].ownerFaction

    if (factionA && !factionB) {
      this._state.regions[j].ownerFaction = factionA
    } else if (!factionA && factionB) {
      this._state.regions[i].ownerFaction = factionB
    } else if (factionA && factionB) {
      this._state.regions[i].ownerFaction = factionB
      this._state.regions[j].ownerFaction = factionA
    }
  }

  /** 新区域发现（所有模板均可触发） */
  private _addNewRegion(): void {
    const terrain = this._pickWeightedTerrain(MAP_TEMPLATE_TERRAINS[this._state.mapTemplate])
    const coords = this._generateCoords(this._state.mapTemplate, this._state.regions.length, this._state.regions.length + 1)
    const newRegion: WorldRegion = {
      id: `region-${this._state.regions.length}`,
      name: this._generateRegionName(),
      terrain,
      coordinates: { x: coords.x, y: coords.y },
      planeIndex: this._computePlaneIndex(this._state.mapTemplate, this._state.regions.length, this._state.regions.length + 1),
      directionLabel: this._getDirectionLabel(coords.x, coords.y),
      neighbors: [],
      temperature: round(this._generateTemperature(coords.y)),
      humidity: round(this._generateHumidity(coords.y)),
      pollution: 0,
      resources: this._generateResources(terrain),
      ownerFaction: null,
      population: this._generatePopulation(terrain),
      development: this._generateDevelopment(terrain),
    }
    this._state.regions.push(newRegion)
  }

  /** 区域合并：60% 人口转移（模拟战争/逃亡损耗） */
  private _applyRegionMerge(): void {
    if (this._state.regions.length <= 2) return
    const idx = Math.floor(Math.random() * this._state.regions.length)
    const removed = this._state.regions.splice(idx, 1)[0]
    const target = this._state.regions[Math.floor(Math.random() * this._state.regions.length)]
    target.population += Math.floor(removed.population * 0.6)
    target.development = round((target.development + removed.development) / 2)
  }

  /** 势力冲突：使用世界观文化名称生成器 */
  private _applyFactionConflict(): void {
    if (this._state.regions.length < 2) return
    const i = Math.floor(Math.random() * this._state.regions.length)
    let j = Math.floor(Math.random() * this._state.regions.length)
    if (i === j) j = (j + 1) % this._state.regions.length
    const faction = this._generateFactionName()
    if (!this._state.regions[i].ownerFaction) {
      this._state.regions[i].ownerFaction = faction
    }
    if (!this._state.regions[j].ownerFaction) {
      this._state.regions[j].ownerFaction = faction
    }
  }

  /** 势力覆灭：随机摧毁一个势力的所有区域控制权 */
  private _applyFactionDestruction(): void {
    const factions = new Set(
      this._state.regions
        .filter((r) => r.ownerFaction !== null)
        .map((r) => r.ownerFaction as string),
    )
    if (factions.size === 0) return
    const factionsArr = Array.from(factions)
    const target = factionsArr[Math.floor(Math.random() * factionsArr.length)]
    for (const region of this._state.regions) {
      if (region.ownerFaction === target) {
        region.ownerFaction = null
      }
    }
  }

  /** 势力分裂：一个多区域势力分裂为两个 */
  private _applyFactionSplit(): void {
    // 统计势力区域数
    const factionRegions = new Map<string, WorldRegion[]>()
    for (const region of this._state.regions) {
      if (!region.ownerFaction) continue
      const list = factionRegions.get(region.ownerFaction) || []
      list.push(region)
      factionRegions.set(region.ownerFaction, list)
    }
    // 找有 2+ 区域的势力
    const candidates = Array.from(factionRegions.entries()).filter(([, regions]) => regions.length >= 2)
    if (candidates.length === 0) return

    const [factionName, regions] = candidates[Math.floor(Math.random() * candidates.length)]
    const mid = Math.ceil(regions.length / 2)
    const newFaction = this._generateFactionName()
    for (let i = mid; i < regions.length; i++) {
      regions[i].ownerFaction = newFaction
    }
    // 为新势力生成关系（继承原势力部分关系 + 随机变异）
    this._generateFactionRelationsForNew(newFaction, factionName)
  }

  /** 获取当前所有活跃势力名 */
  private _getActiveFactions(): string[] {
    const factions = new Set<string>()
    for (const region of this._state.regions) {
      if (region.ownerFaction) factions.add(region.ownerFaction)
    }
    return Array.from(factions)
  }

  /** 为新出现的势力生成初始外交关系 */
  private _generateFactionRelationsForNew(newFaction: string, _parentFaction?: string): void {
    const relations = this._state.factionRelations ?? []
    const existing = this._getActiveFactions().filter((f) => f !== newFaction)

    for (const target of existing) {
      // 检查是否已有关系
      const hasRelation = relations.some(
        (r) =>
          (r.sourceFaction === newFaction && r.targetFaction === target)
          || (r.sourceFaction === target && r.targetFaction === newFaction),
      )
      if (hasRelation) continue

      // 选择关系类型（权重随机）
      const relation = this._pickRelationType()
      const [tMin, tMax] = FACTION_TENSION_INITIAL[relation] ?? [30, 60]
      relations.push({
        sourceFaction: newFaction,
        targetFaction: target,
        relation: relation as FactionRelationType,
        tension: Math.round(tMin + Math.random() * (tMax - tMin)),
      })
    }
    this._state.factionRelations = relations
  }

  /** 权重随机选择关系类型 */
  private _pickRelationType(): string {
    const entries = Object.entries(FACTION_RELATION_GENERATION_WEIGHTS)
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let roll = Math.random() * total
    for (const [type, weight] of entries) {
      roll -= weight
      if (roll <= 0) return type
    }
    return 'neutral'
  }

  /** 每 10 年演变一次势力外交关系 */
  private _evolveFactionRelations(context: RoundContext): void {
    let relations = this._state.factionRelations ?? []
    const factions = this._getActiveFactions()

    // 随着势力数量变化，清理已不存在势力的关系
    relations = relations.filter(
      (r) => factions.includes(r.sourceFaction) && factions.includes(r.targetFaction),
    )

    // 为新势力关系对建立初始关系
    for (const a of factions) {
      for (const b of factions) {
        if (a >= b) continue // 避免重复 / 自反
        const exists = relations.some(
          (r) =>
            (r.sourceFaction === a && r.targetFaction === b)
            || (r.sourceFaction === b && r.targetFaction === a),
        )
        if (!exists) {
          const relation = this._pickRelationType()
          const [tMin, tMax] = FACTION_TENSION_INITIAL[relation] ?? [30, 60]
          relations.push({
            sourceFaction: a,
            targetFaction: b,
            relation: relation as FactionRelationType,
            tension: Math.round(tMin + Math.random() * (tMax - tMin)),
          })
        }
      }
    }

    // 随机挑选一对已有关系进行 tension 漂移
    if (relations.length > 0) {
      const idx = Math.floor(Math.random() * relations.length)
      const rel = relations[idx]

      // 天象不稳定 → 额外漂移
      const celestialBonus = this._getCelestialProbabilityBonus(context) > 0
        ? FACTION_TENSION_CELESTIAL_BONUS
        : 0
      const drift = Math.round((Math.random() - 0.5) * 2 * FACTION_TENSION_DRIFT + celestialBonus)
      // 关系紧张度修正，限制在 [0, 100]
    rel.tension = clamp(rel.tension + drift, 0, 100)

      // 阈值检测 → 关系类型可能切换
      if (rel.tension >= FACTION_TENSION_WAR_THRESHOLD && rel.relation !== 'war') {
        rel.relation = 'war'
      } else if (rel.tension <= FACTION_TENSION_ALLIANCE_THRESHOLD && rel.relation === 'war') {
        rel.relation = 'neutral'
      } else if (
        rel.tension <= FACTION_TENSION_ALLIANCE_THRESHOLD
        && (rel.relation === 'neutral' || rel.relation === 'trade')
      ) {
        rel.relation = Math.random() < 0.5 ? 'alliance' : 'trade'
      }
    }

    this._state.factionRelations = relations
  }

  /** 获取势力间关系（双向查找） */
  private _getFactionRelation(sourceFaction: string, targetFaction: string): FactionRelationEntry | undefined {
    const relations = this._state.factionRelations ?? []
    return relations.find(
      (r) =>
        (r.sourceFaction === sourceFaction && r.targetFaction === targetFaction)
        || (r.sourceFaction === targetFaction && r.targetFaction === sourceFaction),
    )
  }

  /** 读取天象跨域效果 → 应用于区域资源与开发度 */
  private _applyCelestialWorldMapEffect(context: RoundContext): void {
    const celestial = context.subsystemStates['celestial']
    if (!celestial?.data) return
    const data = celestial.data as Record<string, unknown>
    const crossEffects = data.crossEffects as Array<{ targetSystem: string; effectType: string; value: number }> | undefined
    if (!crossEffects || !Array.isArray(crossEffects)) return

    for (const effect of crossEffects) {
      if (effect.targetSystem !== 'world-map') continue

      if (effect.effectType === 'resource_penalty') {
        for (const region of this._state.regions) {
          for (const resource of region.resources) {
            resource.abundance = clamp(resource.abundance + effect.value, 0, Infinity)
          }
        }
      } else if (effect.effectType === 'stability_penalty') {
        for (const region of this._state.regions) {
          region.development = clamp(region.development + effect.value, 0, Infinity)
        }
      }
    }
  }

  // ============================================================
  // 内部：摘要与格式化
  // ============================================================

  private _buildPlayerLocationSummary(context?: RoundContext): string {
    if (this._state.regions.length === 0) {
      return '【世界地图·玩家所在】尚未初始化'
    }

    const player = this._readPlayerLocation(context)
    if (!player?.regionId) {
      return '【世界地图·玩家所在】尚未定位（等待定居系统绑定区域）'
    }

    const region = this._state.regions.find((r) => r.id === player.regionId)
    if (!region) {
      return '【世界地图·玩家所在】区域数据缺失'
    }

    const coords = player.coordinates ?? region.coordinates
    return this._formatRegionForPrompt(region, coords)
  }

  private _readPlayerLocation(context?: RoundContext): {
    regionId?: string
    region?: string
    coordinates?: { x: number; y: number }
  } | null {
    const data = context?.subsystemStates['settlement']?.data as
      | { playerSettlement?: { regionId?: string; region?: string; coordinates?: { x: number; y: number } } | null }
      | undefined
    return data?.playerSettlement ?? null
  }

  private _formatRegionForPrompt(
    region: WorldRegion,
    playerCoords: { x: number; y: number },
  ): string {
    const template = MAP_TEMPLATE_LABELS[this._state.mapTemplate]
    const terrain = TERRAIN_ZH_MAP[region.terrain]
    const pop = (region.population / 10000).toFixed(0)
    const planeText = this._state.mapTemplate === 'planar' || this._state.mapTemplate === 'stellar'
      ? `位面${region.planeIndex + 1} · `
      : ''
    const faction = region.ownerFaction ? ` · 势力：${region.ownerFaction}` : ''
    const resourceText = region.resources.length > 0
      ? region.resources
        .slice()
        .sort((a, b) => b.abundance - a.abundance)
        .slice(0, 4)
        .map((res) => `${res.type}(${res.abundance})`)
        .join('、')
      : '无'
    const neighborNames = region.neighbors
      .map((id) => this._state.regions.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .slice(0, 4)
    const neighborText = neighborNames.length > 0 ? neighborNames.join('、') : '无'
    const bg = region.narrativeBackground ? ` · 背景：${region.narrativeBackground}` : ''

    return [
      `【世界地图·玩家所在】${template} · ${planeText}${region.name}（${terrain}）`,
      `坐标(${playerCoords.x},${playerCoords.y})`,
      `人口${pop}万 · 开发${region.development} · 气温${region.temperature}℃ · 湿度${region.humidity}%${faction}`,
      `资源：${resourceText} · 邻区：${neighborText}${bg}`,
    ].join(' | ')
  }

  private _buildFactionSummary(): string {
    const factionCounts = new Map<string, number>()
    for (const region of this._state.regions) {
      if (region.ownerFaction) {
        factionCounts.set(region.ownerFaction, (factionCounts.get(region.ownerFaction) ?? 0) + 1)
      }
    }
    if (factionCounts.size === 0) return '当前无活跃势力'

    const sorted = Array.from(factionCounts.entries()).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5).map(([name, count]) => `${name}（${count}区域）`)
    let result = `势力分布：${top.join('、')}` + (sorted.length > 5 ? ` 等${sorted.length}个势力` : '')

    // 附加外交关系摘要（取前 3 条非中立/非贸易关系）
    const relations = this._state.factionRelations ?? []
    const notable = relations.filter(
      (r) => r.relation === 'war' || r.relation === 'alliance' || r.relation === 'vassal',
    )
    if (notable.length > 0) {
      const relationLines = notable.slice(0, 3).map(
        (r) => {
          const mark = FACTION_RELATION_MARKS[r.relation] ?? ''
          const label = FACTION_RELATION_LABELS[r.relation] ?? r.relation
          return `${r.sourceFaction} ${mark}${label} ${r.targetFaction}（紧张度${r.tension}）`
        },
      )
      result += `\n外交关系：${relationLines.join('；')}`
    }

    return result
  }
}
