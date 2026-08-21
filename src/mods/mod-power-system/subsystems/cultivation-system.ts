import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { contextHasCapability } from '@/mods/mod-world'
import type { CultivationPersistenceState, CultivationState } from '../types'
import { assertContext, assertEvidence, clone, worldConfig } from './p8-runtime'
const TALENT_BONUS: Record<string, number> = { cultivation_genius: 0.5, spirit_body: 0.3, breakthrough_prodigy: 0.2, strategist: 0.1 }

function initialState(context: RoundContext): CultivationState {
  return { contextId: context.contextId, characterId: context.characterId, enabled: contextHasCapability(context.contextId, 'supernatural'), worldview: worldConfig(context.contextId)?.essenceTag, talentTags: [], realmIndex: 0, realmLabel: '凡人', realmId: 'mortal', bottleneckPenalty: 0, breakthroughChance: 1, anticipation: 0, bottleneckHint: '', trainingBonus: 1, lastBreakthroughAtTotalDays: 0, updatedAtTotalDays: context.totalDays }
}

export class CultivationSystem extends BaseSubsystem {
  readonly id = 'cultivation' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '修炼适配器' as const
  readonly description = '在世界力量框架上提供训练加成、瓶颈与突破条件，不独立拥有战力数值' as const
  private states: Record<string, CultivationState> = {}
  private ensure(context: RoundContext): CultivationState { return this.states[context.contextId] ??= initialState(context) }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    state.enabled = contextHasCapability(context.contextId, 'supernatural')
    if (!state.enabled) { state.updatedAtTotalDays = context.totalDays; return }
    const char = context.subsystemStates['character-base']?.data as { talentTags?: unknown } | undefined
    state.talentTags = Array.isArray(char?.talentTags) ? char.talentTags.filter((item): item is string => typeof item === 'string') : state.talentTags
    state.trainingBonus = Math.min(2.2, 1 + state.talentTags.reduce((sum, tag) => sum + (TALENT_BONUS[tag] ?? 0), 0))
    const combat = context.subsystemStates['combat-power']?.data as { rankId?: string; rankIndex?: number; rankLabel?: string; progress?: number; subStage?: number } | undefined
    state.realmIndex = typeof combat?.rankIndex === 'number' ? combat.rankIndex : 0
    state.realmLabel = typeof combat?.rankLabel === 'string' && combat.rankLabel ? combat.rankLabel : '未进入力量阶位'
    state.realmId = typeof combat?.rankId === 'string' ? combat.rankId : ''
    const atBottleneck = combat?.subStage === 5 || (combat?.progress ?? 0) >= 9000
    state.anticipation = atBottleneck ? Math.min(5, Math.floor((combat?.progress ?? 0) / 2000)) : 0
    state.breakthroughChance = atBottleneck ? Math.max(0.05, 0.7 - Math.max(0, state.realmIndex - 1) * 0.05 - state.bottleneckPenalty / 200) : 1
    state.bottleneckHint = atBottleneck && state.bottleneckPenalty > 0 ? '瓶颈需要事件、训练或明确的世界规则契机' : ''
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!state.enabled) return { id: this.id, summary: '', data: structuredClone(state) }
    return { id: this.id, summary: `【修炼】${state.realmLabel}；训练 ×${state.trainingBonus.toFixed(2)}；突破 ${Math.round(state.breakthroughChance * 100)}%`, data: structuredClone(state) }
  }

  private applyToState(
    state: CultivationState,
    changes: SubSystemChanges,
    context: RoundContext,
  ): void {
    if (changes.id !== this.id) throw new Error('修炼指令目标不匹配')
    assertContext(changes, context, '修炼')
    const operation = changes.operation ?? 'adjust-bottleneck'
    if (operation === 'adjust-bottleneck') {
      if (typeof changes.changes.penaltyDelta !== 'number') throw new Error('修炼瓶颈变化缺少数值')
      state.bottleneckPenalty = Math.max(0, Math.min(100, state.bottleneckPenalty + Math.round(changes.changes.penaltyDelta)))
    } else if (operation === 'set-talents') {
      const tags = changes.changes.talentTags
      if (!Array.isArray(tags) || tags.some((item) => typeof item !== 'string')) throw new Error('修炼天赋标签无效')
      state.talentTags = [...new Set(tags)]
    } else if (operation === 'record-breakthrough') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '修炼')
      state.bottleneckPenalty = 0
      state.lastBreakthroughAtTotalDays = context.totalDays
    } else throw new Error(`未知修炼操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    const candidate = clone(this.states[context.contextId] ?? initialState(context))
    this.applyToState(candidate, changes, context)
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    this.applyToState(this.ensure(context), changes, context)
  }

  captureTransactionState(): Record<string, CultivationState> { return clone(this.states) }
  restoreTransactionState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('修炼事务快照无效')
    this.states = clone(snapshot as Record<string, CultivationState>)
  }

  getTrainingBonus(contextId?: string): number { return Object.values(this.states).find((state) => !contextId || state.contextId === contextId)?.trainingBonus ?? 1 }
  getBreakthroughChance(contextId?: string): number { return Object.values(this.states).find((state) => !contextId || state.contextId === contextId)?.breakthroughChance ?? 0 }
  recordBreakthroughFailure(contextId?: string): void { const state = Object.values(this.states).find((item) => !contextId || item.contextId === contextId); if (state) state.bottleneckPenalty = Math.min(100, state.bottleneckPenalty + 20) }
  recordBreakthroughSuccess(totalDays: number, contextId?: string): void { const state = Object.values(this.states).find((item) => !contextId || item.contextId === contextId); if (state) { state.bottleneckPenalty = 0; state.lastBreakthroughAtTotalDays = totalDays } }
  capturePersistenceState(): CultivationPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { if (snapshot === undefined) { this.states = {}; return }; const value = snapshot as CultivationPersistenceState; if (value.schemaVersion !== 1 || !value.contexts) throw new Error('修炼持久化快照无效'); this.states = clone(value.contexts) }
  reset(): void { this.states = {} }
}

export const cultivationSystem = new CultivationSystem()
