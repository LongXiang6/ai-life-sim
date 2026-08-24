/**
 * Purpose: Build, advance, clone, and project complete world-context instances.
 * Owner: mod-world / world-context-registry.
 * Responsibility: Context instance state only; identifier, capability, and graph rules are delegated.
 */

import type {
  ContextCapability,
  ContextCapabilityProfile,
  LocalCalendarProfile,
  SimulationScope,
  SimulationScopeRecord,
  WorldContextKind,
  WorldContextRecord,
} from '@/foundation'
import type {
  WorldCalibration,
  WorldConfig,
  WorldContextInstance,
  WorldSnapshot,
  WorldTagsV2,
} from '../../types'
import { deriveCapabilityProfile } from './capability-profile'
import { inferContextKind } from './identifiers'
import {
  buildSpatialGraph,
  namespaceRegions,
} from './spatial-graph'

function validateLocalCalendar(calendar: LocalCalendarProfile): LocalCalendarProfile {
  if (!calendar.calendarId.trim()) throw new Error('当地历法 calendarId 不能为空')
  if (!calendar.displayName.trim()) throw new Error('当地历法 displayName 不能为空')
  if (!Number.isInteger(calendar.daysPerYear) || calendar.daysPerYear <= 0) {
    throw new Error('当地历法 daysPerYear 必须为正整数')
  }
  if (!Number.isInteger(calendar.monthsPerYear) || calendar.monthsPerYear <= 0) {
    throw new Error('当地历法 monthsPerYear 必须为正整数')
  }
  if (!Number.isFinite(calendar.timeScale) || calendar.timeScale < 0) {
    throw new Error('当地历法 timeScale 必须为非负有限数')
  }
  if (typeof calendar.pausedWhenInactive !== 'boolean') {
    throw new Error('当地历法 pausedWhenInactive 必须为布尔值')
  }
  return structuredClone(calendar)
}

export function buildWorldContextInstance(input: {
  contextId: string
  config: WorldConfig
  snapshot: WorldSnapshot
  worldCode: number
  calibration: WorldCalibration | null
  worldTags?: string[]
  eraStartYear?: number
  eraName?: string
  parentContextId?: string
  contextKind?: WorldContextKind
  localCalendar?: LocalCalendarProfile
  capabilities?: ContextCapability[]
  scope?: SimulationScope
  globalTotalDays?: number
  derivedFrom?: ContextCapabilityProfile['derivedFrom']
}): WorldContextInstance {
  const contextKind = input.contextKind ?? inferContextKind(input.config)
  const { regions } = namespaceRegions(input.contextId, input.snapshot.regions)
  const spatialGraph = buildSpatialGraph(
    input.contextId,
    contextKind,
    input.config.name,
    input.config.spatialForm,
    regions,
  )
  const globalTotalDays = Math.max(0, input.globalTotalDays ?? 0)
  const localCalendar = validateLocalCalendar(input.localCalendar ?? {
    calendarId: 'canonical-365',
    displayName: input.eraName || input.config.eraName || '当地历法',
    daysPerYear: 365,
    monthsPerYear: 12,
    timeScale: 1,
    pausedWhenInactive: true,
  })
  const record: WorldContextRecord = {
    id: input.contextId,
    parentContextId: input.parentContextId,
    kind: contextKind,
    name: input.config.name,
    description: input.config.description,
    lifecycle: input.scope === 'closed' ? 'closed' : input.scope === 'active' ? 'open' : 'dormant',
    rootSpatialNodeId: spatialGraph.rootNodeId,
    createdAtGlobalDay: globalTotalDays,
    localCalendar,
    localClock: {
      totalLocalDays: 0,
      lastGlobalTotalDays: globalTotalDays,
    },
    legacyWorldCode: input.worldCode || undefined,
  }
  const scope: SimulationScopeRecord = {
    contextId: input.contextId,
    scope: input.scope ?? 'dormant',
    reason: input.scope === 'active' ? '当前玩家上下文' : '新建上下文等待激活',
    changedAtGlobalDay: globalTotalDays,
  }

  return {
    record,
    capabilityProfile: deriveCapabilityProfile(
      input.contextId,
      input.config,
      input.derivedFrom,
      input.capabilities,
    ),
    scope,
    spatialGraph,
    worldConfig: structuredClone(input.config),
    worldCode: input.worldCode,
    initialized: true,
    regions,
    tags: structuredClone(input.snapshot.tags),
    worldTags: [...(input.worldTags ?? [])],
    currentYear: 0,
    eraStartYear: input.eraStartYear ?? input.config.eraStartYear ?? 0,
    eraName: input.eraName ?? input.config.eraName ?? '',
    calibration: structuredClone(input.calibration),
  }
}

export function syncLocalClock(
  instance: WorldContextInstance,
  globalTotalDays: number,
): WorldContextInstance {
  const next = structuredClone(instance)
  const elapsedGlobalDays = Math.max(0, globalTotalDays - next.record.localClock.lastGlobalTotalDays)
  const shouldAdvance = next.scope.scope === 'active'
    || (next.scope.scope === 'background' && !next.record.localCalendar.pausedWhenInactive)
  if (shouldAdvance) {
    next.record.localClock.totalLocalDays += elapsedGlobalDays * next.record.localCalendar.timeScale
  }
  next.record.localClock.lastGlobalTotalDays = globalTotalDays
  return next
}

export function cloneWorldTags(tags: WorldTagsV2): WorldTagsV2 {
  return structuredClone(tags)
}

export function projectWorldContextInstance(instance: WorldContextInstance) {
  return {
    worldConfig: structuredClone(instance.worldConfig),
    initialized: instance.initialized,
    worldCode: instance.worldCode,
    currentYear: instance.currentYear,
    worldTags: [...instance.worldTags],
    eraStartYear: instance.eraStartYear,
    eraName: instance.eraName,
    calibration: structuredClone(instance.calibration),
  }
}
