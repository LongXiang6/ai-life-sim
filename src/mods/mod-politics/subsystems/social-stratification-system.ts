import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { listWorldContexts } from '@/mods/mod-world'
import type { SocialGroup, SocialStratificationPersistenceState, SocialStratificationState } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))

function groupsFor(stage: string): SocialGroup[] {
  if (stage === 'prehistoric') return [
    { id: 'community-leadership', label: '共同体协调者', populationShare: 0.05, privilegeIndex: 45, mobilityBarrier: 20 },
    { id: 'specialists', label: '专门劳动者', populationShare: 0.15, privilegeIndex: 35, mobilityBarrier: 15 },
    { id: 'community-members', label: '共同体成员', populationShare: 0.8, privilegeIndex: 25, mobilityBarrier: 10 },
  ]
  if (['ancient', 'medieval', 'renaissance'].includes(stage)) return [
    { id: 'ruling', label: '统治群体', populationShare: 0.02, privilegeIndex: 90, mobilityBarrier: 90 },
    { id: 'elite', label: '地方精英', populationShare: 0.08, privilegeIndex: 72, mobilityBarrier: 72 },
    { id: 'urban', label: '城镇居民', populationShare: 0.2, privilegeIndex: 45, mobilityBarrier: 48 },
    { id: 'producers', label: '基层生产者', populationShare: 0.7, privilegeIndex: 18, mobilityBarrier: 68 },
  ]
  return [
    { id: 'high-resource', label: '高资源群体', populationShare: 0.1, privilegeIndex: 82, mobilityBarrier: 55 },
    { id: 'middle-resource', label: '中等资源群体', populationShare: 0.5, privilegeIndex: 50, mobilityBarrier: 35 },
    { id: 'low-resource', label: '低资源群体', populationShare: 0.4, privilegeIndex: 22, mobilityBarrier: 62 },
  ]
}

function normalizeShares(groups: SocialGroup[]): void {
  const total = groups.reduce((sum, group) => sum + Math.max(0, group.populationShare), 0)
  if (total <= 0) throw new Error('社会群体人口比例总和必须大于零')
  groups.forEach((group) => { group.populationShare = Math.max(0, group.populationShare) / total })
}

export class SocialStratificationSystem extends BaseSubsystem {
  readonly id = 'social-stratification' as const
  readonly mod = 'mod-politics' as const
  readonly label = '社会结构' as const
  readonly description = '拥有可配置社会群体、人口比例、特权与流动壁垒，不预设封建阶级模型' as const
  private states: Record<string, SocialStratificationState> = {}

  private ensure(context: RoundContext): SocialStratificationState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const groups = groupsFor(instance?.worldConfig.civilizationStage ?? 'ancient')
    return this.states[context.contextId] = { contextId: context.contextId, groups, playerGroupId: groups.at(-1)?.id ?? null,
      mobilityIndex: clamp(100 - groups.reduce((sum, group) => sum + group.mobilityBarrier * group.populationShare, 0)), updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const education = context.subsystemStates.education?.data as Partial<{ educationAccess: number }> | undefined
    const access = typeof education?.educationAccess === 'number' ? education.educationAccess : 20
    const target = clamp(access * 0.65 + 20)
    state.mobilityIndex = clamp(state.mobilityIndex + (target - state.mobilityIndex) * context.daysPassed / 365 * 0.01)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return { id: this.id, summary: `【社会结构】群体 ${state.groups.length}；流动性 ${state.mobilityIndex.toFixed(1)}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('社会结构指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('社会结构指令上下文不匹配')
    const state = this.ensure(context)
    const group = state.groups.find((item) => item.id === changes.targetObjectId)
    if (!group) throw new Error(`社会群体不存在：${changes.targetObjectId}`)
    if (typeof changes.changes.populationShareDelta === 'number') group.populationShare = Math.max(0, group.populationShare + changes.changes.populationShareDelta)
    if (typeof changes.changes.privilegeDelta === 'number') group.privilegeIndex = clamp(group.privilegeIndex + changes.changes.privilegeDelta)
    if (typeof changes.changes.mobilityBarrierDelta === 'number') group.mobilityBarrier = clamp(group.mobilityBarrier + changes.changes.mobilityBarrierDelta)
    normalizeShares(state.groups)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): SocialStratificationPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as SocialStratificationPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('社会结构持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): SocialStratificationPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const socialStratificationSystem = new SocialStratificationSystem()
