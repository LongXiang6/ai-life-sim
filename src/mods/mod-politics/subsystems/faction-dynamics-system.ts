import { BaseSubsystem } from '@/core'
import type { DecimalInteger, RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { listWorldContexts } from '@/mods/mod-world'
import type { FactionPersistenceState, FactionState, PoliticalEntity, PoliticalEntityKind } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number): number => Math.max(-100, Math.min(100, value))

function entityKind(type: string): PoliticalEntityKind {
  if (type === 'nation') return 'nation'
  if (type === 'faction') return 'faction'
  if (type === 'nobleHouse') return 'house'
  if (type === 'settlement') return 'city'
  return 'other'
}

function totalPopulation(context: RoundContext): DecimalInteger {
  const data = context.subsystemStates.population?.data as Partial<{ totalPopulation: DecimalInteger }> | undefined
  return typeof data?.totalPopulation === 'string' ? data.totalPopulation : '1000'
}

export class FactionDynamicsSystem extends BaseSubsystem {
  readonly id = 'faction-dynamics' as const
  readonly mod = 'mod-politics' as const
  readonly label = '政治实体关系' as const
  readonly description = '拥有国家、派系、部落、城市等政治实体的影响力与关系；稳定实体身份归世界实体目录' as const
  private states: Record<string, FactionState> = {}

  private ensure(context: RoundContext): FactionState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const source = (instance?.entities ?? []).filter((item) => ['nation', 'faction', 'nobleHouse', 'settlement'].includes(item.type))
    const population = BigInt(totalPopulation(context))
    const share = source.length ? (population / BigInt(source.length)).toString() : '0'
    const entities: PoliticalEntity[] = source.map((item) => ({
      entityId: item.id, name: item.name, kind: entityKind(item.type), memberCount: share,
      influence: item.type === 'faction' ? item.power : item.type === 'nation' ? item.stability : item.type === 'nobleHouse' ? item.influence : item.type === 'settlement' ? item.developmentLevel : 50,
      objective: item.description, relations: {}, status: 'stable',
    }))
    return this.states[context.contextId] = { contextId: context.contextId, entities, playerEntityId: null,
      playerContribution: 0, playerRankLabel: '', updatedAtTotalDays: context.totalDays }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    if (context.daysPassed <= 0) return
    for (const entity of state.entities) {
      const relationPressure = Object.values(entity.relations).reduce((sum, value) => sum + value, 0)
      const previous = entity.influence
      entity.influence = Math.max(0, Math.min(100, entity.influence + relationPressure / Math.max(1, Object.keys(entity.relations).length) * 0.001 * context.daysPassed / 365))
      entity.status = entity.influence > previous + 0.01 ? 'rising' : entity.influence < previous - 0.01 ? 'declining' : 'stable'
    }
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const leading = [...state.entities].sort((a, b) => b.influence - a.influence)[0]
    return { id: this.id, summary: `【政治实体】${state.entities.length} 个${leading ? `；影响力最高 ${leading.name}` : ''}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('政治实体指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('政治实体指令上下文不匹配')
    const state = this.ensure(context)
    const operation = changes.operation ?? 'adjust-influence'
    if (operation === 'adjust-contribution') {
      if (typeof changes.changes.contributionDelta !== 'number') throw new Error('贡献变化缺少数值')
      state.playerContribution = Math.max(0, state.playerContribution + changes.changes.contributionDelta)
    } else {
      const entity = state.entities.find((item) => item.entityId === changes.targetObjectId)
      if (!entity) throw new Error(`政治实体不存在：${changes.targetObjectId}`)
      if (operation === 'adjust-influence') {
        if (typeof changes.changes.influenceDelta !== 'number') throw new Error('影响力变化缺少数值')
        entity.influence = Math.max(0, Math.min(100, entity.influence + changes.changes.influenceDelta))
      } else if (operation === 'set-relation') {
        const otherId = typeof changes.changes.otherEntityId === 'string' ? changes.changes.otherEntityId : ''
        if (!state.entities.some((item) => item.entityId === otherId)) throw new Error(`关系目标政治实体不存在：${otherId}`)
        if (typeof changes.changes.relation !== 'number') throw new Error('政治关系缺少数值')
        entity.relations[otherId] = clamp(changes.changes.relation)
      } else if (operation === 'join') {
        state.playerEntityId = entity.entityId
        state.playerContribution = 0
        state.playerRankLabel = typeof changes.changes.rankLabel === 'string' ? changes.changes.rankLabel : '成员'
      } else throw new Error(`未知政治实体操作：${operation}`)
    }
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): FactionPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as FactionPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('政治实体持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const factionDynamicsSystem = new FactionDynamicsSystem()
