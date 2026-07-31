import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { listWorldContexts } from '@/mods/mod-world'
import type { EducationLevel, EducationPersistenceState, EducationState, EducationSystemType } from '../types'

const BASELINES: Record<string, { literacy: number; access: number; capacity: number; type: EducationSystemType }> = {
  prehistoric: { literacy: 0, access: 8, capacity: 1, type: 'oral' },
  ancient: { literacy: 5, access: 8, capacity: 8, type: 'religious' },
  medieval: { literacy: 10, access: 12, capacity: 12, type: 'guild' },
  renaissance: { literacy: 20, access: 22, capacity: 25, type: 'school' },
  industrial: { literacy: 45, access: 50, capacity: 45, type: 'school' },
  modern: { literacy: 86, access: 88, capacity: 72, type: 'school' },
  information: { literacy: 96, access: 95, capacity: 88, type: 'network' },
  space: { literacy: 99, access: 98, capacity: 96, type: 'network' },
}

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))

function levelFor(literacy: number, access: number): EducationLevel {
  if (literacy < 2 || access < 2) return 'none'
  if (literacy < 15 || access < 15) return 'elite'
  if (literacy < 55 || access < 50) return 'basic'
  if (literacy < 92 || access < 90) return 'universal'
  return 'advanced'
}

export class EducationSystem extends BaseSubsystem {
  readonly id = 'education' as const
  readonly mod = 'mod-culture' as const
  readonly label = '知识教育' as const
  readonly description = '按上下文拥有教育与传承方式、识字率、普及度和研究能力；知识状态归文化技术系统' as const
  private states: Record<string, EducationState> = {}

  private ensure(context: RoundContext): EducationState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const stage = instance?.worldConfig.civilizationStage ?? 'ancient'
    const baseline = BASELINES[stage] ?? BASELINES.ancient
    const created: EducationState = {
      contextId: context.contextId,
      systemType: baseline.type,
      institutions: [],
      literacyRate: baseline.literacy,
      educationAccess: baseline.access,
      researchCapacity: baseline.capacity,
      knowledgeSpreadRate: Math.max(0.001, baseline.access / 10_000),
      educationDirection: stage === 'information' || stage === 'space' ? 'scientific' : 'general',
      educationLevel: levelFor(baseline.literacy, baseline.access),
      literacyByClass: {
        elite: clamp(baseline.literacy * 2.5),
        middle: clamp(baseline.literacy * 1.35),
        common: clamp(baseline.literacy * 0.72),
      },
      worldview: instance?.worldConfig.essenceTag ?? context.essenceTag ?? '',
      updatedAtTotalDays: context.totalDays,
    }
    this.states[context.contextId] = created
    return created
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const years = context.daysPassed / 365
    const accessFactor = state.educationAccess / 100
    const annualLiteracyGain = (100 - state.literacyRate) * state.knowledgeSpreadRate * accessFactor
    state.literacyRate = clamp(state.literacyRate + annualLiteracyGain * years)
    state.researchCapacity = clamp(state.researchCapacity + (state.educationAccess - state.researchCapacity) * 0.01 * years)
    state.literacyByClass = {
      elite: clamp(Math.max(state.literacyRate, state.literacyByClass.elite + annualLiteracyGain * years * 0.4)),
      middle: clamp(state.literacyByClass.middle + annualLiteracyGain * years),
      common: clamp(state.literacyByClass.common + annualLiteracyGain * years * 0.85),
    }
    state.educationLevel = levelFor(state.literacyRate, state.educationAccess)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return { id: this.id, summary: `【教育】${state.educationLevel}；识字率 ${state.literacyRate.toFixed(1)}%；普及度 ${state.educationAccess.toFixed(1)}%`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('教育指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('教育指令上下文不匹配')
    const state = this.ensure(context)
    const value = changes.changes
    if (typeof value.literacyRateDelta === 'number') state.literacyRate = clamp(state.literacyRate + value.literacyRateDelta)
    if (typeof value.educationAccessDelta === 'number') state.educationAccess = clamp(state.educationAccess + value.educationAccessDelta)
    if (typeof value.researchCapacityDelta === 'number') state.researchCapacity = clamp(state.researchCapacity + value.researchCapacityDelta)
    if (typeof value.systemType === 'string' && ['oral', 'household', 'guild', 'religious', 'school', 'network'].includes(value.systemType)) state.systemType = value.systemType as EducationSystemType
    if (typeof value.institution === 'string' && value.institution.trim() && !state.institutions.includes(value.institution.trim())) state.institutions.push(value.institution.trim())
    state.educationLevel = levelFor(state.literacyRate, state.educationAccess)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): EducationPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as EducationPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('教育持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): EducationPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const educationSystem = new EducationSystem()
