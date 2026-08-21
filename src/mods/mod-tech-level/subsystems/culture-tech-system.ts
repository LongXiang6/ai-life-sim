import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { listWorldContexts } from '@/mods/mod-world'
import { DEFAULT_KNOWLEDGE_DOMAINS, KNOWLEDGE_DOMAIN_LABELS } from '../constants'
import type { CultureTechPersistenceState, CultureTechState, CultureTrend, CultureTrendCategory, KnowledgeDomain } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))

const MATURITY: Record<string, Record<string, number>> = {
  prehistoric: { food: 18, materials: 8, energy: 3, health: 5, governance: 8, information: 2, transport: 5, space: 0 },
  ancient: { food: 38, materials: 28, energy: 16, health: 18, governance: 35, information: 18, transport: 24, space: 1 },
  medieval: { food: 45, materials: 37, energy: 22, health: 24, governance: 42, information: 25, transport: 30, space: 2 },
  renaissance: { food: 52, materials: 48, energy: 35, health: 38, governance: 50, information: 40, transport: 42, space: 6 },
  industrial: { food: 63, materials: 68, energy: 66, health: 55, governance: 58, information: 52, transport: 70, space: 18 },
  modern: { food: 78, materials: 80, energy: 78, health: 82, governance: 70, information: 80, transport: 84, space: 55 },
  information: { food: 86, materials: 87, energy: 84, health: 89, governance: 78, information: 94, transport: 90, space: 68 },
  space: { food: 94, materials: 95, energy: 94, health: 95, governance: 88, information: 98, transport: 97, space: 92 },
}

const RESEARCH_CAPACITY: Record<string, number> = {
  prehistoric: 1, ancient: 5, medieval: 9, renaissance: 18, industrial: 38, modern: 68, information: 86, space: 95,
}

function createInitialState(context: RoundContext): CultureTechState {
  const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
  const stage = instance?.worldConfig.civilizationStage ?? 'ancient'
  const baselines = MATURITY[stage] ?? MATURITY.ancient
  const capacity = RESEARCH_CAPACITY[stage] ?? RESEARCH_CAPACITY.ancient
  const domains: KnowledgeDomain[] = DEFAULT_KNOWLEDGE_DOMAINS.map((id) => ({
    id,
    label: KNOWLEDGE_DOMAIN_LABELS[id],
    maturity: baselines[id] ?? 0,
    diffusion: clamp((baselines[id] ?? 0) * 0.78),
    annualResearchCapacity: capacity,
    applications: [],
    updatedAtTotalDays: context.totalDays,
  }))
  return {
    contextId: context.contextId,
    researchCapacity: capacity,
    domains,
    activeTrends: [],
    knowledgeBonus: domains.reduce((sum, item) => sum + item.maturity, 0) / domains.length / 100,
    workQualityBonus: 0,
    lastUpdateTotalDays: context.totalDays,
    activeEvents: [],
  }
}

function validateEvidence(ids: readonly string[], contextId: string): void {
  if (ids.length === 0) throw new Error('知识突破或应用必须引用已确认历史事件')
  for (const id of ids) {
    const event = getHistoricalEvent(id)
    if (!event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId))) throw new Error(`知识事件证据无效：${id}`)
  }
}

export class CultureTechSystem extends BaseSubsystem {
  readonly id = 'culture-tech' as const
  readonly mod = 'mod-tech-level' as const
  readonly label = '知识与技术' as const
  readonly description = '按上下文拥有可组合知识领域、成熟度、扩散度、研究能力和已落地应用' as const
  private states: Record<string, CultureTechState> = {}

  private ensure(context: RoundContext): CultureTechState {
    return this.states[context.contextId] ??= createInitialState(context)
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    // Education is now a regional narrative profile, not an independent runtime owner.
    // Keep the knowledge system's own research baseline and let regional context shape prose.
    const access = 10
    const years = context.daysPassed / 365
    for (const domain of state.domains) {
      const annualGain = (100 - domain.maturity) * (state.researchCapacity / 100) * 0.006
      domain.maturity = clamp(domain.maturity + annualGain * years)
      const diffusionGain = (domain.maturity - domain.diffusion) * (access / 100) * 0.015
      domain.diffusion = clamp(domain.diffusion + diffusionGain * years)
      domain.annualResearchCapacity = state.researchCapacity
      domain.updatedAtTotalDays = context.totalDays
    }
    state.activeTrends = state.activeTrends
      .map((trend) => ({ ...trend, remainingDays: Math.max(0, trend.remainingDays - context.daysPassed) }))
      .filter((trend) => trend.remainingDays > 0)
    state.knowledgeBonus = state.domains.reduce((sum, item) => sum + item.maturity, 0) / state.domains.length / 100
    state.workQualityBonus = state.domains.reduce((sum, item) => sum + item.diffusion, 0) / state.domains.length / 500
    state.activeEvents = []
    state.lastUpdateTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const leading = [...state.domains].sort((a, b) => b.maturity - a.maturity).slice(0, 2).map((item) => `${item.label}${item.maturity.toFixed(0)}`).join('、')
    return { id: this.id, summary: `【知识技术】研究能力 ${state.researchCapacity.toFixed(1)}；领先领域 ${leading}`, data: clone(state) }
  }

  private applyToState(
    state: CultureTechState,
    changes: SubSystemChanges,
    context: RoundContext,
  ): void {
    if (changes.id !== this.id) throw new Error('知识技术指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('知识技术指令上下文不匹配')
    const operation = changes.operation ?? 'research-domain'
    if (operation === 'research-domain' || operation === 'add-application') {
      validateEvidence(changes.evidenceEventIds ?? [], context.contextId)
      const domain = state.domains.find((item) => item.id === changes.targetObjectId)
      if (!domain) throw new Error(`知识领域不存在：${changes.targetObjectId}`)
      if (operation === 'research-domain') {
        if (typeof changes.changes.maturityDelta !== 'number' || changes.changes.maturityDelta <= 0) throw new Error('研究成果必须提供正数成熟度变化')
        domain.maturity = clamp(domain.maturity + changes.changes.maturityDelta)
      } else {
        const application = typeof changes.changes.application === 'string' ? changes.changes.application.trim() : ''
        if (!application) throw new Error('技术应用名称不能为空')
        if (!domain.applications.includes(application)) domain.applications.push(application)
        if (typeof changes.changes.diffusionDelta === 'number') domain.diffusion = clamp(domain.diffusion + changes.changes.diffusionDelta)
      }
      domain.updatedAtTotalDays = context.totalDays
    } else if (operation === 'record-trend') {
      const name = typeof changes.changes.name === 'string' ? changes.changes.name.trim() : ''
      const type = changes.changes.type as CultureTrendCategory
      const durationDays = changes.changes.durationDays
      if (!name || !['art', 'philosophy', 'science', 'military', 'commerce', 'religion'].includes(type) || typeof durationDays !== 'number' || !Number.isInteger(durationDays) || durationDays <= 0) throw new Error('思想传播输入无效')
      const id = changes.targetObjectId ?? `trend:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.activeTrends.length}`
      const trend: CultureTrend = { id, type, name, intensity: clamp(typeof changes.changes.intensity === 'number' ? changes.changes.intensity : 50), remainingDays: durationDays, originContextId: context.contextId }
      state.activeTrends = [...state.activeTrends.filter((item) => item.id !== id), trend]
    } else throw new Error(`未知知识技术操作：${operation}`)
    state.lastUpdateTotalDays = context.totalDays
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    const candidate = clone(this.states[context.contextId] ?? createInitialState(context))
    this.applyToState(candidate, changes, context)
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    this.applyToState(this.ensure(context), changes, context)
  }

  captureTransactionState(): Record<string, CultureTechState> { return clone(this.states) }
  restoreTransactionState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('知识技术事务快照无效')
    this.states = clone(snapshot as Record<string, CultureTechState>)
  }

  capturePersistenceState(): CultureTechPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as CultureTechPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('知识技术持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const cultureTechSystem = new CultureTechSystem()
