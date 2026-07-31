import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { CONFLICT_PHASE_LABELS, CONFLICT_PHASE_ORDER } from '../constants'
import type { ConflictCyclePersistenceState, ConflictCycleState, ConflictPhase, ConflictRecord } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))

function validateEvidence(ids: readonly string[], contextId: string): void {
  if (ids.length === 0) throw new Error('冲突迁移必须引用已确认历史事件')
  for (const id of ids) {
    const event = getHistoricalEvent(id)
    if (!event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId))) throw new Error(`冲突事件证据无效：${id}`)
  }
}

export class ConflictCycleSystem extends BaseSubsystem {
  readonly id = 'conflict-cycle' as const
  readonly mod = 'mod-politics' as const
  readonly label = '冲突状态机' as const
  readonly description = '拥有通用冲突阶段与张力，不重复拥有政治关系；阶段迁移必须由历史事件确认' as const
  private states: Record<string, ConflictCycleState> = {}

  private ensure(context: RoundContext): ConflictCycleState {
    return this.states[context.contextId] ??= { contextId: context.contextId, conflicts: [], updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    for (const conflict of state.conflicts) {
      if (conflict.phase === 'resolved') continue
      conflict.phaseProgress = clamp(conflict.phaseProgress + context.daysPassed / 365 * Math.max(1, conflict.tension / 20))
      conflict.updatedAtTotalDays = context.totalDays
    }
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const active = state.conflicts.filter((item) => item.phase !== 'resolved')
    const critical = [...active].sort((a, b) => b.tension - a.tension)[0]
    return { id: this.id, summary: active.length === 0 ? '【冲突】当前无活动冲突' : `【冲突】活动 ${active.length}；${critical.theme} ${CONFLICT_PHASE_LABELS[critical.phase]} 张力 ${critical.tension.toFixed(0)}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('冲突指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('冲突指令上下文不匹配')
    const state = this.ensure(context)
    const operation = changes.operation ?? 'adjust-tension'
    if (operation === 'create') {
      const evidence = changes.evidenceEventIds ?? []
      validateEvidence(evidence, context.contextId)
      const theme = typeof changes.changes.theme === 'string' ? changes.changes.theme.trim() : ''
      const parties = Array.isArray(changes.changes.partyEntityIds) ? changes.changes.partyEntityIds.filter((item): item is string => typeof item === 'string') : []
      if (!theme || parties.length < 2) throw new Error('创建冲突必须提供主题和至少两个参与方')
      const id = changes.targetObjectId ?? `conflict:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.conflicts.length}`
      const conflict: ConflictRecord = { id, theme, partyEntityIds: parties, phase: 'forming', phaseProgress: 0,
        tension: clamp(typeof changes.changes.tension === 'number' ? changes.changes.tension : 20), evidenceEventIds: [...evidence],
        startedAtTotalDays: context.totalDays, updatedAtTotalDays: context.totalDays }
      state.conflicts = [...state.conflicts.filter((item) => item.id !== id), conflict]
    } else {
      const conflict = state.conflicts.find((item) => item.id === changes.targetObjectId)
      if (!conflict) throw new Error(`冲突不存在：${changes.targetObjectId}`)
      if (operation === 'adjust-tension') {
        if (typeof changes.changes.tensionDelta !== 'number') throw new Error('冲突张力变化缺少数值')
        conflict.tension = clamp(conflict.tension + changes.changes.tensionDelta)
      } else if (operation === 'transition') {
        validateEvidence(changes.evidenceEventIds ?? [], context.contextId)
        const next = changes.changes.phase as ConflictPhase
        const currentIndex = CONFLICT_PHASE_ORDER.indexOf(conflict.phase)
        const nextIndex = CONFLICT_PHASE_ORDER.indexOf(next)
        if (nextIndex < 0 || nextIndex !== currentIndex + 1) throw new Error('冲突阶段只能按状态机前进一阶段')
        conflict.phase = next; conflict.phaseProgress = 0
        conflict.evidenceEventIds = [...new Set([...conflict.evidenceEventIds, ...(changes.evidenceEventIds ?? [])])]
      } else throw new Error(`未知冲突操作：${operation}`)
      conflict.updatedAtTotalDays = context.totalDays
    }
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): ConflictCyclePersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as ConflictCyclePersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('冲突持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): ConflictCyclePersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const conflictCycleSystem = new ConflictCycleSystem()
