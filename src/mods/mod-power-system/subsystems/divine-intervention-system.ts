import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import type { DivineInterventionPersistenceState, DivineInterventionState, MiracleEntry, OracleEntry } from '../types'
import { assertContext, assertEvidence, clone } from './p8-runtime'

function initialState(context: RoundContext): DivineInterventionState { return { contextId: context.contextId, enabled: false, activeOracles: [], activeMiracles: [], chosenEntityIds: [], severity: 0, updatedAtTotalDays: context.totalDays } }

export class DivineInterventionSystem extends BaseSubsystem {
  readonly id = 'divine-intervention' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '神明干预' as const
  readonly description = '把神谕、神迹和神选作为有证据事件提供器，不直接修改角色或世界状态' as const
  private states: Record<string, DivineInterventionState> = {}
  private ensure(context: RoundContext): DivineInterventionState { return this.states[context.contextId] ??= initialState(context) }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    const divine = context.subsystemStates['divine-creation']?.data as { enabled?: boolean } | undefined
    state.enabled = divine?.enabled === true
    state.activeOracles = state.activeOracles.filter((item) => item.expiresAtTotalDays > context.totalDays)
    state.activeMiracles = state.activeMiracles.filter((item) => item.expiresAtTotalDays > context.totalDays)
    state.severity = Math.max(0, state.severity - context.daysPassed / 365)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!state.enabled) return { id: this.id, summary: '', data: structuredClone(state) }
    return { id: this.id, summary: `【神明干预】神谕 ${state.activeOracles.length}；神迹 ${state.activeMiracles.length}；严重度 ${Math.round(state.severity)}`, data: structuredClone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('神明干预指令目标不匹配')
    assertContext(changes, context, '神明干预')
    const state = this.ensure(context)
    if (!state.enabled) throw new Error('当前上下文未启用神明干预')
    assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '神明干预')
    const deityId = typeof changes.changes.deityId === 'string' ? changes.changes.deityId : ''
    const title = typeof changes.changes.title === 'string' ? changes.changes.title.trim() : ''
    if (!deityId || !title) throw new Error('神明干预缺少神祇和标题')
    const duration = typeof changes.changes.durationDays === 'number' && changes.changes.durationDays > 0 ? Math.trunc(changes.changes.durationDays) : 30
    const evidenceEventIds = [...new Set(changes.evidenceEventIds ?? [])]
    const operation = changes.operation ?? 'oracle'
    if (operation === 'oracle') {
      const entry: OracleEntry = { id: changes.targetObjectId ?? `oracle:${context.contextId}:${context.totalDays}:${state.activeOracles.length}`, deityId, title, hint: typeof changes.changes.hint === 'string' ? changes.changes.hint : '', expiresAtTotalDays: context.totalDays + duration, evidenceEventIds }
      state.activeOracles = [...state.activeOracles.filter((item) => item.id !== entry.id), entry].slice(-10)
    } else if (operation === 'miracle') {
      const entry: MiracleEntry = { id: changes.targetObjectId ?? `miracle:${context.contextId}:${context.totalDays}:${state.activeMiracles.length}`, deityId, title, effectHint: typeof changes.changes.effectHint === 'string' ? changes.changes.effectHint : '', expiresAtTotalDays: context.totalDays + duration, evidenceEventIds }
      state.activeMiracles = [...state.activeMiracles.filter((item) => item.id !== entry.id), entry].slice(-10)
    } else if (operation === 'choose') {
      const entityId = typeof changes.changes.entityId === 'string' ? changes.changes.entityId : ''
      if (!entityId) throw new Error('神选实体缺少 ID')
      state.chosenEntityIds = [...new Set([...state.chosenEntityIds, entityId])]
    } else if (operation === 'judgement') {
      const severityDelta = changes.changes.severityDelta
      if (typeof severityDelta !== 'number') throw new Error('神明裁决严重度缺少数值')
      state.severity = Math.max(0, Math.min(100, state.severity + severityDelta))
    } else throw new Error(`未知神明干预操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): DivineInterventionPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { if (snapshot === undefined) { this.states = {}; return }; const value = snapshot as DivineInterventionPersistenceState; if (value.schemaVersion !== 1 || !value.contexts) throw new Error('神明干预持久化快照无效'); this.states = clone(value.contexts) }
  capturePreviewState(): DivineInterventionPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const divineInterventionSystem = new DivineInterventionSystem()
