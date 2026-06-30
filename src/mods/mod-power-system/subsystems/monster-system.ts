/**
 * @module MonsterSystem
 * @description 怪物子系统：按世界观初始化种类池 + 区域威胁等级 + 生态演化 + 遭遇判定
 * @mod mod-power-system
 */
import { getRoundSequence, getAgeYearsDelta, consumeSimulationYears } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { MonsterState, MonsterEncounterResult, PopulationThreatDirection } from '../types'

import {
  MONSTER_TYPES_BY_WORLDVIEW,
  DEFAULT_MONSTER_TYPES,
  THREAT_ECOLOGY_PENALTY,
  THREAT_POLLUTION_PENALTY,
  POPULATION_THREAT_MAGNITUDE,
  SPAWN_FREQUENCY_BASE,
  SPAWN_FREQUENCY_MULTIPLIER,
  ECOLOGY_LOW_THRESHOLD,
  POLLUTION_HIGH_THRESHOLD,
  POPULATION_HIGH_THRESHOLD,
  NEW_TYPE_THREAT_THRESHOLD,
  EVOLUTION_CHANCE_BASE,
  MUTANT_MONSTER_CHANCE,
  SPAWN_FREQ_MIN,
  SPAWN_FREQ_MAX,
  THREAT_MIN,
  THREAT_MAX,
} from '../constants'
import { getFormulaModifier, resolveStaticPoolWorldviewKey } from '@/mods/mod-world'
import {
  round,
  clamp,
  pickRandom,
  computeAverage,
} from '../utils'

export class MonsterSystem implements ISubSystem {
  readonly id = 'monster' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '怪物生态' as const
  readonly description = '按世界观管理怪物种类池、区域威胁等级、生态演化与遭遇判定' as const

  private state: MonsterState = this.createInitialState()
  private _lastProcessedRound = -1
  private _simYearAccumulator = { value: 0 }

  private createInitialState(): MonsterState {
    return {
      initialized: false,
      enabled: false,
      regionalThreat: {},
      monsterTypes: [],
      spawnFrequency: 0,
      populationThreatDirection: 'repel' as PopulationThreatDirection,
    }
  }

  collectState(context: RoundContext): SubSystemState {
    const summaryBody = this.getSummaryText()
    const summary = this.state.enabled && summaryBody
      ? `【${this.label}】${summaryBody}`
      : ''

    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary,
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }

    const yearsElapsed = getAgeYearsDelta(context)
    if (yearsElapsed <= 0) {
      return {
        id: this.id,
        summary,
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    const ecology = context.subsystemStates['ecology']?.data as Record<string, unknown> | undefined
    const pollution = context.subsystemStates['pollution']?.data as Record<string, unknown> | undefined
    const population = context.subsystemStates['population']?.data as Record<string, unknown> | undefined
    const regionalThreats = this.computeRegionalThreats(ecology, pollution, population)

    consumeSimulationYears(this._simYearAccumulator, context, () => {
      this.advanceMonsters(regionalThreats)
    })

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

    // ——— AI 适配分支：怪物种类初始化 ———
    if (c.adaptationType === 'monster-types' && c.monsterTypes && Array.isArray(c.monsterTypes)) {
      const types = (c.monsterTypes as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      if (types.length > 0) {
        this.state.monsterTypes = types
        this.state.initialized = true
        this.state.enabled = true
      }
      return
    }

    // ——— 世界观设置（降级路径） ———
    if (typeof c.worldview === 'string') {
      const poolKey = resolveStaticPoolWorldviewKey(c.worldview)
      const types = MONSTER_TYPES_BY_WORLDVIEW[poolKey]
      this.state.monsterTypes = types ? [...types] : [...DEFAULT_MONSTER_TYPES]
      this.state.enabled = this.state.monsterTypes.length > 0
    }

    // ——— 直接设置状态 ———
    if (typeof c.enabled === 'boolean') this.state.enabled = c.enabled
    if (c.regionalThreat && typeof c.regionalThreat === 'object') {
      this.state.regionalThreat = { ...c.regionalThreat } as Record<string, number>
    }
    if (typeof c.spawnFrequency === 'number') {
      this.state.spawnFrequency = clamp(c.spawnFrequency, SPAWN_FREQ_MIN, SPAWN_FREQ_MAX)
    }
    if (c.populationThreatDirection === 'repel' || c.populationThreatDirection === 'attract') {
      this.state.populationThreatDirection = c.populationThreatDirection as PopulationThreatDirection
    }
    if (typeof c.initialized === 'boolean') this.state.initialized = c.initialized
  }

  // ─── 内部推进逻辑 ───

  private computeRegionalThreats(
    ecology?: Record<string, unknown>,
    pollution?: Record<string, unknown>,
    population?: Record<string, unknown>,
  ): Record<string, number> {
    const result: Record<string, number> = {}
    const regionIds = new Set(Object.keys(this.state.regionalThreat))

    if (ecology?.regionalHealth && typeof ecology.regionalHealth === 'object') {
      const eRegions = ecology.regionalHealth as Record<string, unknown>
      for (const id of Object.keys(eRegions)) regionIds.add(id)
    }

    for (const regionId of regionIds) {
      const baseThreat = this.state.regionalThreat[regionId] ?? 0
      let threat = baseThreat

      const ecoHealth = (ecology?.regionalHealth as Record<string, number>)?.[regionId] ?? 50
      if (ecoHealth < ECOLOGY_LOW_THRESHOLD) {
        threat += THREAT_ECOLOGY_PENALTY
      }

      const regionPollution = (pollution?.regionalPollution as Record<string, number>)?.[regionId] ?? 0
      if (regionPollution > POLLUTION_HIGH_THRESHOLD && Math.random() < MUTANT_MONSTER_CHANCE) {
        threat += THREAT_POLLUTION_PENALTY
      }

      const regionPop = (population?.regionalPopulation as Record<string, number>)?.[regionId] ?? 0
      if (regionPop > POPULATION_HIGH_THRESHOLD) {
        const direction = this.state.populationThreatDirection === 'attract' ? +1 : -1
        threat += POPULATION_THREAT_MAGNITUDE * direction
      }

      threat += Math.random() * 6 - 3

      result[regionId] = round(clamp(threat * getFormulaModifier('monsterThreatModifier'), THREAT_MIN, THREAT_MAX))
    }

    return result
  }

  private advanceMonsters(regionalThreats: Record<string, number>): void {
    if (!this.state.enabled) return

    const newRegionalThreat: Record<string, number> = {}
    const regionIds = new Set([
      ...Object.keys(this.state.regionalThreat),
      ...Object.keys(regionalThreats),
    ])

    for (const regionId of regionIds) {
      const baseThreat = regionalThreats[regionId] ?? 0
      const existingThreat = this.state.regionalThreat[regionId] ?? baseThreat
      const threat = existingThreat * 0.7 + baseThreat * 0.3
      newRegionalThreat[regionId] = round(clamp(threat, THREAT_MIN, THREAT_MAX))
    }

    const avgThreat = computeAverage(Object.values(newRegionalThreat))
    const spawnFrequency = round(clamp(
      (SPAWN_FREQUENCY_BASE + avgThreat * SPAWN_FREQUENCY_MULTIPLIER) * getFormulaModifier('monsterSpawnModifier'),
      SPAWN_FREQ_MIN,
      SPAWN_FREQ_MAX,
    ), 3)

    const evolvedTypes = [...this.state.monsterTypes]
    if (avgThreat > NEW_TYPE_THREAT_THRESHOLD && Math.random() < EVOLUTION_CHANCE_BASE) {
      const seedPool = evolvedTypes.length > 0 ? evolvedTypes : [...DEFAULT_MONSTER_TYPES]
      const newType = pickRandom(seedPool) + '（变异）'
      if (!evolvedTypes.includes(newType)) {
        evolvedTypes.push(newType)
      }
    }

    this.state.regionalThreat = newRegionalThreat
    this.state.spawnFrequency = spawnFrequency
    this.state.monsterTypes = evolvedTypes
    this.state.initialized = true
  }

  // ─── 领域方法 ───

  /** 获取区域威胁等级 */
  getRegionalThreat(regionId: string): number {
    return this.state.regionalThreat[regionId] ?? 0
  }

  /** 判定怪物遭遇 */
  rollMonsterEncounter(regionId: string): MonsterEncounterResult {
    if (!this.state.enabled) {
      return { encounter: false, monsterType: '', threatLevel: 0 }
    }

    const regionalThreat = this.getRegionalThreat(regionId)
    const encounterProbability = clamp(regionalThreat / 100, 0, 1)

    if (Math.random() >= encounterProbability) {
      return { encounter: false, monsterType: '', threatLevel: 0 }
    }

    const types = this.state.monsterTypes.length > 0
      ? this.state.monsterTypes
      : [...DEFAULT_MONSTER_TYPES]
    const monsterType = pickRandom(types)
    const threatLevel = round(clamp(
      regionalThreat + Math.random() * 20 - 10,
      THREAT_MIN,
      THREAT_MAX,
    ))

    return { encounter: true, monsterType, threatLevel }
  }

  /** 格式化怪物生态为 AI prompt 文本 */
  formatForPrompt(): string {
    const lines: string[] = []
    lines.push('【怪物生态概况】')
    if (!this.state.enabled) return ''

    if (this.state.monsterTypes.length > 0) {
      lines.push(`活跃怪物种类：${this.state.monsterTypes.join('、')}`)
    }
    lines.push(`怪物刷新频率：${(this.state.spawnFrequency * 100).toFixed(1)}%`)

    const entries = Object.entries(this.state.regionalThreat)
    if (entries.length > 0) {
      const sortedEntries = [...entries].sort((a, b) => b[1] - a[1])
      const topThreats = sortedEntries.slice(0, 3)
      lines.push(`威胁最高区域：${topThreats.map(([id, t]) => `${id}(威胁${t})`).join('、')}`)

      const highThreatCount = sortedEntries.filter(([, t]) => t > NEW_TYPE_THREAT_THRESHOLD).length
      if (highThreatCount > 0) {
        lines.push(`${highThreatCount} 个区域威胁等级超过 ${NEW_TYPE_THREAT_THRESHOLD}，有怪物演化风险`)
      }

      const evolvedTypes = this.state.monsterTypes.filter((t) => t.includes('变异'))
      if (evolvedTypes.length > 0) {
        lines.push(`已演化变异怪物：${evolvedTypes.join('、')}`)
      }

      const avgThreat = computeAverage(Object.values(this.state.regionalThreat))
      if (avgThreat > 70) lines.push('全球怪物威胁等级极高，冒险者请注意安全')
      else if (avgThreat > 40) lines.push('部分地区怪物活动频繁，需加强戒备')
    }

    return lines.join('\n')
  }

  private getSummaryText(): string {
    if (!this.state.enabled) return ''
    const avgThreat = computeAverage(Object.values(this.state.regionalThreat))
    return `种类：${this.state.monsterTypes.length} | 平均威胁：${Math.round(avgThreat)} | 刷新：${(this.state.spawnFrequency * 100).toFixed(1)}%`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
