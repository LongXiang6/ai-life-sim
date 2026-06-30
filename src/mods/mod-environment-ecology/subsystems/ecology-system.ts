/**
 * @module EcologySystem
 * @description 生态系统子系统：生物多样性指数 + 物种种群波动 + 濒危标记 + 灭绝检测 + 入侵物种扩散
 * @mod mod-environment-ecology
 */
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { EcologyState, SpeciesEntry } from '../types'

import {
  WORLDVIEW_SPECIES_POOL,
  ECOLOGY_RANGE,
  BASE_BIODIVERSITY_RECOVERY,
  HABITAT_DAMAGE_FACTOR,
  INVASIVE_SPREAD_PROBABILITY,
  EXTINCTION_THREAT_THRESHOLD,
  EXTINCTION_PROBABILITY,
  EXTINCTION_INDEX_PENALTY,
  EXTINCTION_THREAT_MAX,
  ECOLOGY_PHASE_THRIVING_THRESHOLD,
  ECOLOGY_PHASE_DECLINING_THRESHOLD,
  ECOLOGY_PHASE_COLLAPSE_THRESHOLD,
  ECOLOGY_HEALTH_MODIFIERS,
  OVEREXPLOITATION_WARNING_YEARS,
  EXTERNAL_DISASTER_PENALTY,
  EXTERNAL_POPULATION_PRESSURE_FACTOR,
} from '../constants'
import {
  round,
  clamp,
  pickRandom,
  randomInRange,
} from '../utils'

import { getFormulaModifier, resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

const ECOLOGY_TAG_MAP: AttrTagMap = {
  '生物多样性': 'biodiversityIndex', '生态': 'biodiversityIndex', '多样性': 'biodiversityIndex',
  '恢复力': 'resilience', '韧性': 'resilience',
  '栖息地': 'habitatIntegrity', '生境': 'habitatIntegrity',
  '食物链': 'foodChainStability', '生态链': 'foodChainStability',
}

export class EcologySystem implements ISubSystem {
  readonly id = 'ecology' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '生态' as const
  readonly description = '管理生物多样性指数、物种种群波动、濒危标记、灭绝检测与入侵物种扩散' as const

  private state: EcologyState = this.createInitialState()
  private _lastProcessedRound = -1
  private _worldview = 'default'
  private _overexploitAccumulator = { value: 0 }

  private createInitialState(worldview?: string): EcologyState {
    const wv = resolveStaticPoolWorldviewKey(worldview ?? this._worldview ?? 'default')

    // 按世界观筛选物种池
    const pool = WORLDVIEW_SPECIES_POOL.filter(
      (sp) => sp.compatibleWorldviews.includes(wv),
    )

    // 如果筛选结果为空，兜底用 default 物种池
    const effectivePool = pool.length > 0
      ? pool
      : WORLDVIEW_SPECIES_POOL.filter((sp) => sp.compatibleWorldviews.includes('default'))

    const shuffled = [...effectivePool].sort(() => Math.random() - 0.5)
    const initialSpecies: SpeciesEntry[] = shuffled.slice(0, 8).map((sp) => ({
      name: sp.name,
      category: sp.category,
      rarity: sp.rarity,
      region: sp.region,
      population: randomInRange(50, Math.min(sp.maxPopulation, 200)),
      maxPopulation: sp.maxPopulation,
      extinctionThreat: 0,
      endangered: false,
      role: sp.role,
    }))

    return {
      metrics: {
        biodiversityIndex: 70,
        resilience: 60,
        habitatIntegrity: 80,
        foodChainStability: 65,
      },
      species: initialSpecies,
      invasiveSpecies: [],
      extinctionEvents: [],
      overexploitationYears: 0,
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

    this.updateBiodiversity(context, years)
    this.fluctuateSpeciesPopulations(years)
    this.markEndangered()
    this.checkExtinctions(context.round.year)
    this.checkInvasiveSpread(years)
    this.updateOverexploitation(context, years)

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

    // 设置世界观（用于物种池过滤）
    if (typeof c.setWorldview === 'string') {
      this._worldview = c.setWorldview
    }

    // 推进年份
    if (typeof c.yearsAdvanced === 'number') {
      const years = c.yearsAdvanced as number
      for (let i = 0; i < Math.floor(years); i++) {
        this.updateBiodiversity(_context, 1)
        this.fluctuateSpeciesPopulations(1)
        this.markEndangered()
      }
      const remainder = years - Math.floor(years)
      if (remainder > 0) {
        this.updateBiodiversity(_context, remainder)
        this.fluctuateSpeciesPopulations(remainder)
        this.markEndangered()
      }
    }

    // 添加物种
    if (c.addSpecies && typeof c.addSpecies === 'object') {
      const s = c.addSpecies as Record<string, unknown>
      if (typeof s.name === 'string') {
        const existing = this.state.species.find((sp) => sp.name === s.name)
        if (!existing) {
          this.state.species = [...this.state.species, {
            name: s.name,
            category: (typeof s.category === 'string' ? s.category : 'animal') as SpeciesEntry['category'],
            rarity: (typeof s.rarity === 'string' ? s.rarity : 'common') as SpeciesEntry['rarity'],
            region: typeof s.region === 'string' ? s.region : '未知区域',
            population: typeof s.population === 'number' ? s.population : 100,
            maxPopulation: typeof s.maxPopulation === 'number' ? s.maxPopulation : 500,
            extinctionThreat: typeof s.extinctionThreat === 'number' ? s.extinctionThreat : 0,
            endangered: false,
            role: (typeof s.role === 'string' ? s.role : 'producer') as SpeciesEntry['role'],
          },]
        }
      }
    }

    // 移除物种
    if (c.removeSpecies && typeof c.removeSpecies === 'string') {
      this.state.species = this.state.species.filter((sp) => sp.name !== c.removeSpecies)
      if (!this.state.extinctionEvents.includes(c.removeSpecies as string)) {
        this.state.extinctionEvents = [...this.state.extinctionEvents, c.removeSpecies as string]
      }
    }

    // 直接设置生态指标
    if (c.metrics && typeof c.metrics === 'object' && !Array.isArray(c.metrics)) {
      const m = c.metrics as Record<string, unknown>
      if (typeof m.biodiversityIndex === 'number') {
        this.state.metrics.biodiversityIndex = clamp(m.biodiversityIndex, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
      }
      if (typeof m.resilience === 'number') {
        this.state.metrics.resilience = clamp(m.resilience, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
      }
      if (typeof m.habitatIntegrity === 'number') {
        this.state.metrics.habitatIntegrity = clamp(m.habitatIntegrity, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
      }
      if (typeof m.foodChainStability === 'number') {
        this.state.metrics.foodChainStability = clamp(m.foodChainStability, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
      }
    }

    // P2 降级：AI JSON 未显式声明生态变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || c.addSpecies || c.removeSpecies || c.metrics
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, ECOLOGY_TAG_MAP)
      if (extracted) {
        if (typeof extracted.biodiversityIndex === 'number') {
          this.state.metrics.biodiversityIndex = clamp(this.state.metrics.biodiversityIndex + extracted.biodiversityIndex, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
        }
        if (typeof extracted.resilience === 'number') {
          this.state.metrics.resilience = clamp(this.state.metrics.resilience + extracted.resilience, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
        }
        if (typeof extracted.habitatIntegrity === 'number') {
          this.state.metrics.habitatIntegrity = clamp(this.state.metrics.habitatIntegrity + extracted.habitatIntegrity, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
        }
        if (typeof extracted.foodChainStability === 'number') {
          this.state.metrics.foodChainStability = clamp(this.state.metrics.foodChainStability + extracted.foodChainStability, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max)
        }
      }
    }
  }

  // ─── 内部推进逻辑 ───

  private updateBiodiversity(context: RoundContext | undefined, years: number): void {
    const scale = years
    const noise = (Math.random() - 0.5) * 6 * scale
    const recovery = BASE_BIODIVERSITY_RECOVERY * getFormulaModifier('ecologyRecoveryModifier') * (1 - this.state.metrics.biodiversityIndex / 100) * scale
    // 栖息地破坏影响
    const habitatPenalty = (100 - this.state.metrics.habitatIntegrity) * HABITAT_DAMAGE_FACTOR * scale

    // 外部因素：灾害惩罚
    let disasterPenalty = 0
    if (context?.subsystemStates?.['climate']) {
      const climateData = context.subsystemStates['climate'].data as Record<string, unknown>
      const disasters = climateData?.activeDisasters as unknown[] | undefined
      if (disasters?.length) {
        disasterPenalty = disasters.length * EXTERNAL_DISASTER_PENALTY * scale
      }
    }

    // 外部因素：人口压力
    let populationPressure = 0
    if (context?.subsystemStates?.['population']) {
      const popData = context.subsystemStates['population'].data as Record<string, unknown>
      const pop = popData?.totalPopulation as number | undefined
      if (typeof pop === 'number' && pop > 50000) {
        populationPressure = (pop - 50000) / 10000 * EXTERNAL_POPULATION_PRESSURE_FACTOR * scale
      }
    }

    this.state.metrics.biodiversityIndex = round(
      clamp(
        this.state.metrics.biodiversityIndex + noise + recovery - habitatPenalty - disasterPenalty - populationPressure,
        ECOLOGY_RANGE.min,
        ECOLOGY_RANGE.max,
      ),
    )

    // 恢复力、栖息地完整度、食物链稳定性的微小波动（也受外部因素影响）
    const externalStress = disasterPenalty + populationPressure
    this.state.metrics.resilience = round(
      clamp(this.state.metrics.resilience + ((Math.random() - 0.5) * 2 - externalStress * 0.3) * scale, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max),
    )
    this.state.metrics.foodChainStability = round(
      clamp(this.state.metrics.foodChainStability + ((Math.random() - 0.5) * 2 - externalStress * 0.2) * scale, ECOLOGY_RANGE.min, ECOLOGY_RANGE.max),
    )
  }

  private updateOverexploitation(context: RoundContext, years: number): void {
    let totalPop = 0
    if (context.subsystemStates?.['population']) {
      const popData = context.subsystemStates['population'].data as Record<string, unknown>
      const pop = popData?.totalPopulation as number | undefined
      if (typeof pop === 'number') {
        totalPop = pop
      }
    }
    if (totalPop === 0 && context.subsystemStates?.['population']?.summary) {
      const match = context.subsystemStates['population'].summary.match(/(\d+)/)
      if (match) totalPop = parseInt(match[1], 10)
    }

    if (totalPop > 50000) {
      this._overexploitAccumulator.value += years
      while (this._overexploitAccumulator.value >= 1) {
        this.state.overexploitationYears++
        this._overexploitAccumulator.value -= 1
      }
    } else if (this.state.overexploitationYears > 0) {
      this._overexploitAccumulator.value -= years
      while (this._overexploitAccumulator.value <= -1 && this.state.overexploitationYears > 0) {
        this.state.overexploitationYears--
        this._overexploitAccumulator.value += 1
      }
    }
  }

  /** 获取生态总体阶段评估 */
  getEcosystemPhase(): 'thriving' | 'stable' | 'declining' | 'collapse' {
    const m = this.state.metrics
    if (m.biodiversityIndex >= ECOLOGY_PHASE_THRIVING_THRESHOLD &&
        m.foodChainStability >= ECOLOGY_PHASE_THRIVING_THRESHOLD &&
        m.habitatIntegrity >= ECOLOGY_PHASE_THRIVING_THRESHOLD) {
      return 'thriving'
    }
    if (m.biodiversityIndex <= ECOLOGY_PHASE_COLLAPSE_THRESHOLD &&
        m.foodChainStability <= ECOLOGY_PHASE_COLLAPSE_THRESHOLD) {
      return 'collapse'
    }
    if (m.biodiversityIndex <= ECOLOGY_PHASE_DECLINING_THRESHOLD ||
        m.foodChainStability <= ECOLOGY_PHASE_DECLINING_THRESHOLD) {
      return 'declining'
    }
    return 'stable'
  }

  /** 获取生态健康修正值（供人口/医疗等子系统消费） */
  getEcosystemHealthModifier(): number {
    return ECOLOGY_HEALTH_MODIFIERS[this.getEcosystemPhase()] ?? 0
  }

  private fluctuateSpeciesPopulations(years: number): void {
    this.state.species = this.state.species.map((sp) => {
      const change = Math.floor(sp.population * (Math.random() - 0.45) * 0.2 * years)
      let newPop = sp.population + change
      let threat = sp.extinctionThreat

      if (sp.endangered) {
        newPop += Math.floor(Math.random() * 3 * years)
      }

      // 灭绝威胁累积：种群过少时威胁上升，种群健康时威胁缓慢衰减
      if (newPop < sp.maxPopulation * 0.1) {
        threat = Math.min(EXTINCTION_THREAT_MAX, threat + randomInRange(1, 3))
      } else if (newPop > sp.maxPopulation * 0.3) {
        threat = Math.max(0, threat - 1)
      }

      newPop = clamp(newPop, 0, sp.maxPopulation)
      return { ...sp, population: newPop, extinctionThreat: threat }
    })
  }

  private markEndangered(): void {
    this.state.species = this.state.species.map((sp) => ({
      ...sp,
      endangered: sp.population < 50,
    }))
  }

  private checkExtinctions(year: number): void {
    const newlyExtinct: string[] = []

    this.state.species = this.state.species.map((sp) => {
      if (sp.population <= 0) {
        newlyExtinct.push(sp.name)
        return undefined as unknown as SpeciesEntry // 标记待移除
      }

      // 灭绝威胁超过阈值时，有概率灭绝
      if (sp.extinctionThreat >= EXTINCTION_THREAT_THRESHOLD && Math.random() < EXTINCTION_PROBABILITY) {
        newlyExtinct.push(sp.name)
        return undefined as unknown as SpeciesEntry
      }

      return sp
    }).filter(Boolean)

    if (newlyExtinct.length > 0) {
      this.state.extinctionEvents = [
        ...this.state.extinctionEvents,
        ...newlyExtinct.map((name) => `${name}(${year}年)`),
      ]
      // 每次灭绝，生物多样性指数下降
      this.state.metrics.biodiversityIndex = round(
        clamp(
          this.state.metrics.biodiversityIndex - newlyExtinct.length * EXTINCTION_INDEX_PENALTY,
          ECOLOGY_RANGE.min,
          ECOLOGY_RANGE.max,
        ),
      )
    }
  }

  private checkInvasiveSpread(years: number): void {
    const stepProbability = 1 - Math.pow(1 - INVASIVE_SPREAD_PROBABILITY, years)
    if (Math.random() >= stepProbability) return

    // 从物种池中随机选取一个当前不在物种列表中的物种作为入侵物种
    const existingNames = new Set(this.state.species.map((s) => s.name))
    const candidates = WORLDVIEW_SPECIES_POOL.filter((sp) => !existingNames.has(sp.name))
    if (candidates.length === 0) return

    const invader = pickRandom(candidates)
    this.state.species = [...this.state.species, {
      name: invader.name,
      category: invader.category,
      rarity: invader.rarity,
      region: invader.region,
      population: randomInRange(20, 80),
      maxPopulation: invader.maxPopulation,
      extinctionThreat: 0,
      endangered: false,
      role: invader.role,
    },]

    if (!this.state.invasiveSpecies.includes(invader.name)) {
      this.state.invasiveSpecies = [...this.state.invasiveSpecies, invader.name]
    }
  }

  // ─── 领域方法 ───

  /** 获取生物多样性指数 */
  getBiodiversityIndex(): number {
    return this.state.metrics.biodiversityIndex
  }

  /** 获取物种列表 */
  getSpecies(): SpeciesEntry[] {
    return this.state.species
  }

  /** 生成 AI Prompt 可消费的生态叙事文本 */
  formatEcologyForPrompt(): string {
    const m = this.state.metrics
    const phase = this.getEcosystemPhase()
    const phaseLabels: Record<string, string> = { thriving: '生机盎然', stable: '稳定', declining: '衰退', collapse: '崩溃' }
    const phaseLabel = phaseLabels[phase] ?? '未知'

    const lines: string[] = [
      `【生态阶段】${phaseLabel} | 生物多样性 ${m.biodiversityIndex.toFixed(0)}/100 · 恢复力 ${m.resilience.toFixed(0)} · 栖息地 ${m.habitatIntegrity.toFixed(0)} · 食物链 ${m.foodChainStability.toFixed(0)}`,
    ]

    // 过度开发警告
    if (this.state.overexploitationYears >= OVEREXPLOITATION_WARNING_YEARS) {
      lines.push(`⚠️过度开发警告：持续${this.state.overexploitationYears}年`)
    }

    // 物种详情
    const speciesLines = this.state.species.map((sp) => {
      const rarityLabel: Record<string, string> = { common: '普通', uncommon: '精良', rare: '珍稀', legendary: '传说' }
      const catLabel: Record<string, string> = { plant: '植物', animal: '动物', monster: '魔物', spirit: '灵兽', alien: '异形', mutant: '变异' }
      const rl = rarityLabel[sp.rarity] ?? sp.rarity
      const cl = catLabel[sp.category] ?? sp.category
      const threatText = sp.extinctionThreat >= 80 ? ` ⚠威胁${sp.extinctionThreat}` : ''
      const dangerText = sp.endangered ? ' [濒危]' : ''
      return `  ${sp.name}(${cl},${rl}):${sp.population}/${sp.maxPopulation}只${threatText}${dangerText}`
    })
    lines.push(`【物种列表】共${this.state.species.length}种`)
    lines.push(...speciesLines)

    // 入侵物种
    if (this.state.invasiveSpecies.length > 0) {
      lines.push(`【入侵物种】${this.state.invasiveSpecies.join('、')}`)
    }

    // 灭绝记录
    if (this.state.extinctionEvents.length > 0) {
      const recent = this.state.extinctionEvents.slice(-5)
      lines.push(`【灭绝事件】${recent.join('、')}`)
    }

    return lines.join('\n')
  }

  private getSummaryText(): string {
    const biodiv = this.state.metrics.biodiversityIndex.toFixed(0)
    const speciesCount = this.state.species.length
    const endangered = this.state.species.filter((s) => s.endangered).length
    const invasive = this.state.invasiveSpecies.length
    const phase = this.getEcosystemPhase()
    const phaseLabels: Record<string, string> = { thriving: '生机勃勃', stable: '稳定', declining: '衰退中', collapse: '崩溃' }
    const phaseLabel = phaseLabels[phase] ?? ''
    let text = `【${this.label}】${phaseLabel} · 生物多样性 ${biodiv} · 物种 ${speciesCount}种 · 濒危 ${endangered} · 入侵 ${invasive}`
    if (this.state.overexploitationYears >= OVEREXPLOITATION_WARNING_YEARS) {
      text += ` · ⚠过度开发${this.state.overexploitationYears}年`
    }
    return text
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
