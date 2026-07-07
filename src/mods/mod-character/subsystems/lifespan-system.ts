/**
 * @module lifespan-system.ts
 * @description 寿命子系统
 * @mod mod-character
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { LifespanState, BreakthroughRecord, RaceLifespanConfig } from '../types'

import {
  RACE_LIFESPAN,
  MAX_LIFESPAN_CAP,
  BASE_HUMAN_LIFESPAN,
  LIFESPAN_WORLD_MAP,
  LIFESPAN_BG_BONUS_KEYWORDS,
  BREAKTHROUGH_AGE_RATIO,
  BREAKTHROUGH_BASE_CHANCE,
  BREAKTHROUGH_DECAY_MULTIPLIER,
  BREAKTHROUGH_PATHWAYS,
  LIFESPAN_REDUCTION_KEYWORDS,
} from '../constants'
import { round } from '../utils'
import { clamp } from '@/core/shared'

import { getFormulaModifier } from '@/mods/mod-world'
import { LIFESPAN_NARRATIVE_REDUCTION_ENABLED } from '@/core/ai-service/prompt-flags'

/**
 * 获取年龄对应的生命阶段标签
 * @param age 当前年龄
 * @returns 生命阶段中文标签
 */
function getLifecycleStageLabel(age: number): string {
  if (age <= 12) return '少年'
  if (age <= 30) return '青年'
  if (age <= 50) return '壮年'
  if (age <= 70) return '老年'
  return '暮年'
}

export class LifespanSystem implements ISubSystem {
  readonly id = 'lifespan' as const
  readonly mod = 'mod-character' as const
  readonly label = '寿命' as const
  readonly description = '三维度计算最大寿命（世界观×种族×背景） + 管理突破 + 落地结构化寿命增减' as const

  private state: LifespanState = {
    maxAge: 100,
    baseMaxAge: 100,
    race: { ...RACE_LIFESPAN.human! },
    breakthroughs: [],
    breakthroughChance: BREAKTHROUGH_BASE_CHANCE,
  }

  /** 当前世界观名称（用于寿命计算，来自 applyChanges） */
  private worldName = ''
  /** 当前角色背景文本（用于背景关键词寿命加成，来自 applyChanges） */
  private background = ''

  /** 上次处理突破/减寿检查的轮次（Round 2 collectStateUpdate） */
  private _lastProcessedRound = -1

  /** 本轮减寿 UI 提示（collectStateUpdate 写入 summary 后清空） */
  private _pendingReductionNote: string | null = null

  collectState(context: RoundContext): SubSystemState {
    const age = this.getCharacterAge(context)
    const s = this.state
    const stageLabel = getLifecycleStageLabel(age)

    return {
      id: this.id,
      summary: `【${this.label}】${s.race.name} | 当前年龄 ${age} ${stageLabel} / 最大寿命 ${s.maxAge} | 突破次数：${s.breakthroughs.length} | 突破概率：${Math.round(s.breakthroughChance * 100)}%`,
      data: structuredClone({
        maxAge: s.maxAge,
        baseMaxAge: s.baseMaxAge,
        race: s.race,
        breakthroughs: s.breakthroughs,
        breakthroughChance: s.breakthroughChance,
      }),
    }
  }

  /** Round 2：读取 luck/wealth/reputation/faith 后判定寿命突破 */
  collectStateUpdate(context: RoundContext): SubSystemState | null {
    if (getRoundSequence(context) === this._lastProcessedRound) return null
    this._lastProcessedRound = getRoundSequence(context)

    const age = this.getCharacterAge(context)
    this.checkBreakthrough(age, context)
    this.checkLifespanReduction(context)

    const s = this.state
    const reductionHint = this._pendingReductionNote ? ` | 减寿：${this._pendingReductionNote}` : ''
    this._pendingReductionNote = null
    return {
      id: this.id,
      summary: `【${this.label}】${s.race.name} | 当前年龄 ${age} / 最大寿命 ${s.maxAge} | 突破次数：${s.breakthroughs.length} | 突破概率：${Math.round(s.breakthroughChance * 100)}%${reductionHint}`,
      data: structuredClone({
        maxAge: s.maxAge,
        baseMaxAge: s.baseMaxAge,
        race: s.race,
        breakthroughs: s.breakthroughs,
        breakthroughChance: s.breakthroughChance,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return
    const ch = changes.changes

    let needRecompute = false

    // 记录世界观名称（参与三维度计算）
    if (typeof ch.worldName === 'string') {
      this.worldName = ch.worldName
      needRecompute = true
    }

    // 记录背景文本（参与背景关键词寿命加成）
    if (typeof ch.background === 'string') {
      this.background = ch.background
      needRecompute = true
    }

    // 设置种族
    if (typeof ch.raceId === 'string' && RACE_LIFESPAN[ch.raceId]) {
      this.state.race = { ...RACE_LIFESPAN[ch.raceId]! }
      needRecompute = true
    }

    // 当世界观/背景/种族任一变更时，重新用三维度模型计算
    if (needRecompute) {
      const newMaxAge = this.computeMaxAge(this.worldName, this.state.race)
      this.state.baseMaxAge = newMaxAge
      this.state.maxAge = newMaxAge
      this.state.breakthroughChance = round(
        BREAKTHROUGH_BASE_CHANCE * getFormulaModifier('breakthroughChanceModifier'),
        4,
      )
    }

    // 直接设置 maxAge（手动覆盖，优先级最高）
    if (typeof ch.maxAge === 'number') {
      this.state.maxAge = round(clamp(ch.maxAge, 1, MAX_LIFESPAN_CAP))
    }

    // 结构化寿命增量：减寿/增寿由 LifespanSystem 自己落地，编排器不得二次计算 maxAge。
    if (typeof ch.lifespanDelta === 'number') {
      this.state.maxAge = round(clamp(this.state.maxAge + ch.lifespanDelta, 1, MAX_LIFESPAN_CAP))
      if (ch.lifespanDelta < 0) {
        this._pendingReductionNote = `结构化寿命变化（${ch.lifespanDelta}年）`
      }
    }

    // 应用 AI 适配
    if (ch.adaptedRace && typeof ch.adaptedRace === 'object') {
      const ar = ch.adaptedRace as Partial<RaceLifespanConfig>
      this.state.race = {
        ...this.state.race,
        name: ar.name ?? this.state.race.name,
        baseMaxAge: typeof ar.baseMaxAge === 'number'
          ? Math.min(ar.baseMaxAge, this.state.race.baseMaxAge * 2)
          : this.state.race.baseMaxAge,
      }
      this.state.baseMaxAge = this.state.race.baseMaxAge
      this.state.maxAge = Math.min(this.state.race.baseMaxAge, MAX_LIFESPAN_CAP)
    }

    // 添加突破记录
    if (Array.isArray(ch.addBreakthroughs)) {
      for (const br of ch.addBreakthroughs as BreakthroughRecord[]) {
        this.state.breakthroughs.push(br)
        this.state.maxAge = round(Math.min(this.state.maxAge + br.yearsGained, MAX_LIFESPAN_CAP))
      }
    }
  }

  reset(): void {
    this.state = {
      maxAge: 100,
      baseMaxAge: 100,
      race: { ...RACE_LIFESPAN.human! },
      breakthroughs: [],
      breakthroughChance: BREAKTHROUGH_BASE_CHANCE,
    }
    this.worldName = ''
    this.background = ''
    this._lastProcessedRound = -1
    this._pendingReductionNote = null
  }

  // -------- 内部方法 --------

  /**
   * 三维度初始寿命计算（世界观 × 种族 × 背景），对齐废弃项目 computeMaxAge
   * 取三者最大值，上限钳制到 MAX_LIFESPAN_CAP
   */
  private computeMaxAge(worldName: string, race: RaceLifespanConfig): number {
    let maxAge = BASE_HUMAN_LIFESPAN

    // 维度 1：世界观修正
    const worldLifespan = LIFESPAN_WORLD_MAP[worldName] ?? BASE_HUMAN_LIFESPAN
    if (worldLifespan > maxAge) maxAge = worldLifespan

    // 维度 2：种族基础寿命
    if (race.baseMaxAge > maxAge) maxAge = race.baseMaxAge

    // 维度 3：背景关键词加成
    for (const [kw, bonus] of Object.entries(LIFESPAN_BG_BONUS_KEYWORDS)) {
      if (this.background.includes(kw) && bonus > maxAge) {
        maxAge = bonus
      }
    }

    // 正则匹配 "寿命+N" 格式（如"寿命+500"）
    if (this.background.includes('系统') && !this.background.includes('系统无限寿命')) {
      const systemMatch = this.background.match(/寿命\s*[+＋加]\s*(\d{2,})/)
      if (systemMatch) {
        const addYears = parseInt(systemMatch[1], 10)
        if (!isNaN(addYears)) {
          maxAge = Math.max(maxAge, BASE_HUMAN_LIFESPAN + addYears)
        }
      }
    }

    return Math.min(Math.round(Math.max(maxAge, 1) * getFormulaModifier('lifespanModifier')), MAX_LIFESPAN_CAP)
  }

  private checkBreakthrough(age: number, context: RoundContext): void {
    const s = this.state
    if (s.maxAge <= 0 || age / s.maxAge <= BREAKTHROUGH_AGE_RATIO) return

    const { luck, wealth, reputation, faithBonus } = this.readBreakthroughContext(context)
    const rollChance = s.breakthroughChance * faithBonus

    if (Math.random() < rollChance) {
      const eligible = BREAKTHROUGH_PATHWAYS.filter((p) =>
        luck >= p.requiredLuck
        && wealth >= p.requiredWealth
        && reputation >= p.requiredReputation,
      )

      if (eligible.length === 0) return

      const pathway = eligible[Math.floor(Math.random() * eligible.length)]!
      const br: BreakthroughRecord = {
        pathway: pathway.pathway,
        year: age,
        yearsGained: pathway.yearsGained,
        description: `${pathway.label}——${pathway.description}`,
      }

      s.breakthroughs.push(br)
      s.maxAge = round(Math.min(s.maxAge + pathway.yearsGained, MAX_LIFESPAN_CAP))
      s.breakthroughChance = round(s.breakthroughChance / BREAKTHROUGH_DECAY_MULTIPLIER)
    }
  }

  private readBreakthroughContext(context: RoundContext): {
    luck: number
    wealth: number
    reputation: number
    faithBonus: number
  } {
    const luck = (context.subsystemStates['luck']?.data as { luck?: number } | undefined)?.luck ?? 0

    const economyData = context.subsystemStates['economy']?.data as {
      currency?: { playerWealth?: number }
      wealth?: number
    } | undefined
    const wealth = economyData?.currency?.playerWealth ?? economyData?.wealth ?? 0

    const repData = context.subsystemStates['reputation']?.data as {
      fame?: number
      score?: number
    } | undefined
    const reputation = repData?.fame ?? repData?.score ?? 0

    const faithData = context.subsystemStates['faith']?.data as {
      breakthroughBonus?: number
      faithName?: string | null
    } | undefined
    const faithBonus = faithData?.faithName
      ? (faithData.breakthroughBonus ?? 1)
      : 1

    return { luck, wealth, reputation, faithBonus }
  }

  private checkLifespanReduction(context: RoundContext): void {
    if (!LIFESPAN_NARRATIVE_REDUCTION_ENABLED) return

    const narrative = context.lastNarrativeText
    if (!narrative?.trim()) return

    let bestMatch: { yearsLost: number; note: string } | null = null
    for (const group of LIFESPAN_REDUCTION_KEYWORDS) {
      const matched = group.keywords.some((kw) => narrative.includes(kw))
      if (matched && (!bestMatch || group.yearsLost > bestMatch.yearsLost)) {
        bestMatch = { yearsLost: group.yearsLost, note: group.note }
      }
    }

    if (!bestMatch) return

    this.state.maxAge = round(Math.max(1, this.state.maxAge - bestMatch.yearsLost))
    this._pendingReductionNote = `${bestMatch.note}（-${bestMatch.yearsLost}年）`
  }

  /**
   * 获取角色当前的实际年龄 = 起始年龄 + 已过年数
   * startingAge 从 CharacterBaseSystem 读取（穿越者 18 岁起步，原生者 0 岁）
   */
  private getCharacterAge(context: RoundContext): number {
    const baseState = context.subsystemStates?.['character-base']?.data
    const startingAge = (baseState && typeof baseState === 'object' && 'startingAge' in baseState)
      ? (baseState as Record<string, unknown>).startingAge as number
      : 0
    return (startingAge ?? 0) + clamp(context.round.year - 1, 0, Infinity)
  }
}
