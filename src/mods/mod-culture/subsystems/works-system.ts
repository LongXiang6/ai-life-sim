import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import type { WorkCategory, WorksPersistenceState, WorksState } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))
const CATEGORIES = new Set<WorkCategory>(['biography', 'novel', 'treatise', 'poetry', 'art', 'craft', 'code', 'paper', 'holo'])

export class WorksSystem extends BaseSubsystem {
  readonly id = 'works' as const
  readonly mod = 'mod-culture' as const
  readonly label = '文化作品' as const
  readonly description = '拥有作品稳定身份、作者、创作进度、完成状态、影响力与跨世界来源' as const
  private states: Record<string, WorksState> = {}

  private ensure(context: RoundContext): WorksState {
    return this.states[context.contextId] ??= { contextId: context.contextId, works: [], nextId: 1, updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const decay = context.daysPassed / 365 * 0.2
    for (const work of state.works) if (work.status === 'completed') work.influence = clamp(work.influence - decay)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const active = state.works.filter((work) => work.status === 'in_progress').length
    const completed = state.works.filter((work) => work.status === 'completed').length
    return { id: this.id, summary: `【作品】创作中 ${active}；已完成 ${completed}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('作品指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('作品指令上下文不匹配')
    const state = this.ensure(context)
    const operation = changes.operation ?? 'progress'
    if (operation === 'create') {
      const title = typeof changes.changes.title === 'string' ? changes.changes.title.trim() : ''
      const category = changes.changes.category as WorkCategory
      if (!title || !CATEGORIES.has(category)) throw new Error('创建作品必须提供标题和合法类别')
      const id = `work:${encodeURIComponent(context.contextId)}:${state.nextId}`
      const authors = Array.isArray(changes.changes.authorEntityIds)
        ? changes.changes.authorEntityIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        : [context.characterId]
      state.works.push({ id, title, category, status: 'in_progress', progress: 0, authorEntityIds: authors,
        originContextId: context.contextId, startedAtTotalDays: context.totalDays, influence: 0,
        tags: Array.isArray(changes.changes.tags) ? changes.changes.tags.filter((item): item is string => typeof item === 'string') : [] })
      state.nextId += 1
    } else {
      const targetId = changes.targetObjectId ?? (typeof changes.changes.workId === 'string' ? changes.changes.workId : '')
      const work = state.works.find((item) => item.id === targetId)
      if (!work) throw new Error(`作品不存在：${targetId}`)
      if (operation === 'progress') {
        const delta = changes.changes.progressDelta
        if (typeof delta !== 'number' || !Number.isFinite(delta) || delta <= 0) throw new Error('作品推进必须提供正数进度')
        work.progress = clamp(work.progress + delta)
        if (work.progress >= 100) { work.status = 'completed'; work.completedAtTotalDays = context.totalDays }
      } else if (operation === 'complete') {
        work.progress = 100; work.status = 'completed'; work.completedAtTotalDays = context.totalDays
      } else if (operation === 'lose') {
        work.status = 'lost'
      } else if (operation === 'influence') {
        if (typeof changes.changes.influenceDelta !== 'number') throw new Error('作品影响变化缺少数值')
        work.influence = clamp(work.influence + changes.changes.influenceDelta)
      } else throw new Error(`未知作品操作：${operation}`)
    }
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): WorksPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as WorksPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('作品持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const worksSystem = new WorksSystem()
