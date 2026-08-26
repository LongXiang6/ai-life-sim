/**
 * Purpose: Advance and validate combat-power progression using annual base points.
 * Owner: mod-power-system
 * Responsibility: Combat-power state and formulas only; world capabilities remain owned by mod-world.
 */

import { BaseSubsystem } from '@/core'
import { BASE_POINTS_PER_YEAR, basePointsToCalendarDays, calendarDaysToBasePoints, type RoundContext, type SubSystemChanges, type SubSystemState } from '@/foundation'
import { assertValidPowerFramework, contextHasCapability } from '@/mods/mod-world'
import type { CombatPowerPersistenceState, CombatPowerState, PowerFrameworkDefinition, PowerRankDefinition, SubStageIndex } from '../types'
import { BASE_POWER_GAIN, INSIGHT_DURATION, INSIGHT_MULTIPLIER, SUB_STAGE_THRESHOLDS } from '../constants'
import { formatCombatPower } from '../utils'
import { assertContext, assertEvidence, clone, worldConfig } from './p8-runtime'

function readFramework(context: RoundContext): PowerFrameworkDefinition {
  const framework = worldConfig(context.contextId)?.powerFramework
  if (!framework) throw new Error(`世界 ${context.contextId} 缺少力量框架`)
  assertValidPowerFramework(framework)
  return clone(framework)
}

function createState(context: RoundContext): CombatPowerState {
  const framework = readFramework(context)
  const first = framework.ranks[0]
  return { contextId: context.contextId, characterId: context.characterId, initialized: framework.enabled, framework, rankId: first?.id ?? '', rankIndex: first?.index ?? 0, rankLabel: first?.label ?? '', subStage: 1, progress: 0, insightBasePointsRemaining: 0, insightDaysRemaining: 0, updatedAtBasePoints: context.totalBasePoints, stageNames: {}, updatedAtTotalDays: context.totalDays }
}

export class CombatPowerSystem extends BaseSubsystem {
  readonly id = 'combat-power' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '通用力量框架' as const
  readonly description = '消费世界定义的力量阶位并按当地时间推进，不预设跨世界阶位数量' as const
  private states: Record<string, CombatPowerState> = {}

  private ensure(context: RoundContext): CombatPowerState {
    const existing = this.states[context.contextId]
    if (existing) {
      existing.insightBasePointsRemaining ??= calendarDaysToBasePoints(existing.insightDaysRemaining ?? 0)
      existing.updatedAtBasePoints ??= calendarDaysToBasePoints(existing.updatedAtTotalDays ?? 0)
      return existing
    }
    return this.states[context.contextId] ??= createState(context)
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (!contextHasCapability(context.contextId, 'supernatural') || !state.framework.enabled || context.basePointsPassed <= 0) { state.updatedAtBasePoints = context.totalBasePoints; state.updatedAtTotalDays = context.totalDays; return }
    const cultivation = context.subsystemStates.cultivation?.data as { trainingBonus?: number } | undefined
    const trainingBonus = typeof cultivation?.trainingBonus === 'number' ? cultivation.trainingBonus : 1
    const decay = 1 / (1 + Math.max(0, state.rankIndex - 1) * 0.18)
    const insight = state.insightBasePointsRemaining > 0 ? INSIGHT_MULTIPLIER : 1
    state.progress += context.basePointsPassed / BASE_POINTS_PER_YEAR * BASE_POWER_GAIN * trainingBonus * decay * insight
    state.insightBasePointsRemaining = Math.max(0, state.insightBasePointsRemaining - context.basePointsPassed)
    while (state.progress >= SUB_STAGE_THRESHOLDS[5]) {
      state.progress -= SUB_STAGE_THRESHOLDS[5]
      const next = state.framework.ranks.find((rank) => rank.index === state.rankIndex + 1)
      if (!next) {
        if (state.framework.progression !== 'open') { state.progress = SUB_STAGE_THRESHOLDS[5] - 1; break }
        const rank: PowerRankDefinition = { id: `${state.framework.id}:open-${state.rankIndex + 1}`, index: state.rankIndex + 1, label: `开放进阶${state.rankIndex + 1}`, description: '开放力量框架新增的阶位，具体效果由世界规则解释' }
        state.framework.ranks.push(rank)
        state.framework.ranks.sort((a, b) => a.index - b.index)
      }
      const promoted = state.framework.ranks.find((rank) => rank.index === state.rankIndex + 1)
      if (!promoted) break
      state.rankIndex = promoted.index; state.rankId = promoted.id; state.rankLabel = state.stageNames[promoted.id] ?? promoted.label
      state.subStage = 1; state.insightBasePointsRemaining = Math.max(1, calendarDaysToBasePoints(INSIGHT_DURATION))
    }
    state.subStage = Math.max(1, Math.min(5, Math.floor(state.progress / 2000) + 1)) as SubStageIndex
    state.insightDaysRemaining = basePointsToCalendarDays(state.insightBasePointsRemaining)
    state.updatedAtBasePoints = context.totalBasePoints
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!contextHasCapability(context.contextId, 'supernatural')) return { id: this.id, summary: '', data: structuredClone(state) }
    return { id: this.id, summary: `【力量】${formatCombatPower(state.rankLabel, state.subStage, state.progress)}；体系 ${state.framework.label}`, data: structuredClone(state) }
  }

  private applyToState(
    state: CombatPowerState,
    changes: SubSystemChanges,
    context: RoundContext,
  ): void {
    if (changes.id !== this.id) throw new Error('力量指令目标不匹配')
    assertContext(changes, context, '力量')
    const operation = changes.operation ?? 'adjust-progress'
    if (operation === 'adjust-progress') {
      if (typeof changes.changes.progressDelta !== 'number') throw new Error('力量进度变化缺少数值')
      state.progress = Math.max(0, Math.min(SUB_STAGE_THRESHOLDS[5] - 1, state.progress + Math.round(changes.changes.progressDelta)))
    } else if (operation === 'set-rank') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '力量')
      const rankId = typeof changes.changes.rankId === 'string' ? changes.changes.rankId : ''
      const rank = state.framework.ranks.find((item) => item.id === rankId)
      if (!rank) throw new Error(`力量阶位不存在：${rankId}`)
      state.rankId = rank.id; state.rankIndex = rank.index; state.rankLabel = state.stageNames[rank.id] ?? rank.label
      state.subStage = 1; state.progress = 0
    } else if (operation === 'rename-rank') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '力量')
      const rankId = typeof changes.changes.rankId === 'string' ? changes.changes.rankId : ''
      const label = typeof changes.changes.label === 'string' ? changes.changes.label.trim() : ''
      if (!rankId || !label) throw new Error('力量阶位命名输入无效')
      state.stageNames[rankId] = label
      if (state.rankId === rankId) state.rankLabel = label
    } else throw new Error(`未知力量操作：${operation}`)
    state.updatedAtBasePoints = context.totalBasePoints
    state.updatedAtTotalDays = context.totalDays
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    const candidate = clone(this.states[context.contextId] ?? createState(context))
    this.applyToState(candidate, changes, context)
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    this.applyToState(this.ensure(context), changes, context)
  }

  captureTransactionState(): Record<string, CombatPowerState> { return clone(this.states) }
  restoreTransactionState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('力量事务快照无效')
    this.states = clone(snapshot as Record<string, CombatPowerState>)
  }

  comparePower(a: CombatPowerState, b: CombatPowerState): number {
    if (a.framework.id !== b.framework.id) throw new Error('不同世界力量框架不能直接比较')
    return (a.rankIndex - b.rankIndex) || (a.subStage - b.subStage) || (a.progress - b.progress)
  }

  getCombatPowerVsMonsterModifier(monsterThreat: number, state?: CombatPowerState): number {
    const current = state ?? Object.values(this.states)[0]
    if (!current) return 1
    const relativeRank = current.rankIndex / Math.max(1, current.framework.ranks.length)
    return Math.max(0.3, Math.min(2, (relativeRank * 5 + current.subStage / 5) / Math.max(1, monsterThreat / 20)))
  }

  capturePersistenceState(): CombatPowerPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as CombatPowerPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('力量持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const combatPowerSystem = new CombatPowerSystem()
