/**
 * @module lifespan-system.ts
 * @description 寿命子系统
 * @mod mod-character
 */
import { getRoundSequence } from '@/foundation'

import type { RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { LifespanState, BreakthroughRecord, RaceLifespanConfig } from '../types'

import {
  RACE_LIFESPAN,
  MAX_LIFESPAN_CAP,
  BASE_HUMAN_LIFESPAN,
  LIFESPAN_WORLD_MAP,
  BREAKTHROUGH_AGE_RATIO,
  BREAKTHROUGH_BASE_CHANCE,
  BREAKTHROUGH_DECAY_MULTIPLIER,
  BREAKTHROUGH_PATHWAYS,
} from '../constants'
import { round } from '../utils'
import { BaseSubsystem } from '@/core'
import { clamp } from '@/core/shared'

import { getFormulaModifier, useWorldStore } from '@/mods/mod-world'
import { useCharacterStore } from '../store'

export class LifespanSystem extends BaseSubsystem {
  readonly id = 'lifespan' as const
  readonly mod = 'mod-character' as const
  readonly label = '寿命' as const
  readonly description = '按显式世界与种族配置计算最大寿命，管理突破并落地结构化寿命增减' as const

  private state: LifespanState = {
    maxAge: 100,
    baseMaxAge: 100,
    race: { ...RACE_LIFESPAN.human! },
    breakthroughs: [],
    breakthroughChance: BREAKTHROUGH_BASE_CHANCE,
  }

  /** 当前世界观名称（用于寿命计算，来自 applyChanges） */
  private worldName = ''
  /** 上次处理突破检查的轮次（Round 2 collectStateUpdate） */
  private _lastProcessedRound = -1

  /** 本轮减寿 UI 提示（collectStateUpdate 写入 summary 后清空） */
  private _pendingReductionNote: string | null = null
  collectState(context: RoundContext): SubSystemState {
    const age = this.getCharacterAge(context)
    const s = this.state

    return {
      id: this.id,
      summary: `【${this.label}】${s.race.name} | 当前年龄 ${age} / 最大寿命 ${s.maxAge} | 突破次数：${s.breakthroughs.length} | 突破概率：${Math.round(s.breakthroughChance * 100)}%`,
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

    // 设置种族
    if (typeof ch.raceId === 'string' && RACE_LIFESPAN[ch.raceId]) {
      this.state.race = { ...RACE_LIFESPAN[ch.raceId]! }
      needRecompute = true
    }

    // 当显式世界观/种族变更时，重新计算基础寿命。
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
    this._lastProcessedRound = -1
    this._pendingReductionNote = null
  }

  /** 从创建/持久化 Store 水合寿命权威。 */
  hydrateFromStore(): void {
    this.restoreCollectedState(useCharacterStore.getState().lifespan)
    this.worldName = useWorldStore.getState().worldConfig?.name ?? this.worldName
  }

  /** 从 orchestrator collectState().data 恢复私有寿命状态。 */
  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as Partial<LifespanState>
    if (
      typeof value.maxAge !== 'number'
      || typeof value.baseMaxAge !== 'number'
      || !value.race
      || !Array.isArray(value.breakthroughs)
      || typeof value.breakthroughChance !== 'number'
    ) return
    this.state = structuredClone({
      maxAge: value.maxAge,
      baseMaxAge: value.baseMaxAge,
      race: value.race,
      breakthroughs: value.breakthroughs,
      breakthroughChance: value.breakthroughChance,
    })
    this.worldName = useWorldStore.getState().worldConfig?.name ?? ''
    this._lastProcessedRound = -1
    this._pendingReductionNote = null
  }

  capturePreviewState(): unknown {
    return structuredClone({
      state: this.state,
      worldName: this.worldName,
      lastProcessedRound: this._lastProcessedRound,
      pendingReductionNote: this._pendingReductionNote,
    })
  }

  restorePreviewState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as {
      state?: LifespanState
      worldName?: string
      lastProcessedRound?: number
      pendingReductionNote?: string | null
    }
    this.restoreCollectedState(value.state)
    if (typeof value.worldName === 'string') this.worldName = value.worldName
    if (typeof value.lastProcessedRound === 'number') this._lastProcessedRound = value.lastProcessedRound
    if (typeof value.pendingReductionNote === 'string' || value.pendingReductionNote === null) {
      this._pendingReductionNote = value.pendingReductionNote
    }
  }

  // -------- 内部方法 --------

  /**
   * 初始寿命只使用显式世界配置和结构化种族配置。
   * 背景是自由文本，不参与本地语义推断。
   */
  private computeMaxAge(worldName: string, race: RaceLifespanConfig): number {
    let maxAge = BASE_HUMAN_LIFESPAN

    // 维度 1：世界观修正
    const worldLifespan = LIFESPAN_WORLD_MAP[worldName] ?? BASE_HUMAN_LIFESPAN
    if (worldLifespan > maxAge) maxAge = worldLifespan

    // 维度 2：种族基础寿命
    if (race.baseMaxAge > maxAge) maxAge = race.baseMaxAge

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

  /**
   * 获取角色当前的实际年龄 = 起始年龄 + 已过年数
   * startingAge 从 CharacterBaseSystem 的显式字段读取。
   */
  private getCharacterAge(context: RoundContext): number {
    const baseState = context.subsystemStates?.['character-base']?.data
    const startingAge = (baseState && typeof baseState === 'object' && 'startingAge' in baseState)
      ? (baseState as Record<string, unknown>).startingAge as number
      : 0
    return (startingAge ?? 0) + clamp(context.round.year - 1, 0, Infinity)
  }
}

let runtimeLifespanSystem: LifespanSystem | undefined

/** Loader 与引擎共享的懒加载寿命单例。 */
export function getLifespanSystem(): LifespanSystem {
  runtimeLifespanSystem ??= new LifespanSystem()
  return runtimeLifespanSystem
}
