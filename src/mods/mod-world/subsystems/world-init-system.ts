/**
 * @module world-init-system.ts
 * @description 世界初始化子系统 —— 接收用户 5 个维度参数，按空间形态生成对应区域
 * @mod mod-world
 *
 * 区域生成策略（按空间形态分流）：
 *   climateLatitude — 星球气候带模型（大陆/群岛/盘古/多大陆/海洋）
 *   concentricRings — 天圆地方同心环模型（中央→内环→中环→外环→边缘）
 *   discrete        — 位面独立空间（每层为独立实体）
 *   cosmic          — 星际尺度（星域/星系/星球）
 *   abstract        — 虚空抽象空间（无物理区域，仅原点）
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { eventBus } from '@/core'
import { clamp } from '@/core/shared'

import {
  type WorldConfig,
  type WorldSnapshot,
  type RegionData,
  type WorldTagsV2,
  type MapTemplateConfig,
  MAP_TEMPLATES,
  WORLDVIEW_TAG_DEFAULTS,
  combineTagDefaults,
  clampModifier,
  inferMapTemplate,
} from './world-init-deps'
import { shouldUseGenericSimulationPools } from '../utils/world-pool-selectors'

import { useWorldStore } from '../store'

/** 内部状态 */
interface InternalState {
  config: WorldConfig | null
  snapshot: WorldSnapshot | null,
}

/** 文明阶段 → 人口基数 */
const CIV_POPULATION_BASE: Record<string, number> = {
  primitive: 50,
  ancient: 200,
  medieval: 1000,
  renaissance: 3000,
  industrial: 10000,
  modern: 50000,
  information: 100000,
  space: 500000,
}

/** 文明阶段 → 开发度基础范围 */
const CIV_DEVELOPMENT_RANGE: Record<string, [number, number]> = {
  primitive: [1, 15],
  ancient: [10, 30],
  medieval: [20, 45],
  renaissance: [35, 60],
  industrial: [50, 80],
  modern: [70, 95],
  information: [75, 95],
  space: [80, 100],
}

/**
 * 地形 → 人口修正系数
 *
 * 平原最宜居住，冻土/荒漠最不宜居
 */
const TERRAIN_POPULATION_MULTIPLIER: Record<string, number> = {
  plains: 1.5,
  forest: 1.2,
  savanna: 0.8,
  rainforest: 0.7,
  desert: 0.3,
  tundra: 0.2,
  ethereal: 1.0,
  space: 1.0,
  void: 1.0,
}

/** 天圆地方环名称 */
const FLAT_DISC_RING_NAMES = ['中央圣地', '内环沃土', '中环疆域', '外环荒野', '边缘绝域']

/** 位面层名称 */
const PLANE_LAYER_NAMES = ['上层界', '中层界', '下层界', '深渊界']

/** 星际区域名称 */
const STAR_SYSTEM_NAMES = ['恒星核心区', '亚空间航道', '殖民星域', '外星边域', '虚空缓冲区']

export class WorldInitSystem implements ISubSystem {
  readonly id = 'world-init' as const
  readonly mod = 'mod-world' as const
  readonly label = '世界初始化' as const
  readonly description = '世界创建中央工厂：接收 5 维度 → 按空间形态分流策略生成区域 + 标签' as const

  private state: InternalState = { config: null, snapshot: null }

  // ========== 工厂方法 ==========

  /**
   * 世界初始化工厂方法
   *
   * 1. 选择地图模板
   * 2. 根据 generationStrategy 调用对应区域生成算法
   * 3. 生成标签映射
   * 4. 输出 WorldSnapshot
   */
  initialize(config: WorldConfig): WorldSnapshot {
    const calibration = useWorldStore.getState().calibration
    const mapTemplateId = calibration?.world?.mapTemplate ?? inferMapTemplate(config)
    let template = MAP_TEMPLATES[mapTemplateId] ?? MAP_TEMPLATES.continent
    if (calibration?.world?.regionCount) {
      template = { ...template, regionCount: calibration.world.regionCount }
    }
    const regions = this.generateRegionsByStrategy(config, template, calibration)

    // 从 6×39 默认标签表匹配，未匹配则兜底 MIXED
    const tags: WorldTagsV2 = this.resolveTags(config)

    const snapshot: WorldSnapshot = {
      worldConfig: config,
      entities: [],
      regions,
      tags,
    }

    this.state = { config, snapshot }
    eventBus.emit('mod-world:initialized', snapshot)
    return snapshot
  }

  /** 从 WORLDVIEW_TAG_DEFAULTS 匹配标签，支持组合世界观 */
  private resolveTags(config: WorldConfig): WorldTagsV2 {
    if (shouldUseGenericSimulationPools()) {
      return WORLDVIEW_TAG_DEFAULTS.mixed!
    }

    const tag = config.essenceTag

    // 支持组合世界观（如 "idealist+scifi"）
    if (tag.includes('+')) {
      const parts = tag.split('+').map((t) => t.trim())
      const [primary, secondary] = parts
      const p = WORLDVIEW_TAG_DEFAULTS[primary]
      const s = WORLDVIEW_TAG_DEFAULTS[secondary]
      if (p && s) return combineTagDefaults(p, s)
    }

    return WORLDVIEW_TAG_DEFAULTS[tag] ?? WORLDVIEW_TAG_DEFAULTS.mixed!
  }

  /** 获取当前快照（供其他子系统读取区域列表） */
  getSnapshot(): WorldSnapshot | null {
    return this.state.snapshot
  }

  // ========== 策略路由 ==========

  private generateRegionsByStrategy(
    config: WorldConfig,
    template: MapTemplateConfig,
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): RegionData[] {
    const strategy = template.generationStrategy
    switch (strategy) {
      case 'climateLatitude': return this.generateClimateLatitudeRegions(config, template, calibration)
      case 'concentricRings': return this.generateConcentricRingRegions(config, template, calibration)
      case 'discrete':        return this.generateDiscreteRegions(config, template, calibration)
      case 'cosmic':          return this.generateCosmicRegions(config, template, calibration)
      case 'abstract':        return this.generateAbstractRegions(config, template, calibration)
    }
  }

  private getTemplate(form: string): MapTemplateConfig {
    return MAP_TEMPLATES[form] ?? MAP_TEMPLATES.continent
  }

  // ========== 工具方法 ==========

  private getPopulationBase(
    config: WorldConfig,
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): number {
    const base = calibration?.world?.populationBase
      ?? CIV_POPULATION_BASE[config.civilizationStage]
      ?? 500
    const mod = clampModifier(calibration?.formulas?.populationModifier ?? 1.0)
    return Math.max(1, Math.round(base * mod))
  }

  private getDevelopmentRange(
    config: WorldConfig,
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): [number, number] {
    const custom = calibration?.world?.developmentRange
    const base = custom
      ? [custom.min, custom.max] as [number, number]
      : CIV_DEVELOPMENT_RANGE[config.civilizationStage] ?? [10, 50]
    const mod = clampModifier(calibration?.formulas?.developmentModifier ?? 1.0)
    return [
      clamp(Math.round(base[0] * mod), -Infinity, 100),
      clamp(Math.round(base[1] * mod), -Infinity, 100),
    ]
  }

  /**
   * 计算区域人口
   *
   * 公式：人口基数 × 地形系数 × 随机扰动
   */
  private calcPopulation(populationBase: number, terrainTag: string): number {
    const multiplier = TERRAIN_POPULATION_MULTIPLIER[terrainTag] ?? 1.0
    const jitter = 0.5 + Math.random() * 1.0 // 0.5 ~ 1.5
    return Math.round(populationBase * multiplier * jitter)
  }

  /**
   * 计算区域开发度
   *
   * 开发度与人口正相关：
   * - 以 civilizationStage 为基准范围
   * - 人口超出 base × 1.3 → 接近范围上限
   * - 人口低于 base × 0.5 → 接近范围下限
   */
  private calcDevelopmentLevel(
    devRange: [number, number],
    population: number,
    populationBase: number,
  ): number {
    const [devMin, devMax] = devRange
    const ratio = population / (populationBase || 1)
    // ratio=0.5 → devMin+15%, ratio=1.0 → devMin+50%, ratio=1.5 → devMin+85%
    const clampedRatio = Math.max(0.3, Math.min(2.0, ratio))
    const factor = (clampedRatio - 0.3) / 1.7 // 0.0 ~ 1.0
    return Math.round(devMin + factor * (devMax - devMin))
  }

  private baseTemperature(yRatio: number): number {
    return 30 - Math.abs(yRatio) * 35
  }

  private baseHumidity(absYRatio: number): number {
    return 80 - absYRatio * 70
  }

  private jitter(range: number): number {
    return (Math.random() - 0.5) * 2 * range
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)))
  }

  private pickTerrain(temperature: number, humidity: number): string {
    if (temperature < 0) return 'tundra'
    if (humidity < 20) return 'desert'
    if (temperature > 25 && humidity > 60) return 'rainforest'
    if (humidity > 50) return 'forest'
    if (temperature > 20) return 'savanna'
    return 'plains'
  }

  // ========== climateLatitude — 星球气候带模型 ==========

  /** 用于 continent/archipelago/pangaea/multiContinent/oceanWorld */
  private generateClimateLatitudeRegions(
    config: WorldConfig,
    template: typeof MAP_TEMPLATES[keyof typeof MAP_TEMPLATES],
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): RegionData[] {
    const regions: RegionData[] = []
    const populationBase = this.getPopulationBase(config, calibration)
    const devRange = this.getDevelopmentRange(config, calibration)

    for (let i = 0; i < template.regionCount; i++) {
      const yRatio = template.regionCount > 1
        ? (i / (template.regionCount - 1)) * 2 - 1
        : 0

      const temperature = this.clamp(
        this.baseTemperature(yRatio) + this.jitter(3),
        -10,
        40,
      )
      const humidity = this.clamp(
        this.baseHumidity(Math.abs(yRatio)) + this.jitter(10),
        0,
        100,
      )
      const terrainTag = this.pickTerrain(temperature, humidity)
      const population = this.calcPopulation(populationBase, terrainTag)
      const developmentLevel = this.calcDevelopmentLevel(devRange, population, populationBase)

      regions.push({
        id: `${config.name}-region-${i}`,
        name: `${template.label}第${i + 1}区`,
        templateType: template.label,
        temperature,
        humidity,
        terrainTag,
        resourceDistribution: {},
        population,
        developmentLevel,
      })
    }

    return regions
  }

  // ========== concentricRings — 天圆地方同心环模型 ==========

  /**
   * 平坦大地，区域从中央向边缘呈同心环分布
   *
   * 温度/湿度从中央向外递变，不依赖硬编码数组
   * 环 0（中央圣地）：25°C / 湿度 60
   * 环 N-1（边缘绝域）：~-5°C / 湿度 ~10
   */
  private generateConcentricRingRegions(
    config: WorldConfig,
    template: typeof MAP_TEMPLATES[keyof typeof MAP_TEMPLATES],
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): RegionData[] {
    const regions: RegionData[] = []
    const populationBase = this.getPopulationBase(config, calibration)
    const devRange = this.getDevelopmentRange(config, calibration)
    const count = template.regionCount

    for (let i = 0; i < count; i++) {
      // 根据环位置动态计算温度/湿度，避免硬编码数组长度限制
      const ringRatio = count > 1 ? i / (count - 1) : 0
      const temperature = Math.round(25 - ringRatio * 30)  // 25°C → -5°C
      const humidity = Math.round(60 - ringRatio * 50)      // 60 → 10
      const name = FLAT_DISC_RING_NAMES[i] ?? `第${i + 1}环`

      const terrainTag = this.pickTerrain(temperature, humidity)
      const population = this.calcPopulation(populationBase, terrainTag)
      const developmentLevel = this.calcDevelopmentLevel(devRange, population, populationBase)

      regions.push({
        id: `${config.name}-region-${i}`,
        name: `${template.label}·${name}`,
        templateType: template.label,
        temperature,
        humidity,
        terrainTag,
        resourceDistribution: {},
        population,
        developmentLevel,
      })
    }

    return regions
  }

  // ========== discrete — 位面独立空间 ==========

  /** 位面：每层为独立空间，温度和湿度没有地理意义，采用默认中性值 */
  private generateDiscreteRegions(
    config: WorldConfig,
    template: typeof MAP_TEMPLATES[keyof typeof MAP_TEMPLATES],
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): RegionData[] {
    const regions: RegionData[] = []
    const populationBase = this.getPopulationBase(config, calibration)
    const devRange = this.getDevelopmentRange(config, calibration)

    for (let i = 0; i < template.regionCount; i++) {
      const name = PLANE_LAYER_NAMES[i] ?? `第${i + 1}层`
      // 位面没有统一气候，用中性值 + 随机扰动模拟位面差异
      const temperature = 15 + this.jitter(10)
      const humidity = 50 + this.jitter(20)
      const terrainTag = 'ethereal'
      const population = this.calcPopulation(populationBase, terrainTag)
      const developmentLevel = this.calcDevelopmentLevel(devRange, population, populationBase)

      regions.push({
        id: `${config.name}-region-${i}`,
        name: `${template.label}·${name}`,
        templateType: template.label,
        temperature,
        humidity,
        terrainTag,
        resourceDistribution: {},
        population,
        developmentLevel,
      })
    }

    return regions
  }

  // ========== cosmic — 星际尺度 ==========

  /** 星系网络：每区域为一个星域/星系，尺度远超星球级 */
  private generateCosmicRegions(
    config: WorldConfig,
    template: typeof MAP_TEMPLATES[keyof typeof MAP_TEMPLATES],
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): RegionData[] {
    const regions: RegionData[] = []
    const populationBase = this.getPopulationBase(config, calibration) * 100
    const devRange = this.getDevelopmentRange(config, calibration)

    for (let i = 0; i < template.regionCount; i++) {
      const name = STAR_SYSTEM_NAMES[i] ?? `星系${i + 1}`
      const temperature = 20 + this.jitter(15)
      const humidity = 50 + this.jitter(30)
      const terrainTag = 'space'
      const population = this.calcPopulation(populationBase, terrainTag)
      const developmentLevel = this.calcDevelopmentLevel(devRange, population, populationBase)

      regions.push({
        id: `${config.name}-region-${i}`,
        name: `${template.label}·${name}`,
        templateType: template.label,
        temperature,
        humidity,
        terrainTag,
        resourceDistribution: {},
        population,
        developmentLevel,
      })
    }

    return regions
  }

  // ========== abstract — 虚空抽象空间 ==========

  /** 虚空：无物理区域概念，只生成一个"原点" */
  private generateAbstractRegions(
    config: WorldConfig,
    _template: typeof MAP_TEMPLATES[keyof typeof MAP_TEMPLATES],
    calibration: ReturnType<typeof useWorldStore.getState>['calibration'],
  ): RegionData[] {
    const populationBase = this.getPopulationBase(config, calibration)

    return [{
      id: `${config.name}-origin`,
      name: '原点',
      templateType: '虚空',
      temperature: 20,
      humidity: 50,
      terrainTag: 'void',
      resourceDistribution: {},
      population: Math.round(populationBase),
      developmentLevel: 50,
    }]
  }

  // ========== ISubSystem 实现 ==========

  collectState(_context: RoundContext): SubSystemState {
    const summaryText = this.state.snapshot
      ? `【${this.label}】已初始化 | 世界：${this.state.config?.name ?? '-'} | ${this.state.snapshot.regions.length} 区域`
      : ''
    return {
      id: this.id,
      summary: summaryText,
      data: structuredClone(this.state.snapshot ?? {}),
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
    const c = changes.changes
    // 初始化是一次性的，不接受回合对基础结构的变更
    void c
  }

  reset(): void {
    this.state = { config: null, snapshot: null, }
  }
}
