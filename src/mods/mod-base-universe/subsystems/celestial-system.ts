import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { assertWorldSpatialNode, listWorldContexts } from '@/mods/mod-world'
import type { CelestialPersistenceState, CelestialPhenomenon, CelestialState } from '../types'

const clone = <T>(value: T): T => structuredClone(value)

function validateEvidence(ids: readonly string[], contextId: string): void {
  if (ids.length === 0) throw new Error('特殊天象必须引用已确认历史事件')
  for (const id of ids) {
    const event = getHistoricalEvent(id)
    if (!event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId))) throw new Error(`天象事件证据无效：${id}`)
  }
}

export class CelestialSystem extends BaseSubsystem {
  readonly id = 'celestial' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '天象周期' as const
  readonly description = '按当地历法拥有自然天象周期与有历史证据的特殊现象；玄学解释由 P8 插件消费' as const
  private states: Record<string, CelestialState> = {}

  private ensure(context: RoundContext): CelestialState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    return this.states[context.contextId] = { contextId: context.contextId, currentPhase: 'normal', dayOfLocalYear: 0,
      localYearLength: instance?.record.localCalendar.daysPerYear ?? 365, activePhenomena: [], history: [], updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    state.localYearLength = instance?.record.localCalendar.daysPerYear ?? state.localYearLength
    const localDays = instance?.record.localClock.totalLocalDays ?? context.totalDays
    state.dayOfLocalYear = ((localDays % state.localYearLength) + state.localYearLength) % state.localYearLength
    const expired = state.activePhenomena.filter((item) => item.endsAtTotalDays <= context.totalDays)
    if (expired.length) state.history.push(...expired.map((item) => ({ phenomenonId: item.id, name: item.name, startedAtTotalDays: item.startsAtTotalDays, endedAtTotalDays: item.endsAtTotalDays })))
    state.activePhenomena = state.activePhenomena.filter((item) => item.endsAtTotalDays > context.totalDays)
    state.currentPhase = state.activePhenomena.length ? 'event' : 'normal'
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const active = state.activePhenomena.map((item) => item.name).join('、')
    return { id: this.id, summary: `【天象】当地年第 ${Math.floor(state.dayOfLocalYear) + 1}/${state.localYearLength} 日${active ? `；${active}` : ''}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('天象指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('天象指令上下文不匹配')
    const state = this.ensure(context)
    if ((changes.operation ?? 'record-phenomenon') === 'record-phenomenon') {
      validateEvidence(changes.evidenceEventIds ?? [], context.contextId)
      const name = typeof changes.changes.name === 'string' ? changes.changes.name.trim() : ''
      const description = typeof changes.changes.description === 'string' ? changes.changes.description.trim() : ''
      const durationDays = changes.changes.durationDays
      const nodes = Array.isArray(changes.changes.affectedNodeIds) ? changes.changes.affectedNodeIds.filter((item): item is string => typeof item === 'string') : []
      if (!name || !description || typeof durationDays !== 'number' || !Number.isInteger(durationDays) || durationDays <= 0) throw new Error('特殊天象输入无效')
      nodes.forEach((nodeId) => assertWorldSpatialNode(context.contextId, nodeId))
      const id = changes.targetObjectId ?? `celestial:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.activePhenomena.length}`
      const phenomenon: CelestialPhenomenon = { id, name, description, affectedNodeIds: nodes, startsAtTotalDays: context.totalDays,
        endsAtTotalDays: context.totalDays + durationDays, evidenceEventIds: [...(changes.evidenceEventIds ?? [])] }
      state.activePhenomena = [...state.activePhenomena.filter((item) => item.id !== id), phenomenon]
      state.currentPhase = 'event'
    } else if (changes.operation === 'resolve-phenomenon') {
      state.activePhenomena = state.activePhenomena.filter((item) => item.id !== changes.targetObjectId)
      state.currentPhase = state.activePhenomena.length ? 'event' : 'normal'
    } else throw new Error(`未知天象操作：${changes.operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): CelestialPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as CelestialPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('天象持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): CelestialPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const celestialSystem = new CelestialSystem()
