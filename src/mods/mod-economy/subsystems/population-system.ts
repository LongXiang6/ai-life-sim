/**
 * @module PopulationSystem
 * @description 人口系统：人口增长（出生-死亡）+ 种族构成变化 + 人口流动迁移 + 城镇化进程
 * @mod mod-economy
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { PopulationState, PopulationRace, RacePoolEntry } from '../types'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

import {
  INITIAL_POPULATION,
  BASE_BIRTH_RATE,
  BASE_DEATH_RATE,
  MAX_MIGRATION_AMOUNT,
  WORLDVIEW_RACE_POOLS,
  DEFAULT_RACE_POOL,
  RACE_INTEGRATION_CHANGE_RATE,
  RACE_TENSION_DECAY_RATE,
  RACE_TENSION_RIOT_THRESHOLD,
  POPULATION_TREND_THRESHOLD,
  MOBILITY_URBAN_WEIGHT,
  MOBILITY_BASE,
  round,
  clamp,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const POPULATION_TAG_MAP: AttrTagMap = {
  '人口': 'totalPopulation', '居民': 'totalPopulation', '移民': 'totalPopulation', '住民': 'totalPopulation',
  '出生率': 'birthRate', '死亡率': 'deathRate',
  '城镇化': 'urbanizationRate', '城市化': 'urbanizationRate', '城镇率': 'urbanizationRate',
}

/** 战争关联的冲突阶段 */
const WAR_PHASES = new Set(['escalation', 'crisis', 'climax'])

/** 繁荣关联的市场阶段 */
const PROSPERITY_PHASES = new Set(['boom'])

export class PopulationSystem implements ISubSystem {
  readonly id = 'population' as const
  readonly mod = 'mod-economy' as const
  readonly label = '人口' as const
  readonly description = '管理总人口增长、种族构成变化、人口流动迁移与城镇化进程' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1
  /** 趋势追踪用年量累积 */
  private _trendYearAccumulator = 0

  private createInitialState(): PopulationState {
    return {
      totalPopulation: INITIAL_POPULATION,
      races: this._buildRacePool('historical'),
      birthRate: BASE_BIRTH_RATE,
      deathRate: BASE_DEATH_RATE,
      growthRate: BASE_BIRTH_RATE - BASE_DEATH_RATE,
      migrations: [],
      urbanizationRate: 0.1,
      mobilityIndex: 0.1,
      consecutiveGrowthYears: 0,
      consecutiveDeclineYears: 0,
      recentPopulationEvents: [],
    }
  }

  /** 用世界观种族池初始化种族 */
  private _buildRacePool(worldview: string): PopulationRace[] {
    const poolKey = resolveStaticPoolWorldviewKey(worldview)
    const pool = WORLDVIEW_RACE_POOLS[poolKey] ?? DEFAULT_RACE_POOL
    const totalWeight = pool.reduce((s, r) => s + r.weight, 0)
    if (totalWeight <= 0) {
      return [{ name: '人族', ratio: 1, growthRate: BASE_BIRTH_RATE - BASE_DEATH_RATE, integration: 100, tension: 0 }]
    }
    return pool.map((r: RacePoolEntry) => ({
      name: r.name,
      ratio: r.weight / totalWeight,
      growthRate: r.growthRate,
      integration: 70,
      tension: 10,
    }))
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
    this.advancePopulation(context)
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

    if (c.adaptationType === 'population-init' && typeof c.worldview === 'string') {
      const worldview = c.worldview as string
      this.state.races = this._buildRacePool(worldview)
      // 总人口按首种种族比例缩放
      if (this.state.races.length > 0) {
        this.state.totalPopulation = Math.floor(INITIAL_POPULATION * this.state.races[0].ratio)
      }
      return
    }

    if (typeof c.totalPopulation === 'number') {
      this.state.totalPopulation = clamp(Math.floor(c.totalPopulation as number), 0, Infinity)
    }
    if (typeof c.populationDelta === 'number') {
      this.state.totalPopulation = clamp(Math.floor(this.state.totalPopulation + c.populationDelta), 0, Infinity)
    }
    if (typeof c.growthRate === 'number') {
      this.state.growthRate = c.growthRate as number
    }
    if (typeof c.migrationInflow === 'number') {
      this.state.migrations.unshift({
        from: '跨域联动',
        to: '本地',
        amount: clamp(Math.floor(c.migrationInflow as number), 0, Infinity),
        reason: '难民涌入',
      })
      this.state.migrations = this.state.migrations.slice(0, 5)
    }
    if (typeof c.birthRate === 'number') {
      this.state.birthRate = clamp(c.birthRate as number, 0, 0.1)
    }
    if (typeof c.deathRate === 'number') {
      this.state.deathRate = clamp(c.deathRate as number, 0, 0.1)
    }
    if (typeof c.urbanizationRate === 'number') {
      this.state.urbanizationRate = clamp(c.urbanizationRate as number, 0, 1)
    }
    if (Array.isArray(c.races)) {
      const newRaces = (c.races as unknown[]).filter(
        (r): r is Record<string, unknown> =>
          r !== null && typeof r === 'object' && typeof (r as Record<string, unknown>).name === 'string',
      )
      if (newRaces.length > 0) {
        this.state.races = newRaces.map((r: Record<string, unknown>) => ({
          name: r.name as string,
          ratio: clamp(typeof r.ratio === 'number' ? r.ratio : 0, 0, 1),
          growthRate: round(typeof r.growthRate === 'number' ? r.growthRate : 0, 6),
          integration: clamp(typeof r.integration === 'number' ? r.integration : 50, 0, 100),
          tension: clamp(typeof r.tension === 'number' ? r.tension : 10, 0, 100),
        }))
      }
    }

    // P2 降级：AI JSON 未显式声明人口变化时，从 description 中补偿提取
    const hasExplicit = typeof c.totalPopulation === 'number' || typeof c.birthRate === 'number' ||
      typeof c.deathRate === 'number' || typeof c.urbanizationRate === 'number' || Array.isArray(c.races)
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, POPULATION_TAG_MAP)
      if (extracted) {
        if (typeof extracted.totalPopulation === 'number') {
          this.state.totalPopulation = clamp(Math.floor(this.state.totalPopulation + extracted.totalPopulation), 0, Infinity)
        }
        if (typeof extracted.birthRate === 'number') {
          this.state.birthRate = clamp(this.state.birthRate + extracted.birthRate, 0, 0.1)
        }
        if (typeof extracted.deathRate === 'number') {
          this.state.deathRate = clamp(this.state.deathRate + extracted.deathRate, 0, 0.1)
        }
        if (typeof extracted.urbanizationRate === 'number') {
          this.state.urbanizationRate = clamp(this.state.urbanizationRate + extracted.urbanizationRate, 0, 1)
        }
      }
    }
  }

  // ─── 内部推进逻辑 ───

  private advancePopulation(context: RoundContext): void {
    const years = getAgeYearsDelta(context)
    if (years <= 0) return

    const { totalPopulation, birthRate, deathRate } = this.state

    // ── 读取外部因果链：战争/繁荣度 → 人口增长 ──
    const warActive = this._detectWar(context)
    const prosperityActive = this._detectProsperity(context)

    // 战争惩罚
    const warPenalty = warActive ? -0.04 : 0
    // 繁荣度奖励
    const prosperityBonus = prosperityActive ? 0.02 : 0

    // 综合出生率（基础出生率 + 外部因素修正 + 世界校准）
    const birthMod = getFormulaModifier('birthRateModifier')
    const deathMod = getFormulaModifier('deathRateModifier')
    const effectiveBirthRate = clamp(birthRate * birthMod + prosperityBonus, 0, 0.1)
    // 综合死亡率（基础死亡率 + 战争惩罚 + 世界校准）
    const effectiveDeathRate = clamp(deathRate * deathMod + Math.abs(warPenalty), 0, 0.1)

    // 人口自然增长 = 出生 - 死亡（按模拟年数缩放）
    const births = totalPopulation * effectiveBirthRate * years
    const deaths = totalPopulation * effectiveDeathRate * years
    const naturalGrowth = births - deaths

    this.state.totalPopulation = clamp(Math.floor(totalPopulation + naturalGrowth), 0, Infinity)
    this.state.growthRate = totalPopulation > 0
      ? round(naturalGrowth / totalPopulation, 6)
      : 0

    // 出生率/死亡率微小漂移
    this.state.birthRate = round(effectiveBirthRate + (Math.random() - 0.5) * 0.002 * years, 6)
    this.state.deathRate = round(effectiveDeathRate + (Math.random() - 0.5) * 0.001 * years, 6)
    this.state.birthRate = clamp(this.state.birthRate, 0, 0.1)
    this.state.deathRate = clamp(this.state.deathRate, 0, 0.1)

    // ── 种族构成 + 融合度/紧张度 ──
    const races = this.state.races
    const minorityRatio = races.length > 1 ? races.slice(1).reduce((s, r) => s + r.ratio, 0) : 0
    for (const race of races) {
      // 占比漂移
      const ratioShift = ((Math.random() - 0.5) * 0.01 + this.state.growthRate * 0.5) * years
      race.ratio = round(clamp(race.ratio + ratioShift, 0, 1), 4)
      race.growthRate = round(race.growthRate + (Math.random() - 0.5) * 0.002 * years, 6)

      // 融合度：非主体种族受 minorityRatio 影响
      if (minorityRatio > 0.1) {
        race.integration = clamp(
          race.integration + (Math.random() - 0.5) * RACE_INTEGRATION_CHANGE_RATE + (!warActive ? 0.2 : -0.3),
          0, 100,
        )
        // 紧张度：低融合 + 高比例 → 紧张上升
        const tensionBase = race.integration < 30 ? 0.5 : -0.3
        const minorityPressure = race.ratio > 0.3 && race.integration < 50 ? 0.5 : 0
        race.tension = clamp(
          race.tension + tensionBase + minorityPressure + (warActive ? 0.5 : 0),
          0, 100,
        )
      } else {
        // 单族裔为主：融合度趋近 100，紧张度趋近 0
        race.integration = clamp(race.integration + 1, 0, 100)
        race.tension = clamp(race.tension - RACE_TENSION_DECAY_RATE, 0, 100)
      }
    }

    // 规一化比例
    this._normalizeRatios()

    // ── 城镇化缓慢推进 ──
    const urbanizationShift = (Math.random() - 0.5) * 0.005 * years
    this.state.urbanizationRate = round(
      clamp(this.state.urbanizationRate + urbanizationShift, 0, 1),
      4,
    )

    // ── 流动性指数 ──
    this.state.mobilityIndex = round(
      clamp(MOBILITY_BASE + this.state.urbanizationRate * MOBILITY_URBAN_WEIGHT, 0.05, 1),
      4,
    )

    // ── 人口流动（吸引力模型） ──
    this._advanceMigrationFlow(context)

    // ── 连续趋势事件追踪（按模拟年累积） ──
    this._trendYearAccumulator += years
    while (this._trendYearAccumulator >= 1) {
      this._trackPopulationTrends(context)
      this._trendYearAccumulator -= 1
    }

    // 天象跨域效果
    this._applyCelestialPopulationEffect(context)
  }

  /** 检测冲突周期 → 是否处于战争状态 */
  private _detectWar(context: RoundContext): boolean {
    const conflict = context.subsystemStates?.['conflict-cycle']
    if (!conflict?.data) return false
    const data = conflict.data as Record<string, unknown>
    const phase = data.currentPhase as string | undefined
    return phase !== undefined && WAR_PHASES.has(phase)
  }

  /** 检测经济系统 → 是否繁荣期 */
  private _detectProsperity(context: RoundContext): boolean {
    const economy = context.subsystemStates?.['economy']
    if (!economy?.data) return false
    const data = economy.data as Record<string, unknown>
    const phase = data.marketPhase as string | undefined
    return phase !== undefined && PROSPERITY_PHASES.has(phase)
  }

  /** 规一化种族比例（总和=1） */
  private _normalizeRatios(): void {
    const total = this.state.races.reduce((s, r) => s + r.ratio, 0)
    if (total > 0) {
      for (const race of this.state.races) {
        race.ratio = round(race.ratio / total, 4)
      }
    }
  }

  /** 追踪连续增长/衰减趋势 → 触发事件 */
  private _trackPopulationTrends(_context: RoundContext): void {
    const growthRate = this.state.growthRate
    const events = this.state.recentPopulationEvents

    if (growthRate > 0) {
      this.state.consecutiveGrowthYears++
      this.state.consecutiveDeclineYears = 0
    } else if (growthRate < 0) {
      this.state.consecutiveDeclineYears++
      this.state.consecutiveGrowthYears = 0
    } else {
      this.state.consecutiveGrowthYears = 0
      this.state.consecutiveDeclineYears = 0
    }

    if (this.state.consecutiveGrowthYears === POPULATION_TREND_THRESHOLD) {
      events.push(`连续${POPULATION_TREND_THRESHOLD}年人口增长：劳动力红利`)
    } else if (this.state.consecutiveDeclineYears === POPULATION_TREND_THRESHOLD) {
      events.push(`连续${POPULATION_TREND_THRESHOLD}年人口下降：劳动力短缺`)
    }

    // 紧张度触发冲突预警
    for (const race of this.state.races) {
      if (race.tension >= RACE_TENSION_RIOT_THRESHOLD && race.ratio > 0.05) {
        events.push(`【紧张】${race.name}社会紧张度已达${Math.round(race.tension)}，存在冲突风险`)
      }
    }

    // 保持最近 5 条
    if (events.length > 5) {
      this.state.recentPopulationEvents = events.slice(-5)
    }
  }

  // ─── 领域方法 ───

  getTotalPopulation(): number {
    return this.state.totalPopulation
  }

  getGrowthRate(): number {
    return this.state.growthRate
  }

  getUrbanizationRate(): number {
    return this.state.urbanizationRate
  }

  formatForPrompt(): string {
    const { totalPopulation, birthRate, deathRate, growthRate, urbanizationRate, mobilityIndex, races, migrations } = this.state
    const raceParts = races.map((r) => {
      let info = `${r.name}(${Math.round(r.ratio * 100)}%)`
      if (r.integration < 40) info += `[融合度低]`
      if (r.tension > 40) info += `[紧张${Math.round(r.tension)}]`
      return info
    }).join('、')
    const mobilityLabel = mobilityIndex <= 0.03 ? '低' : mobilityIndex <= 0.07 ? '中' : '高'
    const lines = [
      `总人口：${totalPopulation.toLocaleString()}`,
      `出生率${(birthRate * 100).toFixed(1)}%，死亡率${(deathRate * 100).toFixed(1)}%`,
      `增长率${(growthRate * 100).toFixed(2)}%，城镇化${(urbanizationRate * 100).toFixed(1)}%`,
      `流动性指数：${mobilityIndex.toFixed(3)}（${mobilityLabel}）`,
      `种族构成：${raceParts}`,
    ]
    if (migrations.length > 0) {
      const topFlow = migrations[0]
      lines.push(`主要迁移：${topFlow.from}→${topFlow.to}（${topFlow.reason}）`)
    }
    return lines.join('\n')
  }

  private getSummaryText(): string {
    const popStr = this.state.totalPopulation >= 10000
      ? `${(this.state.totalPopulation / 10000).toFixed(1)}万`
      : `${this.state.totalPopulation}`
    const growthPercent = (this.state.growthRate * 100).toFixed(2)
    const raceInfo = this.state.races.length > 1
      ? ` ${this.state.races.length}种族`
      : ''
    return `【${this.label}】总人口：${popStr}，增长率：${growthPercent}%${raceInfo}`
  }

  /** 读取天象跨域效果 → 应用于人口 */
  private _applyCelestialPopulationEffect(context: RoundContext): void {
    const celestial = context.subsystemStates['celestial']
    if (!celestial?.data) return
    const data = celestial.data as Record<string, unknown>
    const crossEffects = data.crossEffects as Array<{ targetSystem: string; effectType: string; value: number }> | undefined
    if (!crossEffects || !Array.isArray(crossEffects)) return

    for (const effect of crossEffects) {
      if (effect.targetSystem !== 'population') continue

      if (effect.effectType === 'population_growth') {
        const increase = Math.floor(this.state.totalPopulation * (effect.value / 100))
        this.state.totalPopulation = clamp(this.state.totalPopulation + increase, 0, Infinity)
      } else if (effect.effectType === 'population_decline') {
        const decrease = Math.floor(this.state.totalPopulation * (Math.abs(effect.value) / 100))
        this.state.totalPopulation = clamp(this.state.totalPopulation - decrease, 0, Infinity)
      }
    }
  }

  // ─── 人口流动模型 ───

  /** 虚拟区域 ID */
  private static readonly REGION_IDS = ['rural', 'urban', 'north', 'south', 'border', 'inland'] as const

  /** 区域中文名映射 */
  private static readonly REGION_LABELS: Record<string, string> = {
    rural: '乡村', urban: '城镇', north: '北方', south: '南方', border: '边境', inland: '内地',
  }

  /** 计算指定区域的吸引力指数 */
  private _computeRegionAttractiveness(regionId: string, context: RoundContext): number {
    const urbanization = this.state.urbanizationRate
    const prosperity = this._detectProsperity(context)
    const war = this._detectWar(context)

    const bases: Record<string, number> = {
      urban: 0.4 + urbanization * 0.4 + (prosperity ? 0.15 : 0),
      rural: 0.3 + (1 - urbanization) * 0.2,
      south: 0.35 + (prosperity ? 0.2 : 0) + urbanization * 0.1,
      north: 0.3 + (war ? -0.15 : 0.05),
      border: 0.2 + (war ? -0.15 : 0.1) + urbanization * 0.05,
      inland: 0.3 + urbanization * 0.15 + (war ? 0.05 : 0),
    }
    return clamp(bases[regionId] ?? 0.3, 0, 1)
  }

  /** 推进人口流动：基于区域间吸引力差生成迁移流 */
  private _advanceMigrationFlow(context: RoundContext): void {
    const regionIds = PopulationSystem.REGION_IDS
    const attractiveness: Record<string, number> = {}
    for (const id of regionIds) {
      attractiveness[id] = this._computeRegionAttractiveness(id, context)
    }

    const maxAttract = Math.max(...Object.values(attractiveness))
    if (maxAttract <= 0) return

    // 流动性指数越高迁移越活跃
    const migrationProbability = clamp(
      this.state.mobilityIndex * 0.3 * getFormulaModifier('migrationRateModifier'),
      0.02,
      0.3,
    )
    if (Math.random() >= migrationProbability) return

    const newFlows: Array<{ from: string; to: string; amount: number; reason: string }> = []

    for (const fromId of regionIds) {
      for (const toId of regionIds) {
        if (fromId === toId) continue
        if (attractiveness[toId] <= attractiveness[fromId]) continue

        const diff = attractiveness[toId] - attractiveness[fromId]
        const rawRate = (diff / maxAttract) * this.state.mobilityIndex
        if (rawRate < 0.01) continue

        const amount = Math.max(10, Math.floor(this.state.totalPopulation * rawRate * (0.5 + Math.random())))
        const reason = this._determineMigrationReason(fromId, toId, context)
        newFlows.push({ from: fromId, to: toId, amount, reason })
      }
    }

    if (newFlows.length === 0) return

    newFlows.sort((a, b) => b.amount - a.amount)
    this.state.migrations = [
      ...newFlows.slice(0, 5).map(f => ({
        from: PopulationSystem.REGION_LABELS[f.from] ?? f.from,
        to: PopulationSystem.REGION_LABELS[f.to] ?? f.to,
        amount: clamp(f.amount, 0, MAX_MIGRATION_AMOUNT),
        reason: f.reason,
      })),
      ...this.state.migrations.slice(0, 3),
    ].slice(0, 5)
  }

  /** 判断迁移原因 */
  private _determineMigrationReason(
    fromId: string, toId: string,
    context: RoundContext,
  ): string {
    const war = this._detectWar(context)
    const prosperity = this._detectProsperity(context)
    if (war && (fromId === 'border' || fromId === 'north')) return '战乱避难'
    if (prosperity && (toId === 'urban' || toId === 'south')) return '经济机会'
    if (fromId === 'rural' && toId === 'urban') return '经济机会'
    if (fromId === 'border') return '安全稳定'
    if (fromId === 'north' && toId === 'south') return '气候因素'
    return '发展前景'
  }

  /** 获取流动性指数标签 */
  getMobilityIndexLabel(): string {
    const mi = this.state.mobilityIndex
    if (mi <= 0.03) return '低'
    if (mi <= 0.07) return '中'
    return '高'
  }

  /** 计算净迁移量（正=净流入，负=净流出） */
  getNetMigration(): number {
    const totalFlow = this.state.migrations.reduce((sum, m) => sum + m.amount, 0)
    return Math.floor(totalFlow * (Math.random() - 0.5) * 0.1)
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}