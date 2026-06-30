/**
 * @module IndustrySystem
 * @description 产业子系统：主导产业判定 + 生产率乘数 + 科技采纳率 + 区域资源分布（合并 TechResource）
 * @mod mod-tech-level
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { IndustryState, PrimaryFocus, ResourceDistributionState, RegionResource, TerrainType } from '../types'

import {
  FOCUS_THRESHOLDS,
  FOCUS_LABELS_ZH,
  POLLUTION_FACTORS,
  TECH_LEVEL_RANGE,
  RESOURCES_RANGE,
  PRODUCTIVITY_RANGE,
  ADOPTION_RANGE,
  RENEWABLE_RESOURCES,
  RECOVERY_RATES,
  DISCOVERY_PROBABILITY,
  DEPLETION_THRESHOLD,
  BASE_TERRAIN_RESOURCE_RANGES,
  WORLDVIEW_TERRAIN_EXTRAS,
  RESOURCE_LABELS,
} from '../constants'
import {
  round,
  clampNumber,
  randomInRange,
} from '../utils'

import { getFormulaModifier } from '@/mods/mod-world'

const INDUSTRY_TAG_MAP: AttrTagMap = {
  '生产力': 'productivityMultiplier', '产能': 'productivityMultiplier',
  '技术采用': 'techAdoptionRate', '技术普及': 'techAdoptionRate',
}

export class IndustrySystem implements ISubSystem {
  readonly id = 'industry' as const
  readonly mod = 'mod-tech-level' as const
  readonly label = '产业资源' as const
  readonly description = '管理主导产业判定、生产率、科技采纳率、区域资源分布与全球稀缺度' as const

  private state: IndustryState & { resources: ResourceDistributionState } = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState() {
    return {
      initialized: false,
      primaryFocus: 'agriculture' as PrimaryFocus,
      productivityMultiplier: 1,
      techAdoptionRate: 0.01,
      resources: {
        initialized: false,
        regionalResources: {},
        globalScarcity: 0,
      } as ResourceDistributionState,
    }
  }

  collectState(context: RoundContext): SubSystemState {
    // round-idempotent 守卫
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.getSummaryText(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

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

    // ——— AI 适配分支：资源分布初始化 ———
    if (c.adaptationType === 'resource-init') {
      this.initResourceDistribution(
        typeof c.worldview === 'string' ? c.worldview : '',
        c.terrainMap as Record<string, TerrainType> | undefined,
        c.resourceOverrides as Record<string, RegionResource[]> | undefined,
      )
      this.state.initialized = true
      return
    }

    // ——— 产业推进 ———
    if (typeof c.techLevel === 'number') {
      this.advanceIndustry(
        c.techLevel,
        typeof c.resourceAbundance === 'number' ? c.resourceAbundance : 50,
        c.warActive === true,
        c.supernatural === true,
      )
    }

    // ——— 资源推进 ———
    if (c.advanceResources === true) {
      this.advanceResources()
    }

    // ——— 直接设置状态 ———
    if (typeof c.primaryFocus === 'string') this.state.primaryFocus = c.primaryFocus as PrimaryFocus
    if (typeof c.productivityMultiplier === 'number') this.state.productivityMultiplier = clampNumber(c.productivityMultiplier, PRODUCTIVITY_RANGE.min, PRODUCTIVITY_RANGE.max)
    if (typeof c.techAdoptionRate === 'number') this.state.techAdoptionRate = clampNumber(c.techAdoptionRate, ADOPTION_RANGE.min, ADOPTION_RANGE.max)
    if (typeof c.initialized === 'boolean') this.state.initialized = c.initialized

    // P2 降级：AI JSON 未显式声明工业变化时，从 description 中补偿提取
    const hasExplicit = typeof c.techLevel === 'number' || c.advanceResources === true ||
      typeof c.primaryFocus === 'string' || typeof c.productivityMultiplier === 'number' ||
      typeof c.techAdoptionRate === 'number' || typeof c.initialized === 'boolean'
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, INDUSTRY_TAG_MAP)
      if (extracted) {
        if (typeof extracted.productivityMultiplier === 'number') {
          this.state.productivityMultiplier = clampNumber(
            this.state.productivityMultiplier + extracted.productivityMultiplier,
            PRODUCTIVITY_RANGE.min, PRODUCTIVITY_RANGE.max,
          )
        }
        if (typeof extracted.techAdoptionRate === 'number') {
          this.state.techAdoptionRate = clampNumber(
            this.state.techAdoptionRate + extracted.techAdoptionRate,
            ADOPTION_RANGE.min, ADOPTION_RANGE.max,
          )
        }
      }
    }
  }

  // ─── 产业推进逻辑 ───
  private advanceIndustry(techLevel: number, resources: number, warActive: boolean, supernatural: boolean): void {
    const safeTech = clampNumber(techLevel, TECH_LEVEL_RANGE.min, TECH_LEVEL_RANGE.max)
    const safeResources = clampNumber(resources, RESOURCES_RANGE.min, RESOURCES_RANGE.max)

    // 目标主导产业判定
    let targetFocus: PrimaryFocus = 'mixed'
    if (warActive) {
      targetFocus = 'military'
    } else if (supernatural) {
      targetFocus = 'magic'
    } else {
      for (const t of FOCUS_THRESHOLDS) {
        if (safeTech < t.max) { targetFocus = t.focus; break }
      }
    }

    this.state.primaryFocus = targetFocus

    // 目标生产率：1 + techLevel/100 × 0.5 + resources/100 × 0.3
    const targetProductivity = clampNumber(
      (1 + (safeTech / 100) * 0.5 + (safeResources / 100) * 0.3) * getFormulaModifier('industryProductivityModifier'),
      PRODUCTIVITY_RANGE.min,
      PRODUCTIVITY_RANGE.max,
    )
    // 目标科技采纳率：0.01 + techLevel/100 × 0.05
    const targetAdoption = clampNumber(0.01 + (safeTech / 100) * 0.05, ADOPTION_RANGE.min, ADOPTION_RANGE.max)

    // 渐变过渡（过渡因子 = 1/10，平滑移动）
    const transitionFactor = 0.1
    this.state.productivityMultiplier = round(
      this.state.productivityMultiplier + (targetProductivity - this.state.productivityMultiplier) * transitionFactor,
    )
    this.state.techAdoptionRate = round(
      this.state.techAdoptionRate + (targetAdoption - this.state.techAdoptionRate) * transitionFactor,
    )
    this.state.initialized = true
  }

  // ─── 资源初始化逻辑 ───
  /**
   * 根据地形映射和世界观初始化区域资源分布。
   * 降级策略：worldview 不匹配时仅使用基础地形资源范围。
   */
  initResourceDistribution(
    worldview: string,
    terrainMap?: Record<string, TerrainType>,
    resourceOverrides?: Record<string, RegionResource[]>,
  ): void {
    const res: Record<string, RegionResource[]> = {}

    if (terrainMap) {
      for (const [regionId, terrain] of Object.entries(terrainMap)) {
        const regionResources: RegionResource[] = []

        // 基础地形资源
        const baseRanges = BASE_TERRAIN_RESOURCE_RANGES[terrain]
        if (baseRanges) {
          for (const entry of baseRanges) {
            regionResources.push({
              type: entry.type,
              abundance: randomInRange(entry.abundance[0], entry.abundance[1]),
              quality: randomInRange(40, 80),
            })
          }
        }

        // 世界观特殊资源附加
        const worldviewExtras = WORLDVIEW_TERRAIN_EXTRAS[worldview]
        if (worldviewExtras) {
          const extraRanges = worldviewExtras[terrain]
          if (extraRanges) {
            for (const entry of extraRanges) {
              regionResources.push({
                type: entry.type,
                abundance: randomInRange(entry.abundance[0], entry.abundance[1]),
                quality: randomInRange(60, 95),
              })
            }
          }
        }

        res[regionId] = regionResources
      }
    }

    // 应用 AI 适配的资源覆盖（标签映射）
    if (resourceOverrides) {
      for (const [regionId, overrides] of Object.entries(resourceOverrides)) {
        if (res[regionId]) {
          for (const ovr of overrides) {
            const existing = res[regionId].find((r) => r.type === ovr.type)
            if (existing) {
              existing.abundance = ovr.abundance
              existing.quality = ovr.quality
            } else {
              res[regionId].push(ovr)
            }
          }
        }
      }
    }

    this.state.resources.regionalResources = res
    this.state.resources.globalScarcity = this.calculateGlobalScarcity(res)
    this.state.resources.initialized = true
  }

  // ─── 资源推进逻辑 ───
  /**
   * 每轮资源消耗 + 可再生恢复 + 新矿脉发现 + 全球稀缺度重算
   */
  private advanceResources(): void {
    const regional = this.state.resources.regionalResources
    const events: string[] = []

    for (const [regionId, resources] of Object.entries(regional)) {
      const updated: RegionResource[] = []

      for (const res of resources) {
        const isRenewable = RENEWABLE_RESOURCES.includes(res.type)

        if (isRenewable) {
          // 可再生资源恢复
          const recoveryRate = RECOVERY_RATES[res.type] ?? 3
          res.abundance = clampNumber(res.abundance + recoveryRate, RESOURCES_RANGE.min, RESOURCES_RANGE.max)
        } else {
          // 不可再生资源自然消耗（每轮 2%）
          res.abundance = clampNumber(res.abundance - 2, RESOURCES_RANGE.min, RESOURCES_RANGE.max)
        }

        // 枯竭检测
        if (res.abundance < DEPLETION_THRESHOLD) {
          events.push(`${RESOURCE_LABELS[res.type] ?? res.type}在${regionId}濒临枯竭（丰度${res.abundance}）`)
        }

        // 品质缓慢下降
        if (res.quality > 0 && Math.random() < 0.01) {
          res.quality = Math.max(0, res.quality - 1)
        }

        updated.push(res)
      }

      // 新矿脉发现
      if (Math.random() < DISCOVERY_PROBABILITY) {
        const terrainMap = this.inferTerrainForRegion(regionId)
        if (terrainMap) {
          const baseRanges = BASE_TERRAIN_RESOURCE_RANGES[terrainMap]
          if (baseRanges && baseRanges.length > 0) {
            const pick = baseRanges[Math.floor(Math.random() * baseRanges.length)]
            updated.push({
              type: pick.type,
              abundance: randomInRange(pick.abundance[0], pick.abundance[1]),
              quality: randomInRange(50, 80),
            })
            events.push(`${regionId}发现新${RESOURCE_LABELS[pick.type] ?? pick.type}矿脉`)
          }
        }
      }

      regional[regionId] = updated
    }

    this.state.resources.regionalResources = regional
    this.state.resources.globalScarcity = this.calculateGlobalScarcity(regional)
  }

  // ─── 辅助方法 ───

  private calculateGlobalScarcity(regional: Record<string, RegionResource[]>): number {
    const allAbundances: number[] = []
    for (const resources of Object.values(regional)) {
      for (const r of resources) {
        allAbundances.push(r.abundance)
      }
    }
    if (allAbundances.length === 0) return 0
    const avg = allAbundances.reduce((a, b) => a + b, 0) / allAbundances.length
    return round(Math.max(0, 100 - avg))
  }

  private inferTerrainForRegion(regionId: string): TerrainType | null {
    // 尝试从已有资源的类型模式推断地形
    const resources = this.state.resources.regionalResources[regionId]
    if (!resources || resources.length === 0) return null

    const types = resources.map((r) => r.type)
    if (types.includes('wood') && types.includes('food')) return 'forest'
    if (types.includes('stone') && types.includes('iron') && types.includes('gold')) return 'mountain'
    if (types.includes('food') && types.includes('wood') && types.includes('stone')) return 'plain'

    return 'plain' // 默认平原地形
  }

  // ─── 领域方法 ───

  /** 获取污染因子（供 B2.8 PollutionSystem 消费） */
  getPollutionFactor(): number {
    return POLLUTION_FACTORS[this.state.primaryFocus]
  }

  /** 获取区域资源分布 */
  getRegionalResources(): Record<string, RegionResource[]> {
    return this.state.resources.regionalResources
  }

  /** 获取全球稀缺度 */
  getGlobalScarcity(): number {
    return this.state.resources.globalScarcity
  }

  /** 格式化为 AI prompt 文本 */
  formatForPrompt(): string {
    const lines: string[] = []
    lines.push('【产业概况】')
    lines.push(`主导产业：${FOCUS_LABELS_ZH[this.state.primaryFocus]}`)
    lines.push(`生产率乘数：${this.state.productivityMultiplier.toFixed(2)}`)
    lines.push(`科技采纳率：${(this.state.techAdoptionRate * 100).toFixed(1)}%`)

    if (this.state.resources.initialized) {
      lines.push('【资源分布】')
      const regional = this.state.resources.regionalResources
      for (const [regionId, resources] of Object.entries(regional)) {
        const parts = resources.map((r) => `${RESOURCE_LABELS[r.type] ?? r.type}(${r.abundance})`)
        lines.push(`${regionId}: ${parts.join('、')}`)
      }
      lines.push(`全球稀缺度：${Math.round(this.state.resources.globalScarcity)}`)
    }

    return lines.join('\n')
  }

  private getSummaryText(): string {
    const baseSummary = `${FOCUS_LABELS_ZH[this.state.primaryFocus]} · 生产率 ${this.state.productivityMultiplier.toFixed(2)} · 采纳率 ${(this.state.techAdoptionRate * 100).toFixed(0)}%`
    if (this.state.resources.initialized) {
      return `${baseSummary} · 稀缺度 ${Math.round(this.state.resources.globalScarcity)}`
    }
    return baseSummary
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
