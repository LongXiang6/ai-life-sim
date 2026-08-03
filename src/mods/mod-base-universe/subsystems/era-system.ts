import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { listWorldContexts } from '@/mods/mod-world'
import type { EraPersistenceState, EraPhase, EraState } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
function phaseFor(fraction: number): EraPhase { return fraction < 0.1 ? 'opening' : fraction < 0.7 ? 'mid' : fraction < 0.95 ? 'late' : 'transition' }

export class EraSystem extends BaseSubsystem {
  readonly id = 'era' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '当地纪元' as const
  readonly description = '把上下文当地时钟投影为纪元年与年内阶段；不拥有或修改全局时间' as const
  private states: Record<string, EraState> = {}

  private ensure(context: RoundContext): EraState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    return this.states[context.contextId] = { contextId: context.contextId, currentEraName: instance?.eraName || instance?.record.localCalendar.displayName || '当地纪元',
      anchorYear: instance?.eraStartYear ?? context.eraStartYear ?? 0, localYear: instance?.eraStartYear ?? context.eraStartYear ?? 0,
      dayOfYear: 0, daysPerYear: instance?.record.localCalendar.daysPerYear ?? 365, phase: 'opening', updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const localDays = instance?.record.localClock.totalLocalDays ?? context.totalDays
    state.daysPerYear = instance?.record.localCalendar.daysPerYear ?? state.daysPerYear
    state.anchorYear = instance?.eraStartYear ?? context.eraStartYear ?? state.anchorYear
    state.currentEraName = instance?.eraName || instance?.record.localCalendar.displayName || state.currentEraName
    state.localYear = state.anchorYear + Math.floor(localDays / state.daysPerYear)
    state.dayOfYear = ((localDays % state.daysPerYear) + state.daysPerYear) % state.daysPerYear
    state.phase = phaseFor(state.dayOfYear / state.daysPerYear)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return { id: this.id, summary: `【纪元】${state.currentEraName} ${state.localYear} 年，第 ${Math.floor(state.dayOfYear) + 1} 日`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    throw new Error('纪元是当地时钟只读投影，不接受叙事写入')
  }
  capturePersistenceState(): EraPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as EraPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('纪元持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const eraSystem = new EraSystem()
