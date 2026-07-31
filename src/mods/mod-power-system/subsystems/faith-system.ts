import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { contextHasCapability } from '@/mods/mod-world'
import type { FaithPersistenceState, FaithState } from '../types'
import { assertContext, assertEvidence, clone } from './p8-runtime'

function initialState(context: RoundContext): FaithState { return { contextId: context.contextId, subjectEntityId: context.characterId, beliefId: null, devotionLevel: 0, daysInFaith: 0, updatedAtTotalDays: context.totalDays } }

export class FaithSystem extends BaseSubsystem {
  readonly id = 'faith' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '信念关系插件' as const
  readonly description = '按上下文记录角色信念归属与虔诚度，关系类别仍由 relationship-system 拥有' as const
  private states: Record<string, FaithState> = {}
  private ensure(context: RoundContext): FaithState { return this.states[context.contextId] ??= initialState(context) }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (!contextHasCapability(context.contextId, 'supernatural')) { state.updatedAtTotalDays = context.totalDays; return }
    if (state.beliefId) { state.daysInFaith += Math.max(0, context.daysPassed); state.devotionLevel = Math.max(0, Math.round(state.devotionLevel - context.daysPassed / 365 * 2)) }
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!contextHasCapability(context.contextId, 'supernatural')) return { id: this.id, summary: '', data: structuredClone(state) }
    const bonus = state.beliefId ? 1 + state.devotionLevel / 100 * 0.3 : 1
    return { id: this.id, summary: state.beliefId ? `【信念】${state.beliefId}；虔诚 ${state.devotionLevel}；突破修正 ×${bonus.toFixed(2)}` : '【信念】未建立归属', data: structuredClone({ ...state, breakthroughBonus: bonus }) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('信念指令目标不匹配')
    assertContext(changes, context, '信念')
    const state = this.ensure(context)
    const operation = changes.operation ?? 'adjust-devotion'
    if (operation === 'set-belief') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '信念')
      const beliefId = changes.changes.beliefId
      if (typeof beliefId !== 'string' || !beliefId.trim()) throw new Error('信念归属无效')
      state.beliefId = beliefId.trim(); state.devotionLevel = 10; state.daysInFaith = 0
    } else if (operation === 'adjust-devotion') {
      const delta = changes.changes.devotionDelta
      if (typeof delta !== 'number') throw new Error('虔诚变化缺少数值')
      state.devotionLevel = Math.max(0, Math.min(100, Math.round(state.devotionLevel + delta)))
    } else if (operation === 'leave-belief') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '信念')
      state.beliefId = null; state.devotionLevel = 0; state.daysInFaith = 0
    } else throw new Error(`未知信念操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  getFaithBreakthroughBonus(contextId?: string): number { const state = Object.values(this.states).find((item) => !contextId || item.contextId === contextId); return state?.beliefId ? 1 + state.devotionLevel / 100 * 0.3 : 1 }
  getDevotionLabel(contextId?: string): string { const value = Object.values(this.states).find((item) => !contextId || item.contextId === contextId)?.devotionLevel ?? 0; return value >= 80 ? '虔诚至深' : value >= 50 ? '坚定' : value >= 20 ? '略有信奉' : '信念淡薄' }
  capturePersistenceState(): FaithPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { if (snapshot === undefined) { this.states = {}; return }; const value = snapshot as FaithPersistenceState; if (value.schemaVersion !== 1 || !value.contexts) throw new Error('信念持久化快照无效'); this.states = clone(value.contexts) }
  capturePreviewState(): FaithPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const faithSystem = new FaithSystem()
