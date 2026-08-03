import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { contextHasCapability, listWorldContexts } from '@/mods/mod-world'
import type { DeityRecord, DivinePersistenceState, DivineState } from '../types'

const clone = <T>(value: T): T => structuredClone(value)

function supportsDeities(contextId: string): boolean {
  if (!contextHasCapability(contextId, 'supernatural')) return false
  const instance = listWorldContexts().find((item) => item.record.id === contextId)
  const tags = `${instance?.worldConfig.powerSystemTag ?? ''}+${instance?.worldConfig.essenceTag ?? ''}`.toLowerCase()
  return ['faith', 'myth', 'divine', 'cultivation', 'xuanhuan', 'fantasy'].some((tag) => tags.includes(tag))
}

function validateEvidence(ids: readonly string[], contextId: string): void {
  if (ids.length === 0) throw new Error('神祇变更必须引用已确认历史事件')
  for (const id of ids) {
    const event = getHistoricalEvent(id)
    if (!event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId))) throw new Error(`神祇事件证据无效：${id}`)
  }
}

export class DivineCreationSystem extends BaseSubsystem {
  readonly id = 'divine-creation' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '神祇体系' as const
  readonly description = '可选地拥有神祇身份、领域与存续状态；神迹事件由神明干预插件提供' as const
  private states: Record<string, DivineState> = {}

  private ensure(context: RoundContext): DivineState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    return this.states[context.contextId] = { contextId: context.contextId, initialized: true, enabled: supportsDeities(context.contextId),
      deities: [], worldview: instance?.worldConfig.essenceTag, updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void { const state = this.ensure(context); state.enabled = supportsDeities(context.contextId); state.updatedAtTotalDays = context.totalDays }
  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!state.enabled) return { id: this.id, summary: '', data: clone(state) }
    return { id: this.id, summary: `【神祇】活动神祇 ${state.deities.filter((item) => item.status === 'active').length}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('神祇指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('神祇指令上下文不匹配')
    const state = this.ensure(context)
    if (!state.enabled) throw new Error('当前上下文未启用神祇能力')
    validateEvidence(changes.evidenceEventIds ?? [], context.contextId)
    const operation = changes.operation ?? 'register'
    if (operation === 'register') {
      const name = typeof changes.changes.name === 'string' ? changes.changes.name.trim() : ''
      const domains = Array.isArray(changes.changes.domains) ? changes.changes.domains.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
      if (!name || domains.length === 0) throw new Error('神祇登记必须提供名称和领域')
      const id = changes.targetObjectId ?? `deity:${encodeURIComponent(context.contextId)}:${encodeURIComponent(name)}`
      const deity: DeityRecord = { id, name, domains, status: 'active', evidenceEventIds: [...(changes.evidenceEventIds ?? [])] }
      state.deities = [...state.deities.filter((item) => item.id !== id), deity]
    } else if (operation === 'depart') {
      const deity = state.deities.find((item) => item.id === changes.targetObjectId)
      if (!deity) throw new Error(`神祇不存在：${changes.targetObjectId}`)
      deity.status = 'departed'
      deity.evidenceEventIds = [...new Set([...deity.evidenceEventIds, ...(changes.evidenceEventIds ?? [])])]
    } else throw new Error(`未知神祇操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): DivinePersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as DivinePersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('神祇持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const divineCreationSystem = new DivineCreationSystem()
