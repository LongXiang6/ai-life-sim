import { BaseSubsystem } from '@/core'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { assertWorldSpatialNode, listWorldContexts } from '@/mods/mod-world'
import { DISASTER_LABELS, SEASON_EFFECTS, SEASON_LABELS } from '../constants'
import type { ClimatePersistenceState, ClimateState, ClimateZone, Disaster, DisasterType, Season } from '../types'

const clone = <T>(value: T): T => structuredClone(value)
const DISASTER_TYPES = new Set<DisasterType>(['flood', 'drought', 'earthquake', 'tsunami', 'volcano', 'storm', 'blizzard', 'wildfire', 'plague', 'locust'])
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

function zoneFor(temperature: number | undefined, humidity: number | undefined): ClimateZone {
  if ((humidity ?? 50) < 20) return 'arid'
  if ((temperature ?? 15) >= 24) return 'tropical'
  if ((temperature ?? 15) >= 18) return 'subtropical'
  if ((temperature ?? 15) >= 5) return 'temperate'
  if ((temperature ?? 15) >= -5) return 'boreal'
  return 'polar'
}

export class ClimateSystem extends BaseSubsystem {
  readonly id = 'climate' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '气候' as const
  readonly description = '按当地历法和空间节点拥有季节、温湿度与有历史证据的灾害周期' as const
  private states: Record<string, ClimateState> = {}

  private ensure(context: RoundContext): ClimateState {
    const existing = this.states[context.contextId]
    if (existing) return existing
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const zones = Object.fromEntries((instance?.regions ?? []).map((region) => [region.id, zoneFor(region.temperature, region.humidity)]))
    const humidityValues = (instance?.regions ?? []).map((region) => region.humidity).filter((value): value is number => typeof value === 'number')
    const humidity = humidityValues.length ? humidityValues.reduce((sum, value) => sum + value, 0) / humidityValues.length : 50
    return this.states[context.contextId] = {
      contextId: context.contextId, temperatureOffset: 0, humidity, season: 'spring', seasonProgress: 0,
      seasonEffects: clone(SEASON_EFFECTS.spring), specialSeason: null, activeDisasters: [], climateZones: zones,
      updatedAtTotalDays: context.totalDays,
    }
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    const instance = listWorldContexts().find((item) => item.record.id === context.contextId)
    const daysPerYear = instance?.record.localCalendar.daysPerYear ?? 365
    const dayOfYear = ((context.totalDays % daysPerYear) + daysPerYear) % daysPerYear
    const seasonPosition = dayOfYear / daysPerYear * 4
    state.season = SEASONS[Math.min(3, Math.floor(seasonPosition))]
    state.seasonProgress = seasonPosition % 1
    state.seasonEffects = clone(SEASON_EFFECTS[state.season])
    state.activeDisasters = state.activeDisasters.filter((disaster) => disaster.endsAtTotalDays > context.totalDays)
    state.updatedAtTotalDays = context.totalDays
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    const disasters = state.activeDisasters.map((item) => DISASTER_LABELS[item.type]).join('、')
    return { id: this.id, summary: `【气候】${SEASON_LABELS[state.season]}季 ${Math.round(state.seasonProgress * 100)}%${disasters ? `；灾害 ${disasters}` : ''}`, data: clone(state) }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (changes.id !== this.id) throw new Error('气候指令目标不匹配')
    if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error('气候指令上下文不匹配')
    const state = this.ensure(context)
    if ((changes.operation ?? 'record-disaster') === 'record-disaster') {
      const type = changes.changes.type as DisasterType
      const severity = changes.changes.severity
      const durationDays = changes.changes.durationDays
      const nodes = Array.isArray(changes.changes.affectedNodeIds)
        ? changes.changes.affectedNodeIds.filter((item): item is string => typeof item === 'string') : []
      if (!DISASTER_TYPES.has(type) || typeof severity !== 'number' || severity < 0 || severity > 100 || typeof durationDays !== 'number' || !Number.isInteger(durationDays) || durationDays <= 0) throw new Error('灾害输入无效')
      nodes.forEach((nodeId) => assertWorldSpatialNode(context.contextId, nodeId))
      const evidence = changes.evidenceEventIds ?? []
      if (evidence.length === 0 || evidence.some((id) => {
        const event = getHistoricalEvent(id)
        return !event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(context.contextId))
      })) throw new Error('灾害必须引用当前上下文已确认历史事件')
      const id = changes.targetObjectId ?? `disaster:${encodeURIComponent(context.contextId)}:${context.totalDays}:${state.activeDisasters.length}`
      const disaster: Disaster = { id, type, severity, affectedNodeIds: nodes, startedAtTotalDays: context.totalDays,
        endsAtTotalDays: context.totalDays + durationDays, evidenceEventIds: [...evidence] }
      state.activeDisasters = [...state.activeDisasters.filter((item) => item.id !== id), disaster]
    } else if (changes.operation === 'resolve-disaster') {
      state.activeDisasters = state.activeDisasters.filter((item) => item.id !== changes.targetObjectId)
    } else if (changes.operation === 'adjust-baseline') {
      if (typeof changes.changes.temperatureOffsetDelta === 'number') state.temperatureOffset += changes.changes.temperatureOffsetDelta
      if (typeof changes.changes.humidityDelta === 'number') state.humidity = Math.max(0, Math.min(100, state.humidity + changes.changes.humidityDelta))
    } else throw new Error(`未知气候操作：${changes.operation}`)
    state.updatedAtTotalDays = context.totalDays
  }

  capturePersistenceState(): ClimatePersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) { this.states = {}; return }
    const value = snapshot as ClimatePersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') throw new Error('气候持久化快照无效')
    this.states = clone(value.contexts)
  }
  reset(): void { this.states = {} }
}

export const climateSystem = new ClimateSystem()
