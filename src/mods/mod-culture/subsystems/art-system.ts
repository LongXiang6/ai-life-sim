import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { listWorldContexts } from '@/mods/mod-world'
import type { ArtPersistenceState, ArtState } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))

export class ArtSystem extends BaseSubsystem {
  readonly id = 'art' as const
  readonly mod = 'mod-culture' as const
  readonly label = '艺术生态' as const
  readonly description = '拥有当地艺术流派、赞助、声望和创新环境；具体作品由作品系统拥有' as const
  private states: Record<string, ArtState> = {}

  private ensure(context: RoundContext): ArtState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const stage = instance?.worldConfig.civilizationStage ?? 'ancient'
    const styles = stage === 'information' || stage === 'space' ? ['digital'] : stage === 'modern' ? ['modern'] : ['traditional']
    return this.states[context.contextId] = {
      contextId: context.contextId, currentStyles: styles, patronageLevel: 25, prestige: 15,
      innovationIndex: stage === 'information' || stage === 'space' ? 60 : 20,
      worldview: instance?.worldConfig.essenceTag ?? '', updatedAtTotalDays: context.totalDays,
    }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const years = context.daysPassed / 365
    const culture = context.subsystemStates.culture?.data as Partial<{ artProsperity: number }> | undefined
    const prosperity = typeof culture?.artProsperity === 'number' ? culture.artProsperity : 30
    state.prestige = clamp(state.prestige + (state.patronageLevel + prosperity - state.prestige * 2) * 0.01 * years)
    state.innovationIndex = clamp(state.innovationIndex + (state.patronageLevel - state.innovationIndex) * 0.005 * years)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return { id: this.id, summary: `【艺术】流派 ${state.currentStyles.join('、') || '未形成'}；声望 ${state.prestige.toFixed(1)}；创新 ${state.innovationIndex.toFixed(1)}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('艺术指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('艺术指令上下文不匹配')
    const state = this.ensure(context)
    if (typeof changes.changes.patronageDelta === 'number') state.patronageLevel = clamp(state.patronageLevel + changes.changes.patronageDelta)
    if (typeof changes.changes.prestigeDelta === 'number') state.prestige = clamp(state.prestige + changes.changes.prestigeDelta)
    if (typeof changes.changes.innovationDelta === 'number') state.innovationIndex = clamp(state.innovationIndex + changes.changes.innovationDelta)
    if (typeof changes.changes.style === 'string' && changes.changes.style.trim() && !state.currentStyles.includes(changes.changes.style.trim())) state.currentStyles.push(changes.changes.style.trim())
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): ArtPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as ArtPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('艺术持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): ArtPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const artSystem = new ArtSystem()
