import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { contextHasCapability } from '@/mods/mod-world'
import type { FateProphecyPersistenceState, FateProphecyState, Prophecy, ProphecyOmenEvent, ProphecyOmenStage, ProphecySource } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const SOURCES = new Set<ProphecySource>(['celestial', 'oracle', 'dream', 'divine', 'artifact'])
const OMENS: Array<{ threshold: number; stage: ProphecyOmenStage }> = [{ threshold: 25, stage: 'omen_25' }, { threshold: 50, stage: 'omen_50' }, { threshold: 75, stage: 'omen_75' }]

function validateEvidence(ids: readonly string[], contextId: string): void {
  if (ids.length === 0) throw new Error('预言创建或终态必须引用已确认历史事件')
  for (const id of ids) {
    const event = getHistoricalEvent(id)
    if (!event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId))) throw new Error(`预言事件证据无效：${id}`)
  }
}

export class FateProphecySystem extends BaseSubsystem {
  readonly id = 'fate-prophecy' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '命运预言' as const
  readonly description = '可选地拥有预言身份、时间进度和有事件证据的应验或打破终态' as const
  private states: Record<string, FateProphecyState> = {}

  private ensure(context: RoundContext): FateProphecyState {
    return this.states[context.contextId] ??= { contextId: context.contextId, enabled: contextHasCapability(context.contextId, 'supernatural'),
      prophecies: [], causalityPenalty: 0, recentFulfilled: [], recentBroken: [], recentOmens: [], updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    state.enabled = contextHasCapability(context.contextId, 'supernatural')
    state.recentFulfilled = []; state.recentBroken = []; state.recentOmens = []
    if (!state.enabled || context.daysPassed <= 0) { state.updatedAtTotalDays = context.totalDays; return }
    for (const prophecy of state.prophecies) {
      if (prophecy.status !== 'active') continue
      const oldProgress = prophecy.progressFulfill
      const duration = Math.max(1, prophecy.targetAtTotalDays - prophecy.createdAtTotalDays)
      prophecy.progressFulfill = Math.max(0, Math.min(100, (context.totalDays - prophecy.createdAtTotalDays) / duration * 100))
      for (const omen of OMENS) {
        if (oldProgress < omen.threshold && prophecy.progressFulfill >= omen.threshold) {
          const event: ProphecyOmenEvent = { id: `omen:${prophecy.id}:${omen.threshold}`, prophecyId: prophecy.id,
            title: `${prophecy.title}的预兆`, stage: omen.stage, description: `预言时间进度达到 ${omen.threshold}%`, totalDays: context.totalDays }
          state.recentOmens.push(event)
        }
      }
    }
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!state.enabled) return { id: this.id, summary: '', data: clone(state) }
    const active = state.prophecies.filter((item) => item.status === 'active')
    return { id: this.id, summary: `【预言】活动 ${active.length}；已应验 ${state.prophecies.filter((item) => item.status === 'fulfilled').length}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('预言指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('预言指令上下文不匹配')
    const state = this.ensure(context)
    if (!state.enabled) throw new Error('当前上下文未启用超凡预言能力')
    const operation = changes.operation ?? 'create'
    validateEvidence(changes.evidenceEventIds ?? [], context.contextId)
    if (operation === 'create') {
      const title = typeof changes.changes.title === 'string' ? changes.changes.title.trim() : ''
      const description = typeof changes.changes.description === 'string' ? changes.changes.description.trim() : ''
      const source = changes.changes.source as ProphecySource
      const targetDays = changes.changes.targetDays
      if (!title || !description || !SOURCES.has(source) || typeof targetDays !== 'number' || !Number.isInteger(targetDays) || targetDays <= 0) throw new Error('预言输入无效')
      const id = changes.targetObjectId ?? `prophecy:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.prophecies.length}`
      const prophecy: Prophecy = { id, title, description, source,
        mutability: Math.max(0, Math.min(1, typeof changes.changes.mutability === 'number' ? changes.changes.mutability : 0.5)),
        progressFulfill: 0, status: 'active', createdAtTotalDays: context.totalDays, targetAtTotalDays: context.totalDays + targetDays,
        relatedEventIds: [...(changes.evidenceEventIds ?? [])] }
      state.prophecies = [...state.prophecies.filter((item) => item.id !== id), prophecy]
    } else {
      const prophecy = state.prophecies.find((item) => item.id === changes.targetObjectId)
      if (!prophecy || prophecy.status !== 'active') throw new Error(`活动预言不存在：${changes.targetObjectId}`)
      if (operation === 'fulfill') { prophecy.status = 'fulfilled'; prophecy.progressFulfill = 100; state.recentFulfilled = [clone(prophecy)] }
      else if (operation === 'break') { prophecy.status = 'broken'; state.causalityPenalty += Math.round((1 - prophecy.mutability) * 10); state.recentBroken = [clone(prophecy)] }
      else throw new Error(`未知预言操作：${operation}`)
      prophecy.relatedEventIds = [...new Set([...prophecy.relatedEventIds, ...(changes.evidenceEventIds ?? [])])]
    }
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): FateProphecyPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as FateProphecyPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('预言持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const fateProphecySystem = new FateProphecySystem()
