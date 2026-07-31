import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { contextHasCapability } from '@/mods/mod-world'
import type { EncounterEvent, EncounterTier, FortuneEncounterPersistenceState, FortuneEncounterState } from '../types'
import { assertContext, assertEvidence, clone, stableIndex, worldConfig } from './p8-runtime'

const POOL: Array<Omit<EncounterEvent, 'id' | 'status' | 'createdAtTotalDays' | 'evidenceEventIds'>> = [
  { tier: 'minor', name: '偶然线索', description: '一个可追踪的线索出现在当前环境中', narrativeHint: '保持克制，先验证来源' },
  { tier: 'major', name: '关键机缘', description: '一项稀缺资源或知识机会进入可验证范围', narrativeHint: '机会伴随明确代价' },
  { tier: 'legendary', name: '世界转折', description: '一件可能改变当地秩序的事件候选出现', narrativeHint: '必须引用历史事实后才能结算' },
]

function initialState(context: RoundContext): FortuneEncounterState { return { contextId: context.contextId, enabled: contextHasCapability(context.contextId, 'supernatural'), cooldownDays: 0, totalEncounters: 0, activeEncounter: null, lastEncounterId: null, lastCandidateAtTotalDays: 0, updatedAtTotalDays: context.totalDays } }

export class FortuneEncounterSystem extends BaseSubsystem {
  readonly id = 'fortune-encounter' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '机缘候选' as const
  readonly description = '基于时间、气运和历史上下文提供可验证事件候选，不在收集阶段随机结算' as const
  private states: Record<string, FortuneEncounterState> = {}
  private ensure(context: RoundContext): FortuneEncounterState { return this.states[context.contextId] ??= initialState(context) }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    state.enabled = contextHasCapability(context.contextId, 'supernatural')
    if (!state.enabled || context.daysPassed <= 0) { state.updatedAtTotalDays = context.totalDays; return }
    state.cooldownDays = Math.max(0, state.cooldownDays - context.daysPassed)
    if (state.activeEncounter?.status === 'candidate' && context.totalDays - state.activeEncounter.createdAtTotalDays > 180) state.activeEncounter = { ...state.activeEncounter, status: 'expired' }
    const luck = context.subsystemStates.luck?.data as { luck?: number; modifiers?: { eventWeightBias?: number } } | undefined
    const luckScore = (luck?.luck ?? 0) + (luck?.modifiers?.eventWeightBias ?? 0) * 10
    const interval = Math.max(30, 240 - Math.round(luckScore * 8))
    if (!state.activeEncounter && state.cooldownDays === 0 && context.totalDays - state.lastCandidateAtTotalDays >= interval) {
      const index = stableIndex(context.contextId, context.totalDays, worldConfig(context.contextId)?.essenceTag ?? '') % POOL.length
      const template = POOL[index]
      const tier: EncounterTier = luckScore >= 8 ? 'legendary' : luckScore >= 4 ? 'major' : template.tier
      state.activeEncounter = { ...template, id: `encounter:${context.contextId}:${context.totalDays}`, tier, status: 'candidate', createdAtTotalDays: context.totalDays, evidenceEventIds: [] }
      state.lastCandidateAtTotalDays = context.totalDays
    }
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!state.enabled) return { id: this.id, summary: '', data: structuredClone(state) }
    return { id: this.id, summary: state.activeEncounter?.status === 'candidate' ? `【机缘】${state.activeEncounter.name}（${state.activeEncounter.tier}）` : `【机缘】冷却 ${state.cooldownDays} 天；累计 ${state.totalEncounters} 次`, data: structuredClone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('机缘指令目标不匹配')
    assertContext(changes, context, '机缘')
    const state = this.ensure(context)
    const candidate = state.activeEncounter
    if (!candidate) throw new Error('当前没有机缘候选')
    const operation = changes.operation ?? 'accept'
    if (operation === 'accept') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '机缘')
      state.activeEncounter = { ...candidate, status: 'accepted', evidenceEventIds: [...new Set(changes.evidenceEventIds ?? [])] }
      state.lastEncounterId = candidate.id; state.totalEncounters += 1; state.cooldownDays = candidate.tier === 'legendary' ? 365 : candidate.tier === 'major' ? 180 : 90
    } else if (operation === 'expire') {
      state.activeEncounter = { ...candidate, status: 'expired' }
    } else throw new Error(`未知机缘操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): FortuneEncounterPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { if (snapshot === undefined) { this.states = {}; return }; const value = snapshot as FortuneEncounterPersistenceState; if (value.schemaVersion !== 1 || !value.contexts) throw new Error('机缘持久化快照无效'); this.states = clone(value.contexts) }
  capturePreviewState(): FortuneEncounterPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const fortuneEncounterSystem = new FortuneEncounterSystem()
