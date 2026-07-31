import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import type { AnomalyPersistenceState, AnomalySeverity, AnomalyState, AnomalyZone } from '../types'
import { assertContext, assertEvidence, assertNode, adjacentNodes, clone, hasSupernatural } from './p8-runtime'

function initialState(context: RoundContext): AnomalyState { return { contextId: context.contextId, enabled: hasSupernatural(context.contextId), zones: [], globalInstability: 0, updatedAtTotalDays: context.totalDays } }

export class AnomalyPhenomenaSystem extends BaseSubsystem {
  readonly id = 'anomaly-phenomena' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '异常现象' as const
  readonly description = '使用统一空间图节点记录有证据的异常区域，不自建坐标体系或随机事实' as const
  private states: Record<string, AnomalyState> = {}
  private ensure(context: RoundContext): AnomalyState { return this.states[context.contextId] ??= initialState(context) }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    state.enabled = hasSupernatural(context.contextId)
    if (!state.enabled) { state.updatedAtTotalDays = context.totalDays; return }
    const active = state.zones.filter((item) => item.active)
    state.globalInstability = Math.max(0, Math.min(100, state.globalInstability + active.length * context.daysPassed / 365 - (active.length === 0 ? context.daysPassed / 365 : 0)))
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    if (!state.enabled) return { id: this.id, summary: '', data: structuredClone(state) }
    return { id: this.id, summary: `【异常】活动区域 ${state.zones.filter((item) => item.active).length}；不稳定度 ${Math.round(state.globalInstability)}`, data: structuredClone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('异常指令目标不匹配')
    assertContext(changes, context, '异常')
    const state = this.ensure(context)
    if (!state.enabled) throw new Error('当前上下文未启用异常能力')
    const operation = changes.operation ?? 'create'
    if (operation === 'create') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '异常')
      const nodeId = typeof changes.changes.nodeId === 'string' ? changes.changes.nodeId : ''
      const name = typeof changes.changes.name === 'string' ? changes.changes.name.trim() : ''
      const description = typeof changes.changes.description === 'string' ? changes.changes.description.trim() : ''
      const ruleDescription = typeof changes.changes.ruleDescription === 'string' ? changes.changes.ruleDescription.trim() : description
      const severity = changes.changes.severity as AnomalySeverity
      if (!nodeId || !name || !description || !['mild', 'dangerous', 'deadly'].includes(severity)) throw new Error('异常创建输入无效')
      assertNode(context.contextId, nodeId)
      const zone: AnomalyZone = { id: changes.targetObjectId ?? `anomaly:${context.contextId}:${context.totalDays}:${state.zones.length}`, contextId: context.contextId, nodeId, name, description, ruleDescription, severity, spreadCount: 0, active: true, createdAtTotalDays: context.totalDays, lastSpreadAtTotalDays: context.totalDays, evidenceEventIds: [...new Set(changes.evidenceEventIds ?? [])] }
      state.zones = [...state.zones.filter((item) => item.id !== zone.id), zone]
    } else if (operation === 'spread') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '异常')
      const source = state.zones.find((item) => item.id === changes.targetObjectId && item.active)
      const nodeId = typeof changes.changes.nodeId === 'string' ? changes.changes.nodeId : ''
      if (!source || !nodeId) throw new Error('异常扩散来源或目标无效')
      assertNode(context.contextId, nodeId)
      if (!adjacentNodes(context.contextId, source.nodeId).includes(nodeId)) throw new Error('异常只能扩散到相邻空间节点')
      const zone: AnomalyZone = { ...clone(source), id: `${source.id}:spread:${source.spreadCount + 1}`, nodeId, spreadCount: source.spreadCount + 1, createdAtTotalDays: context.totalDays, lastSpreadAtTotalDays: context.totalDays, evidenceEventIds: [...new Set([...source.evidenceEventIds, ...(changes.evidenceEventIds ?? [])])] }
      state.zones.push(zone)
    } else if (operation === 'close') {
      assertEvidence(changes.evidenceEventIds ?? [], context.contextId, '异常')
      const zone = state.zones.find((item) => item.id === changes.targetObjectId)
      if (!zone) throw new Error(`异常区域不存在：${changes.targetObjectId}`)
      zone.active = false; zone.evidenceEventIds = [...new Set([...zone.evidenceEventIds, ...(changes.evidenceEventIds ?? [])])]
    } else throw new Error(`未知异常操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  checkZoneHazard(contextId: string, nodeId: string): { inZone: boolean; severity?: AnomalySeverity; ruleDescription?: string } {
    const zone = this.states[contextId]?.zones.find((item) => item.active && item.nodeId === nodeId)
    return zone ? { inZone: true, severity: zone.severity, ruleDescription: zone.ruleDescription } : { inZone: false }
  }
  capturePersistenceState(): AnomalyPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { if (snapshot === undefined) { this.states = {}; return }; const value = snapshot as AnomalyPersistenceState; if (value.schemaVersion !== 1 || !value.contexts) throw new Error('异常持久化快照无效'); this.states = clone(value.contexts) }
  capturePreviewState(): AnomalyPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const anomalyPhenomenaSystem = new AnomalyPhenomenaSystem()
