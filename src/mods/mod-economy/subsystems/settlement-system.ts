/**
 * @module SettlementSystem
 * @description 定居子系统：定居点增长、繁荣度与安全度变化、世界定居点管理
 * @mod mod-economy
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { SettlementState, Settlement, SettlementType } from '../types'
import type { WorldMapState } from '@/mods/mod-base-universe'

import {
  SETTLEMENT_POPULATION_RANGE,
  SETTLEMENT_TYPE_LABELS,
  SETTLEMENT_TIER_HINTS,
  WORLDVIEW_TIER_MAP,
  DEFAULT_TIER_SET,
  round,
  clamp,
} from '../constants'

const STURM_ORDER: SettlementType[] = ['village', 'town', 'city', 'capital']

/** 财富门槛 → 起始等级 */
const WEALTH_TIER_THRESHOLDS: [number, SettlementType][] = [
  [50000, 'capital'],
  [5000, 'city'],
  [500, 'town'],
]

const SETTLEMENT_TAG_MAP: AttrTagMap = {
  '繁荣': 'prosperity', '繁荣度': 'prosperity',
  '安全': 'safety', '治安': 'safety', '安全度': 'safety',
  '文化影响力': 'cultureInfluence', '影响力': 'cultureInfluence',
  '人口': 'population',
}

export class SettlementSystem implements ISubSystem {
  readonly id = 'settlement' as const
  readonly mod = 'mod-economy' as const
  readonly label = '定居系统' as const
  readonly description = '管理玩家定居地、世界定居点增长、繁荣度与安全度变化' as const

  private state: SettlementState = this.createInitialState()
  private _lastProcessedRound = -1
  private _lastBoundSummary = ''

  private createInitialState(initialWealth?: number): SettlementState {
    // 按财富推断起始等级
    let startType: SettlementType = 'village'
    if (typeof initialWealth === 'number' && initialWealth > 0) {
      for (const [threshold, tier] of WEALTH_TIER_THRESHOLDS) {
        if (initialWealth >= threshold) { startType = tier; break }
      }
    }

    const defaultSettlement: Settlement = {
      id: 'settlement-player',
      name: startType === 'village' ? '起始村' : startType === 'town' ? '起始镇' : startType === 'city' ? '起始城' : '起始都',
      type: startType,
      region: '',
      population: 200,
      prosperity: 30,
      safety: 60,
      cultureInfluence: 10,
      yearsInCurrentTier: 0,
    }

    return {
      playerSettlement: defaultSettlement,
      worldSettlements: [defaultSettlement],
      levelLabels: { ...SETTLEMENT_TYPE_LABELS },
      totalRelocations: 0,
      tierHints: null,
    }
  }

  /** 获取当前世界观对应的标签+提示 */
  private _getTierData(type: SettlementType): { label: string; hint: string } {
    if (this.state.tierHints) {
      // tierHints 已通过 applyChanges 注入（含 worldview 来源）
      for (const tierSet of Object.values(this.state.tierHints)) {
        const hit = tierSet[type]
        if (hit) return hit
      }
    }
    // 兜底：用通用标签
    return { label: SETTLEMENT_TYPE_LABELS[type] ?? type, hint: '' }
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
    if (years > 0) {
      this.advanceSettlements(years)
    }

    return {
      id: this.id,
      summary: this.getSummaryText(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  collectStateUpdate(context: RoundContext): SubSystemState | null {
    if (!this._bindPlayerToWorldMap(context)) return null
    const summary = this.getSummaryText()
    if (summary === this._lastBoundSummary) return null
    this._lastBoundSummary = summary
    return {
      id: this.id,
      summary,
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

    if (c.adaptationType === 'settlement-init') {
      // 按世界观注入分层标签
      const worldview = (c.worldview as string) || ''
      const tierSetKey = WORLDVIEW_TIER_MAP[worldview] ?? DEFAULT_TIER_SET
      const hints = SETTLEMENT_TIER_HINTS[tierSetKey]
      if (hints) {
        this.state.tierHints = { [tierSetKey]: hints }
      }
      // 按财富推断起始等级
      const wealth = typeof c.initialWealth === 'number' ? c.initialWealth : undefined
      if (wealth !== undefined || worldview) {
        this.state = this.createInitialState(wealth)
        if (hints) {
          this.state.tierHints = { [tierSetKey]: hints }
        }
      }
      return
    }

    if (typeof c.yearsAdvanced === 'number') {
      this.advanceSettlements(c.yearsAdvanced)
    }

    if (c.setPlayerSettlement === true && c.settlement && typeof c.settlement === 'object') {
      const s = c.settlement as Record<string, unknown>
      // 记录迁移（如果新定居点和旧的不一样）
      const oldSettlement = this.state.playerSettlement
      if (oldSettlement && (s.name as string) !== oldSettlement.name) {
        this.state.totalRelocations++
      }
      this._lastBoundSummary = ''
      this.state.playerSettlement = {
        id: (s.id as string) || 'settlement-player',
        name: (s.name as string) || '未命名',
        type: (s.type as SettlementType) || 'village',
        region: (s.region as string) || '未知',
        regionId: typeof s.regionId === 'string' ? s.regionId : undefined,
        coordinates: this._readCoordinates(s.coordinates),
        population: typeof s.population === 'number' ? s.population : 100,
        prosperity: typeof s.prosperity === 'number' ? clamp(s.prosperity, 0, 100) : 30,
        safety: typeof s.safety === 'number' ? clamp(s.safety, 0, 100) : 50,
        cultureInfluence: typeof s.cultureInfluence === 'number' ? clamp(s.cultureInfluence, 0, 100) : 10,
        yearsInCurrentTier: 0,
      }
    }

    if (c.addSettlement === true && c.settlement && typeof c.settlement === 'object') {
      const s = c.settlement as Record<string, unknown>
      const newSettlement: Settlement = {
        id: (s.id as string) || `settlement-${Date.now()}`,
        name: (s.name as string) || '新定居点',
        type: (s.type as SettlementType) || 'village',
        region: (s.region as string) || '未知',
        population: typeof s.population === 'number' ? s.population : 100,
        prosperity: typeof s.prosperity === 'number' ? clamp(s.prosperity, 0, 100) : 20,
        safety: typeof s.safety === 'number' ? clamp(s.safety, 0, 100) : 50,
        cultureInfluence: typeof s.cultureInfluence === 'number' ? clamp(s.cultureInfluence, 0, 100) : 5,
        yearsInCurrentTier: 0,
      }
      this.state.worldSettlements.push(newSettlement)
    }

    if (c.removeSettlement === true && typeof c.settlementId === 'string') {
      this.state.worldSettlements = this.state.worldSettlements.filter(
        (s) => s.id !== c.settlementId,
      )
    }

    if (c.setLevelLabels === true && c.labels && typeof c.labels === 'object') {
      Object.assign(this.state.levelLabels, c.labels as Record<string, string>)
    }

    // P2 降级：AI JSON 未显式声明定居点变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || c.setPlayerSettlement === true ||
      c.addSettlement === true || c.removeSettlement === true || c.setLevelLabels === true
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, SETTLEMENT_TAG_MAP)
      if (extracted) {
        const ps = this.state.playerSettlement
        if (!ps) return
        if (typeof extracted.population === 'number') {
          ps.population = clamp(ps.population + extracted.population, 0, Infinity)
        }
        if (typeof extracted.prosperity === 'number') {
          ps.prosperity = clamp(ps.prosperity + extracted.prosperity, 0, 100)
        }
        if (typeof extracted.safety === 'number') {
          ps.safety = clamp(ps.safety + extracted.safety, 0, 100)
        }
        if (typeof extracted.cultureInfluence === 'number') {
          ps.cultureInfluence = clamp(ps.cultureInfluence + extracted.cultureInfluence, 0, 100)
        }
      }
    }
  }

  // ─── 内部逻辑 ───

  private advanceSettlements(years: number): void {
    if (years <= 0) return
    const allSettlements = this.state.playerSettlement
      ? [this.state.playerSettlement, ...this.state.worldSettlements.filter((s) => s.id !== this.state.playerSettlement!.id)]
      : this.state.worldSettlements

    for (const settlement of allSettlements) {
      if (!settlement) continue

      settlement.yearsInCurrentTier += years

      const popRange = SETTLEMENT_POPULATION_RANGE[settlement.type]
      const maxPop = popRange ? popRange[1] : 500000
      const growthRate = 0.02 + (settlement.prosperity / 100) * 0.03
      settlement.population = Math.min(
        maxPop,
        Math.round(settlement.population * (1 + growthRate * years)),
      )

      const safetyFactor = settlement.safety / 100
      const prosperityDelta = ((Math.random() - 0.5) * 4 * safetyFactor + 0.5) * years
      settlement.prosperity = round(clamp(
        settlement.prosperity + prosperityDelta,
        0,
        100,
      ))

      const safetyDelta = (Math.random() - 0.45) * 3 * years
      settlement.safety = round(clamp(settlement.safety + safetyDelta, 0, 100))

      settlement.cultureInfluence = round(clamp(
        settlement.cultureInfluence + settlement.prosperity * 0.01 * years,
        0,
        100,
      ))

      const currentTypeIdx = STURM_ORDER.indexOf(settlement.type)
      if (currentTypeIdx >= 0 && currentTypeIdx < STURM_ORDER.length - 1) {
        const nextType = STURM_ORDER[currentTypeIdx + 1]
        const nextRange = SETTLEMENT_POPULATION_RANGE[nextType]
        if (nextRange && settlement.population >= nextRange[0] && settlement.prosperity >= 50) {
          settlement.type = nextType
          settlement.yearsInCurrentTier = 0
        }
      }
    }

    // 同步回 state
    if (this.state.playerSettlement) {
      const updated = allSettlements.find((s) => s.id === this.state.playerSettlement!.id)
      if (updated) this.state.playerSettlement = updated
    }
    this.state.worldSettlements = allSettlements.filter((s) => s.id !== this.state.playerSettlement?.id)
  }

  // ─── 领域方法 ───

  getPlayerSettlement(): Settlement | null {
    return this.state.playerSettlement
  }

  getAllSettlements(): Settlement[] {
    return this.state.playerSettlement
      ? [this.state.playerSettlement, ...this.state.worldSettlements]
      : this.state.worldSettlements
  }

  /** 获取当前等级的标签+叙事提示 */
  getCurrentTierInfo(): { label: string; hint: string } {
    if (!this.state.playerSettlement) return { label: '无定居地', hint: '' }
    return this._getTierData(this.state.playerSettlement.type)
  }

  formatForPrompt(): string {
    const ps = this.state.playerSettlement
    if (!ps) return '无定居地'

    const tierInfo = this._getTierData(ps.type)
    const lines = [
      `定居地【${tierInfo.label}】（${ps.region}）`,
      `人口：${ps.population}，繁荣：${ps.prosperity}，安全：${ps.safety}`,
      `已居${ps.yearsInCurrentTier}年，迁居共${this.state.totalRelocations}次`,
    ]
    if (tierInfo.hint) {
      lines.push(`事件倾向：${tierInfo.hint}`)
    }
    return lines.join('\n')
  }

  private getSummaryText(): string {
    const ps = this.state.playerSettlement
    if (!ps) {
      return `【${this.label}】无定居地`
    }
    const tierInfo = this._getTierData(ps.type)
    const locationParts = [
      ps.region ? ps.region : null,
      ps.coordinates ? `坐标(${ps.coordinates.x},${ps.coordinates.y})` : null,
    ].filter(Boolean)
    const locationText = locationParts.length > 0 ? ` · ${locationParts.join(' · ')}` : ''
    return `【${this.label}】${ps.name}（${tierInfo.label}）${locationText} · 人口：${ps.population} · 繁荣：${ps.prosperity} · 安全：${ps.safety} · 已居${ps.yearsInCurrentTier}年`
  }

  /** 将玩家定居点绑定到 world-map 区域（Round 2 跨系统修正） */
  private _bindPlayerToWorldMap(context: RoundContext): boolean {
    const ps = this.state.playerSettlement
    if (!ps) return false

    const mapData = context.subsystemStates['world-map']?.data as WorldMapState | undefined
    const regions = mapData?.regions ?? []
    if (regions.length === 0) return false

    let changed = false

    if (!ps.regionId) {
      ps.regionId = this._resolvePlayerRegionId(ps, context, regions)
      changed = true
    }

    const region = regions.find((r) => r.id === ps.regionId)
    if (!region) return changed

    if (ps.region !== region.name) {
      ps.region = region.name
      changed = true
    }

    if (!ps.coordinates) {
      ps.coordinates = { x: region.coordinates.x, y: region.coordinates.y }
      changed = true
    }

    return changed
  }

  private _resolvePlayerRegionId(
    ps: Settlement,
    context: RoundContext,
    regions: WorldMapState['regions'],
  ): string {
    const entityData = context.subsystemStates['world-entity']?.data as
      | { entities?: Array<{ type?: string; name?: string; regionId?: string }> }
      | undefined
    const entityMatch = entityData?.entities?.find(
      (e) => e.type === 'settlement' && e.name === ps.name && e.regionId,
    )
    if (entityMatch?.regionId && regions.some((r) => r.id === entityMatch.regionId)) {
      return entityMatch.regionId
    }

    if (ps.region) {
      const byName = regions.find((r) => r.name === ps.region)
      if (byName) return byName.id
    }

    return regions[0].id
  }

  private _readCoordinates(value: unknown): { x: number; y: number } | undefined {
    if (!value || typeof value !== 'object') return undefined
    const coords = value as Record<string, unknown>
    if (typeof coords.x !== 'number' || typeof coords.y !== 'number') return undefined
    return { x: coords.x, y: coords.y }
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
    this._lastBoundSummary = ''
  }
}
