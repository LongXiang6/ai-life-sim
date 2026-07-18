/**
 * @module CelestialSystem
 * @description 天象子系统 —— 四阶段状态机（normal/auspicious/omen/anomaly）+ 世界观差异化概率 + 运气修正 + AI 天象事件池适配
 *   v2 优化吸收废案设计：getLuckMod() 公共 API、世界观术语适配、formatForPrompt() 叙事接口、概率常量化、
 *   _advance 纯函数拆分、事件稀有度 + 前置条件、天象历史追溯、跨域效果
 * @mod mod-base-universe
 */
import { getRoundSequence } from '@/foundation'
import { clamp } from '@/core/shared'

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import type {
  CelestialState,
  CelestialPhase,
  CelestialEvent,
  CelestialEventPrerequisite,
  CelestialHistoryEntry,
  CelestialCrossEffect,
} from '../types'

import {
  CELESTIAL_EVENT_POOL,
  CELESTIAL_EVENT_POOL_BY_WORLDVIEW,
  CELESTIAL_PHASE_LABELS,
  CELESTIAL_PHASE_LABELS_BY_WORLDVIEW,
  CELESTIAL_LUCK_MODS,
  CELESTIAL_PROBABILITIES,
  CELESTIAL_RARITY_WEIGHTS,
  CELESTIAL_PHASE_DURATION_RANGE,
  CELESTIAL_COOLDOWN_RANGE,
} from '../constants'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

/** _pureAdvance 计算所需的上下文切片 */
interface AdvanceContext {
  worldview: string
  luckBonus: number
  eraYear: number
  phase: CelestialPhase
  phaseDuration: number
  cooldownYears: number
  activeEvents: string[]
  history: CelestialHistoryEntry[]
  eventPool: Record<CelestialPhase, CelestialEvent[]>,
}

/** _pureAdvance 的计算结果 */
interface AdvanceResult {
  newPhase: CelestialPhase
  phaseDuration: number
  cooldownYears: number
  activeEvents: string[]
  history: CelestialHistoryEntry[]
  crossEffects: CelestialCrossEffect[],
}

export class CelestialSystem implements ISubSystem {
  readonly id = 'celestial' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '天象' as const
  readonly description = '管理天象四阶段变化，提供运势修正和事件叙事' as const

  private _state: CelestialState = {
    currentPhase: 'normal',
    phaseDuration: 0,
    cooldownYears: 0,
    lastRollEraYear: 0,
    activeEvents: [],
    history: [],
    crossEffects: [],
  }

  private _lastProcessedRound = -1

  /** 内部事件池（可被 AI 适配覆盖） */
  private _eventPool: Record<CelestialPhase, CelestialEvent[]> = CELESTIAL_EVENT_POOL

  // ============================================================
  // ISubSystem 接口
  // ============================================================

  collectState(context: RoundContext): SubSystemState {
    // round-idempotent 守卫
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this._buildSummary(context),
        data: structuredClone(this._state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    this._advance(context)

    return {
      id: this.id,
      summary: this._buildSummary(context),
      data: structuredClone(this._state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
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

    // AI 接触点：天象事件池适配
    if (c.adaptationType === 'celestial-events' && typeof c.worldSetting === 'object' && c.worldSetting !== null) {
      const ws = c.worldSetting as Record<string, unknown>
      const worldview = typeof ws.worldview === 'string' ? ws.worldview : 'default'
      const poolKey = resolveStaticPoolWorldviewKey(worldview)
      if (CELESTIAL_EVENT_POOL_BY_WORLDVIEW[poolKey]) {
        this._eventPool = CELESTIAL_EVENT_POOL_BY_WORLDVIEW[poolKey]
      } else {
        this._eventPool = CELESTIAL_EVENT_POOL
      }
    }

    // 直接控制：阶段覆盖
    if (typeof c.phaseOverride === 'string') {
      this._state.currentPhase = c.phaseOverride as CelestialPhase
    }
    if (typeof c.phaseDuration === 'number') {
      this._state.phaseDuration = c.phaseDuration
    }
    if (typeof c.cooldownYears === 'number') {
      this._state.cooldownYears = c.cooldownYears
    }
    if (c.triggerBlessing === true) {
      this._state.currentPhase = 'auspicious'
      this._state.phaseDuration = 0
      if (!this._state.activeEvents.includes('天选祝福')) {
        this._state.activeEvents.push('天选祝福')
      }
    }
  }

  reset(): void {
    this._state = {
      currentPhase: 'normal',
      phaseDuration: 0,
      cooldownYears: 0,
      lastRollEraYear: 0,
      activeEvents: [],
      history: [],
      crossEffects: [],
    }
    this._lastProcessedRound = -1
    this._eventPool = CELESTIAL_EVENT_POOL
  }

  // ============================================================
  // 公共 API（P0: getLuckMod / P1: formatForPrompt）
  // ============================================================

  /** 获取当前天象对应的运势修正值（P0-1） */
  getLuckMod(): number {
    return CELESTIAL_LUCK_MODS[this._state.currentPhase] ?? 0
  }

  /** 获取叙事风格的 AI 可消费天象文本（P1-1） */
  formatForPrompt(context?: RoundContext): string {
    const phase = this._state.currentPhase
    const worldview = context ? this._getWorldview(context) : 'default'
    const label = this._getPhaseLabel(phase, worldview)

    if (phase === 'normal') {
      return `天穹之上，星辰运转如常，一切平稳无波。`
    }

    const events = this._state.activeEvents.length > 0
      ? this._state.activeEvents.join('、')
      : ''
    const durationText = this._state.phaseDuration > 1
      ? `此${label}将持续 ${this._state.phaseDuration} 年`
      : `此${label}将在今年结束`

    if (phase === 'auspicious') {
      return `天穹之上，${events || '祥瑞之兆显现'}——这是大吉之兆，预示着天道眷顾。${durationText}。`
    }
    if (phase === 'omen') {
      return `天穹之上，${events || '不祥之兆笼罩'}——此乃${label}，人心惶惶。${durationText}。`
    }
    // anomaly
    return `天穹骤变！${events || '天地异象降临'}——世界法则紊乱，万物为之震颤。${durationText}。`
  }

  // ============================================================
  // 内部：推进（拆分为数据提取 + 纯计算，P1-2）
  // ============================================================

  private _advance(context: RoundContext): void {
    const worldview = this._getWorldview(context)
    const luckBonus = this._getLuckBonus(context)

    const input: AdvanceContext = {
      worldview,
      luckBonus,
      eraYear: context.round.year,
      phase: this._state.currentPhase,
      phaseDuration: this._state.phaseDuration,
      cooldownYears: this._state.cooldownYears,
      activeEvents: this._state.activeEvents,
      history: this._state.history,
      eventPool: this._eventPool,
    }

    const result = this._pureAdvance(input)

    this._state.currentPhase = result.newPhase
    this._state.phaseDuration = result.phaseDuration
    this._state.cooldownYears = result.cooldownYears
    this._state.activeEvents = result.activeEvents
    this._state.history = result.history
    this._state.crossEffects = result.crossEffects
    this._state.lastRollEraYear = context.round.year
  }

  /** 纯函数：输入确定 → 输出确定（可独立单元测试） */
  private _pureAdvance(input: AdvanceContext): AdvanceResult {
    const phase = input.phase
    let phaseDuration = input.phaseDuration
    let cooldownYears = input.cooldownYears
    let activeEvents: string[] = input.activeEvents
    const history = [...input.history]
    let crossEffects: CelestialCrossEffect[] = []

    // 冷却中减少冷却年数
    if (cooldownYears > 0) {
      cooldownYears = clamp(cooldownYears - 1, 0, Infinity)
    }

    // 减少阶段剩余年数
    if (phaseDuration > 0) {
      phaseDuration = clamp(phaseDuration - 1, 0, Infinity)
    }

    // 冷却期间不掷骰
    if (cooldownYears > 0) {
      return { newPhase: phase, phaseDuration, cooldownYears, activeEvents, history, crossEffects }
    }

    // 阶段未结束不掷骰
    if (phaseDuration > 0) {
      return { newPhase: phase, phaseDuration, cooldownYears, activeEvents, history, crossEffects }
    }

    // 唯物主义永远 normal
    if (input.worldview === 'materialist') {
      return {
        newPhase: 'normal',
        phaseDuration: CelestialSystem._randomFromRange(CELESTIAL_PHASE_DURATION_RANGE),
        cooldownYears: 0,
        activeEvents: ['天象平稳：天文观测正常'],
        history,
        crossEffects,
      }
    }

    // 掷骰决定新阶段
    const newPhase = CelestialSystem._rollPhase(input.worldview, input.luckBonus, input.eventPool)

    activeEvents = CelestialSystem._pickEvents(
      newPhase,
      input.eventPool,
      input.worldview,
      input.eraYear,
      input.phase,
      input.luckBonus,
      history,
    )

    phaseDuration = CelestialSystem._randomFromRange(CELESTIAL_PHASE_DURATION_RANGE)

    // 非 normal 阶段结束后进入冷却
    cooldownYears = newPhase !== 'normal' ? CelestialSystem._randomFromRange(CELESTIAL_COOLDOWN_RANGE) : 0

    // 记录历史
    if (newPhase !== input.phase) {
      history.push({
        phase: newPhase,
        events: activeEvents,
        eraYear: input.eraYear,
      })
    }

    // 生成跨域效果
    crossEffects = CelestialSystem._generateCrossEffects(newPhase, activeEvents)

    return { newPhase, phaseDuration, cooldownYears, activeEvents, history, crossEffects }
  }

  // ============================================================
  // 静态：纯计算工具（无副作用，便于单独测试）
  // ============================================================

  /** 从常量范围生成随机持续年数/冷却年数 */
  private static _randomFromRange([min, max]: readonly [number, number]): number {
    return min + Math.floor(Math.random() * (max - min + 1))
  }

  /** 掷骰决定新天象阶段（P1-3：使用概率常量替代硬编码） */
  private static _rollPhase(
    worldview: string,
    luckBonus: number,
    eventPool: Record<CelestialPhase, CelestialEvent[]>,
  ): CelestialPhase {
    const luckAdjust = luckBonus * 0.01
    const roll = Math.random()
    const probs = CELESTIAL_PROBABILITIES[worldview] ?? CELESTIAL_PROBABILITIES.default

    if (roll < probs.anomaly + luckAdjust * 0.5 && eventPool.anomaly.length > 0) {
      return 'anomaly'
    }
    if (roll < probs.auspicious + luckAdjust && eventPool.auspicious.length > 0) {
      return 'auspicious'
    }
    if (roll < probs.omen - luckAdjust * 0.5 && eventPool.omen.length > 0) {
      return 'omen'
    }
    return 'normal'
  }

  /** 从事件池中按稀有度加权选取事件（P2-1：稀有度分级） */
  private static _pickEvents(
    phase: CelestialPhase,
    eventPool: Record<CelestialPhase, CelestialEvent[]>,
    worldview: string,
    eraYear: number,
    previousPhase: CelestialPhase,
    luckBonus: number,
    history: CelestialHistoryEntry[],
  ): string[] {
    const pool = eventPool[phase]
    if (!pool || pool.length === 0) return []

    // 过滤：前置条件检查
    const eligible = pool.filter((event) =>
      CelestialSystem._checkPrerequisites(event.prerequisites, worldview, eraYear, previousPhase, luckBonus, history),
    )

    if (eligible.length === 0) return [`${pool[0].name}：${pool[0].hint}`]

    // 按稀有度加权随机选取
    const weights = eligible.map((e) => {
      const rarity = e.rarity || 'common'
      return CELESTIAL_RARITY_WEIGHTS[rarity] ?? CELESTIAL_RARITY_WEIGHTS.common
    })
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let roll = Math.random() * totalWeight

    let selected = eligible[0]
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i]
      if (roll <= 0) {
        selected = eligible[i]
        break
      }
    }

    return [`${selected.name}：${selected.hint}`]
  }

  /** 检查事件前置条件（P2-2：前置条件） */
  private static _checkPrerequisites(
    prerequisites: CelestialEventPrerequisite[] | undefined,
    worldview: string,
    eraYear: number,
    previousPhase: CelestialPhase,
    luckBonus: number,
    history: CelestialHistoryEntry[],
  ): boolean {
    if (!prerequisites || prerequisites.length === 0) return true

    for (const prereq of prerequisites) {
      switch (prereq.type) {
        case 'worldAge': {
          const op = prereq.value.charAt(0) === '>' ? '>' : prereq.value.charAt(0) === '<' ? '<' : '>='
          const threshold = Number(prereq.value.slice(1))
          if (isNaN(threshold)) return false
          if (op === '>' && eraYear <= threshold) return false
          if (op === '<' && eraYear >= threshold) return false
          if (op === '>=' && eraYear < threshold) return false
          break
        }
        case 'worldview': {
          const allowed = prereq.value.split(',').map((s) => s.trim())
          if (!allowed.includes(worldview)) return false
          break
        }
        case 'previousPhase': {
          // 检查历史中是否有过某个阶段
          const hasPhase = history.some((h) => h.phase === prereq.value)
          if (!hasPhase && previousPhase !== prereq.value) return false
          break
        }
        case 'minLuck': {
          const min = Number(prereq.value)
          if (isNaN(min)) return false
          if (luckBonus < min) return false
          break
        }
      }
    }
    return true
  }

  /** 生成跨域效果（P2-3：异常→资源减、吉兆→人口增等） */
  private static _generateCrossEffects(phase: CelestialPhase, _events: string[]): CelestialCrossEffect[] {
    switch (phase) {
      case 'anomaly':
        return [
          { targetSystem: 'world-map', effectType: 'resource_penalty', value: -5, description: '天地异象导致资源产出减少' },
          { targetSystem: 'health', effectType: 'health_damage', value: -3, description: '异象冲击世界健康度' },
        ]
      case 'auspicious':
        return [
          { targetSystem: 'population', effectType: 'population_growth', value: 5, description: '吉兆降临促进人口增长' },
          { targetSystem: 'luck', effectType: 'luck_boost', value: 3, description: '天降祥瑞带来额外运势' },
        ]
      case 'omen':
        return [
          { targetSystem: 'population', effectType: 'population_decline', value: -3, description: '凶兆示警导致人心惶惶' },
          { targetSystem: 'world-map', effectType: 'stability_penalty', value: -5, description: '凶兆削弱社会稳定性' },
        ]
      default:
        return []
    }
  }

  // ============================================================
  // 上下文数据提取
  // ============================================================

  private _getWorldview(context: RoundContext): string {
    const worldInit = context.subsystemStates['world-init']
    if (worldInit?.data && typeof (worldInit.data as Record<string, unknown>).worldview === 'string') {
      return (worldInit.data as Record<string, unknown>).worldview as string
    }
    return 'default'
  }

  private _getLuckBonus(context: RoundContext): number {
    const luck = context.subsystemStates['luck']
    if (luck?.data && typeof (luck.data as Record<string, unknown>).luck === 'number') {
      return (luck.data as Record<string, unknown>).luck as number
    }
    return 0
  }

  // ============================================================
  // Summary / 格式化
  // ============================================================

  /** 获取世界观适配的阶段标签（P0-2：术语适配） */
  private _getPhaseLabel(phase: CelestialPhase, worldview: string): string {
    const poolKey = resolveStaticPoolWorldviewKey(worldview)
    const worldviewLabels = CELESTIAL_PHASE_LABELS_BY_WORLDVIEW[poolKey]
    if (worldviewLabels?.[phase]) {
      return worldviewLabels[phase]!
    }
    return CELESTIAL_PHASE_LABELS[phase]
  }

  private _buildSummary(context?: RoundContext): string {
    const worldview = context ? this._getWorldview(context) : 'default'

    if (this._state.currentPhase === 'normal') {
      return `【天象】${this._getPhaseLabel('normal', worldview)}`
    }

    const label = this._getPhaseLabel(this._state.currentPhase, worldview)
    const events = this._state.activeEvents.length > 0
      ? `：${this._state.activeEvents.join('、')}`
      : ''
    return `【天象】${label}（持续 ${this._state.phaseDuration} 年）${events}`
  }
}
