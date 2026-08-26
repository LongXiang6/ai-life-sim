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
import {
  BASE_POINTS_PER_YEAR,
  basePointsFromCalendarDays,
  calendarDaysFromBasePoints,
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

function normalizeBasePoints(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

/**
 * Local calendars may advance by a fractional canonical point when their
 * timeScale is below one. Keep that fractional cursor so repeated small
 * event advances are accumulated instead of being discarded on every sync;
 * the global event cursor remains integer-based.
 */
function normalizeLocalBasePoints(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

function roundLocalBasePoints(value: number): number {
  // Avoid binary floating-point noise in persisted snapshots while retaining
  // enough precision for ordinary timeScale values.
  return Math.round(Math.max(0, value) * 1_000_000_000) / 1_000_000_000
}

/** Convert a local canonical cursor to its calendar-day display projection. */
export function localCalendarDaysFromBasePoints(
  totalBasePoints: number,
  calendar: Pick<LocalCalendarProfile, 'daysPerYear'>,
): number {
  const points = normalizeBasePoints(totalBasePoints)
  return Math.floor((points * calendar.daysPerYear) / BASE_POINTS_PER_YEAR)
}

/** One-time migration helper for legacy local day cursors. */
export function localCalendarBasePointsFromDays(
  totalLocalDays: number,
  calendar: Pick<LocalCalendarProfile, 'daysPerYear'>,
): number {
  if (!Number.isFinite(totalLocalDays) || totalLocalDays <= 0) return 0
  return Math.floor((Math.floor(totalLocalDays) * BASE_POINTS_PER_YEAR) / calendar.daysPerYear)
}

function resolveLegacyGlobalBasePoints(
  totalBasePoints: number | undefined,
  totalDays: number | undefined,
): number {
  return totalBasePoints !== undefined
    ? normalizeBasePoints(totalBasePoints)
    : basePointsFromCalendarDays(totalDays ?? 0)
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
  globalTotalBasePoints?: number
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
  const localCalendar = validateLocalCalendar(input.localCalendar ?? {
    calendarId: 'canonical-365',
    displayName: input.eraName || input.config.eraName || '当地历法',
    daysPerYear: 365,
    monthsPerYear: 12,
    timeScale: 1,
    pausedWhenInactive: true,
  })
  const globalTotalBasePoints = normalizeBasePoints(input.globalTotalBasePoints)
  const globalTotalDays = calendarDaysFromBasePoints(globalTotalBasePoints)
  const record: WorldContextRecord = {
    id: input.contextId,
    parentContextId: input.parentContextId,
    kind: contextKind,
    name: input.config.name,
    description: input.config.description,
    lifecycle: input.scope === 'closed' ? 'closed' : input.scope === 'active' ? 'open' : 'dormant',
    rootSpatialNodeId: spatialGraph.rootNodeId,
    createdAtGlobalBasePoints: globalTotalBasePoints,
    createdAtGlobalDay: globalTotalDays,
    localCalendar,
    localClock: {
      totalBasePoints: 0,
      lastGlobalTotalBasePoints: globalTotalBasePoints,
      totalLocalDays: 0,
      lastGlobalTotalDays: globalTotalDays,
    },
    legacyWorldCode: input.worldCode || undefined,
  }
  const scope: SimulationScopeRecord = {
    contextId: input.contextId,
    scope: input.scope ?? 'dormant',
    reason: input.scope === 'active' ? '当前玩家上下文' : '新建上下文等待激活',
    changedAtGlobalBasePoints: globalTotalBasePoints,
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
  globalTotalBasePoints: number,
): WorldContextInstance {
  const next = structuredClone(instance)
  const localClock = next.record.localClock
  const globalBasePoints = normalizeBasePoints(globalTotalBasePoints)
  const lastGlobalBasePoints = resolveLegacyGlobalBasePoints(
    localClock.lastGlobalTotalBasePoints,
    localClock.lastGlobalTotalDays,
  )
  const elapsedGlobalBasePoints = Math.max(0, globalBasePoints - lastGlobalBasePoints)
  const currentLocalBasePoints = localClock.totalBasePoints !== undefined
    ? normalizeLocalBasePoints(localClock.totalBasePoints)
    : localCalendarBasePointsFromDays(localClock.totalLocalDays, next.record.localCalendar)
  const shouldAdvance = next.scope.scope === 'active'
    || (next.scope.scope === 'background' && !next.record.localCalendar.pausedWhenInactive)
  if (shouldAdvance) {
    const localDelta = elapsedGlobalBasePoints * next.record.localCalendar.timeScale
    localClock.totalBasePoints = roundLocalBasePoints(currentLocalBasePoints + Math.max(0, localDelta))
  } else {
    localClock.totalBasePoints = roundLocalBasePoints(currentLocalBasePoints)
  }
  localClock.lastGlobalTotalBasePoints = globalBasePoints
  localClock.totalLocalDays = localCalendarDaysFromBasePoints(
    localClock.totalBasePoints,
    next.record.localCalendar,
  )
  localClock.lastGlobalTotalDays = calendarDaysFromBasePoints(globalBasePoints)
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
