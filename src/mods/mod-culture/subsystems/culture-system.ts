import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { listWorldContexts } from '@/mods/mod-world'
import type { CulturalValue, CulturePersistenceState, CultureState } from '../types'

const VALUES: CulturalValue[] = ['collectivism', 'individualism', 'hierarchy', 'egalitarianism', 'militarism', 'pacifism', 'spiritualism', 'materialism']
const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(0, Math.min(100, value))

export class CultureSystem extends BaseSubsystem {
  readonly id = 'culture' as const
  readonly mod = 'mod-culture' as const
  readonly label = '文化与公共价值' as const
  readonly description = '拥有当地文化身份、传统、习俗、公共价值和代际变化；不拥有具体作品或人物关系' as const
  private states: Record<string, CultureState> = {}

  private ensure(context: RoundContext): CultureState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const stage = instance?.worldConfig.civilizationStage ?? 'ancient'
    const hierarchy = ['ancient', 'medieval'].includes(stage) ? 70 : stage === 'modern' || stage === 'information' ? 42 : 55
    const spiritual = ['prehistoric', 'ancient', 'medieval'].includes(stage) ? 68 : 45
    const created: CultureState = {
      contextId: context.contextId,
      cultureName: instance?.worldConfig.name ? `${instance.worldConfig.name}文化` : '当地文化',
      traditionStrength: ['prehistoric', 'ancient', 'medieval'].includes(stage) ? 72 : 52,
      reformResistance: ['prehistoric', 'ancient', 'medieval'].includes(stage) ? 65 : 38,
      culturalInertia: 55,
      reformPressure: 12,
      values: { collectivism: 58, individualism: 42, hierarchy, egalitarianism: 100 - hierarchy,
        militarism: 42, pacifism: 58, spiritualism: spiritual, materialism: 100 - spiritual },
      festivals: [], rituals: [], taboos: [], customs: [], notableEvents: [], artProsperity: 30,
      updatedAtTotalDays: context.totalDays,
    }
    this.states[context.contextId] = created
    return created
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    const years = context.daysPassed / 365
    state.reformPressure = clamp(state.reformPressure * Math.pow(0.98, years))
    const pressure = Math.max(0, state.reformPressure - state.reformResistance) / 100
    state.traditionStrength = clamp(state.traditionStrength - pressure * years)
    state.culturalInertia = clamp(state.culturalInertia + (state.traditionStrength - state.culturalInertia) * 0.01 * years)
    state.notableEvents = []
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const dominant = VALUES.reduce((best, key) => state.values[key] > state.values[best] ? key : best, VALUES[0])
    return { id: this.id, summary: `【文化】${state.cultureName}；传统 ${state.traditionStrength.toFixed(1)}；主导价值 ${dominant}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('文化指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('文化指令上下文不匹配')
    const state = this.ensure(context)
    const data = changes.changes
    if (typeof data.traditionDelta === 'number') state.traditionStrength = clamp(state.traditionStrength + data.traditionDelta)
    if (typeof data.reformPressureDelta === 'number') state.reformPressure = clamp(state.reformPressure + data.reformPressureDelta)
    if (typeof data.artProsperityDelta === 'number') state.artProsperity = clamp(state.artProsperity + data.artProsperityDelta)
    if (typeof data.valueKey === 'string' && VALUES.includes(data.valueKey as CulturalValue) && typeof data.valueDelta === 'number') {
      const key = data.valueKey as CulturalValue
      state.values[key] = clamp(state.values[key] + data.valueDelta)
    }
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): CulturePersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as CulturePersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('文化持久化快照无效')
    this.states = clone(value.contexts)
  }
  capturePreviewState(): CulturePersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}

export const cultureSystem = new CultureSystem()
