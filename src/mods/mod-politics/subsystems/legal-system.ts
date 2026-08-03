import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { listWorldContexts } from '@/mods/mod-world'
import { LEGAL_SYSTEM_LABELS } from '../constants'
import type { LawCategory, LawEntry, LegalPersistenceState, LegalState, LegalSystemType } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))
const LAW_CATEGORIES = new Set<LawCategory>(['criminal', 'civil', 'economic', 'religious', 'military', 'custom'])

function systemFor(stage: string): LegalSystemType {
  if (stage === 'prehistoric') return 'normative'
  if (['ancient', 'medieval'].includes(stage)) return 'customary'
  if (stage === 'space') return 'statutory'
  return 'statutory'
}

function validateEvidence(ids: readonly string[], contextId: string): void {
  if (ids.length === 0) throw new Error('制度变更必须引用已确认历史事件')
  for (const id of ids) {
    const event = getHistoricalEvent(id)
    if (!event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId))) throw new Error(`制度事件证据无效：${id}`)
  }
}

export class LegalSystem extends BaseSubsystem {
  readonly id = 'legal' as const
  readonly mod = 'mod-politics' as const
  readonly label = '法律与规范' as const
  readonly description = '拥有当地法律或共同规范、执行程度和腐败状态；制度变化必须有历史事件证据' as const
  private states: Record<string, LegalState> = {}

  private ensure(context: RoundContext): LegalState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const stage = instance?.worldConfig.civilizationStage ?? 'ancient'
    return this.states[context.contextId] = { contextId: context.contextId, systemType: systemFor(stage), laws: [],
      enforcementLevel: stage === 'prehistoric' ? 35 : stage === 'modern' || stage === 'information' ? 70 : 50,
      corruption: stage === 'modern' || stage === 'information' ? 20 : 35, updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const targetCorruption = Math.max(0, 45 - state.enforcementLevel * 0.35)
    state.corruption = clamp(state.corruption + (targetCorruption - state.corruption) * context.daysPassed / 365 * 0.01)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return { id: this.id, summary: `【制度】${LEGAL_SYSTEM_LABELS[state.systemType]}；有效条目 ${state.laws.filter((law) => law.active).length}；执行 ${state.enforcementLevel.toFixed(1)}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('制度指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('制度指令上下文不匹配')
    const state = this.ensure(context)
    const operation = changes.operation ?? 'adjust-institution'
    if (operation === 'adjust-institution') {
      if (typeof changes.changes.enforcementDelta === 'number') state.enforcementLevel = clamp(state.enforcementLevel + changes.changes.enforcementDelta)
      if (typeof changes.changes.corruptionDelta === 'number') state.corruption = clamp(state.corruption + changes.changes.corruptionDelta)
      if (typeof changes.changes.systemType === 'string' && Object.hasOwn(LEGAL_SYSTEM_LABELS, changes.changes.systemType)) state.systemType = changes.changes.systemType as LegalSystemType
    } else if (operation === 'enact') {
      const evidence = changes.evidenceEventIds ?? []
      validateEvidence(evidence, context.contextId)
      const name = typeof changes.changes.name === 'string' ? changes.changes.name.trim() : ''
      const category = changes.changes.category as LawCategory
      if (!name || !LAW_CATEGORIES.has(category) || typeof changes.changes.severity !== 'number') throw new Error('制度条目输入无效')
      const id = changes.targetObjectId ?? `law:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.laws.length}`
      const entry: LawEntry = { id, name, category, severity: clamp(changes.changes.severity), active: true,
        consequence: typeof changes.changes.consequence === 'string' ? changes.changes.consequence : '',
        enactedAtTotalDays: context.totalDays, evidenceEventIds: [...evidence] }
      state.laws = [...state.laws.filter((law) => law.id !== id), entry]
    } else if (operation === 'repeal') {
      validateEvidence(changes.evidenceEventIds ?? [], context.contextId)
      const law = state.laws.find((item) => item.id === changes.targetObjectId)
      if (!law) throw new Error(`制度条目不存在：${changes.targetObjectId}`)
      law.active = false
    } else throw new Error(`未知制度操作：${operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): LegalPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as LegalPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('制度持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const legalSystem = new LegalSystem()
