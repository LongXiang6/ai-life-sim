/**
 * Purpose: Migrate and sanitize persisted world-context state to canonical base points.
 * Owner: mod-world / persistence
 * Responsibility: Boundary migration only; live world calculations remain in runtime owners.
 *
 * @module world-state-migration
 * @description 世界持久化与存档快照的兼容清洗
 * @mod mod-world
 */

import { basePointsFromCalendarDays, calendarDaysFromBasePoints } from '@/foundation'
import type { WorldConfig, WorldContextInstance, WorldTagsV2 } from '../types'
import { WORLDVIEW_TAG_DEFAULTS } from '../constants/world-tag-defaults'
import {
  assertValidWorldContextHierarchy,
  alignCapabilityProfileRuntimeMembership,
  buildWorldContextInstance,
  createWorldContextId,
  localCalendarBasePointsFromDays,
  localCalendarDaysFromBasePoints,
} from './world-context-runtime'

const SCP_PRESET_NAME = 'SCP基金会'
const SCP_PRESET_DESCRIPTION_FINGERPRINT = ['SCP编号', '休谟指数', '现实扭曲者'] as const
const LEGACY_SCP_POWER_TAGS = new Set(['none', 'technology'])
const LEGACY_SCP_CONTRADICTORY_WORLD_TAGS = new Set([
  '无超自然',
  '无超自然力量',
  '禁止超自然',
  '严禁超自然',
  '超自然力量不存在',
  '无怪物',
  '纯科技世界',
  '纯现实世界',
  '科技决定论：所有现象必须可被科学解释',
])
// 这些能力曾属于已下线的 P2 社会系统；旧存档仍可能携带它们，
// 但当前运行时没有对应能力或子系统，恢复时必须在唯一快照边界归一化。
const LEGACY_CONTEXT_CAPABILITIES = new Set(['npc', 'economy', 'politics'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined
}

function nonNegativeFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

/** Normalize persisted local clocks to the canonical base-point cursor. */
function normalizeContextClock(instance: WorldContextInstance): void {
  const calendar = instance.record.localCalendar
  const rawRecord = instance.record as unknown as Record<string, unknown>
  const rawClock = isRecord(rawRecord.localClock) ? rawRecord.localClock : {}
  const legacyLocalDays = nonNegativeInteger(rawClock.totalLocalDays) ?? 0
  const totalBasePoints = nonNegativeFinite(rawClock.totalBasePoints)
    ?? localCalendarBasePointsFromDays(legacyLocalDays, calendar)
  const legacyGlobalDays = nonNegativeInteger(rawClock.lastGlobalTotalDays) ?? 0
  const lastGlobalTotalBasePoints = nonNegativeInteger(rawClock.lastGlobalTotalBasePoints)
    ?? basePointsFromCalendarDays(legacyGlobalDays)
  const normalizedClock = {
    totalBasePoints,
    lastGlobalTotalBasePoints,
    totalLocalDays: localCalendarDaysFromBasePoints(totalBasePoints, calendar),
    lastGlobalTotalDays: calendarDaysFromBasePoints(lastGlobalTotalBasePoints),
  }
  instance.record.localClock = normalizedClock

  const createdAtLegacyDays = nonNegativeInteger(rawRecord.createdAtGlobalDay) ?? 0
  const createdAtGlobalBasePoints = nonNegativeInteger(rawRecord.createdAtGlobalBasePoints)
    ?? basePointsFromCalendarDays(createdAtLegacyDays)
  rawRecord.createdAtGlobalBasePoints = createdAtGlobalBasePoints
  rawRecord.createdAtGlobalDay = calendarDaysFromBasePoints(createdAtGlobalBasePoints)

  const rawScope = isRecord((instance as unknown as Record<string, unknown>).scope)
    ? (instance as unknown as Record<string, unknown>).scope as Record<string, unknown>
    : undefined
  if (rawScope) {
    const changedAtLegacyDays = nonNegativeInteger(rawScope.changedAtGlobalDay) ?? 0
    const changedAtGlobalBasePoints = nonNegativeInteger(rawScope.changedAtGlobalBasePoints)
      ?? basePointsFromCalendarDays(changedAtLegacyDays)
    rawScope.changedAtGlobalBasePoints = changedAtGlobalBasePoints
    rawScope.changedAtGlobalDay = calendarDaysFromBasePoints(changedAtGlobalBasePoints)
  }
}

function normalizeTransitionHistory(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    if (!isRecord(entry)) return entry
    const globalTotalBasePoints = nonNegativeInteger(entry.globalTotalBasePoints)
      ?? basePointsFromCalendarDays(nonNegativeInteger(entry.globalTotalDays) ?? 0)
    return {
      ...entry,
      globalTotalBasePoints,
      globalTotalDays: calendarDaysFromBasePoints(globalTotalBasePoints),
      sourceLocalBasePoints: nonNegativeInteger(entry.sourceLocalBasePoints)
        ?? basePointsFromCalendarDays(nonNegativeInteger(entry.sourceLocalDays) ?? 0),
      targetLocalBasePoints: nonNegativeInteger(entry.targetLocalBasePoints)
        ?? basePointsFromCalendarDays(nonNegativeInteger(entry.targetLocalDays) ?? 0),
    }
  })
}

function migrateLegacyCapabilityProfile(
  profile: WorldContextInstance['capabilityProfile'],
): WorldContextInstance['capabilityProfile'] {
  if (!Array.isArray(profile.capabilities)) return profile
  const rawCapabilities = profile.capabilities as readonly unknown[]
  const capabilities = rawCapabilities.filter((capability) => (
    typeof capability !== 'string' || !LEGACY_CONTEXT_CAPABILITIES.has(capability)
  ))
  if (capabilities.length === rawCapabilities.length) return profile
  return {
    ...profile,
    capabilities: capabilities as WorldContextInstance['capabilityProfile']['capabilities'],
  }
}

/**
 * 仅识别由旧版 SCP 预设映射产生的错误组合。
 * 名称与旧预设中的稳定描述片段共同作为版本指纹，允许玩家在原描述后追加内容，
 * 同时避免误改只有相同名称、但没有 SCP 设定特征的自定义世界。
 */
function isLegacyScpPresetConfig(value: unknown): value is Record<string, unknown> & WorldConfig {
  if (!isRecord(value)) return false
  const description = value.description
  if (typeof description !== 'string') return false
  return value.name === SCP_PRESET_NAME
    && SCP_PRESET_DESCRIPTION_FINGERPRINT.every((fragment) => description.includes(fragment))
    && value.essenceTag === 'modern'
    && typeof value.powerSystemTag === 'string'
    && LEGACY_SCP_POWER_TAGS.has(value.powerSystemTag)
}

function migrateLegacyScpCalibration(
  value: unknown,
  config: WorldConfig,
): unknown {
  if (value === null || value === undefined || !isRecord(value)) return value
  const metadata = isRecord(value.metadata) ? value.metadata : {}
  return {
    ...value,
    metadata: {
      ...metadata,
      essenceTag: 'mixed',
      civilizationStage: config.civilizationStage,
      powerSystemTag: 'mixed',
      spatialForm: config.spatialForm,
      difficulty: config.difficulty,
    },
  }
}

function migrateLegacyScpWorldTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((tag): tag is string => (
    typeof tag === 'string'
    && !LEGACY_SCP_CONTRADICTORY_WORLD_TAGS.has(tag.trim())
  ))
}

/**
 * 清洗 Zustand persist 或 OPFS 世界快照。
 *
 * 旧版把 SCP 基金会预设错误映射为纯现代科技世界，导致 UI 与叙事约束出现
 * “无超自然 / 严禁超自然”。迁移只修正该预设的结构化标签与校准元数据，
 * 年代、空间、难度、描述、实体、公式和有效 AI 氛围标签均保持原样。
 */
export function sanitizeWorldStateSnapshot(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? structuredClone(value) : {}
  let record = source
  delete record.entities
  delete record.entityReferences
  delete record.worldInitAIStatus
  if (isLegacyScpPresetConfig(record.worldConfig)) {
    const dimensionValues = isRecord(record.worldConfig._dimensionValues)
      ? { ...record.worldConfig._dimensionValues }
      : record.worldConfig._dimensionValues
    if (isRecord(dimensionValues)) {
      delete dimensionValues.worldviewEssence
      delete dimensionValues.powerSystem
    }

    const worldConfig = {
      ...record.worldConfig,
      essenceTag: 'mixed',
      powerSystemTag: 'mixed',
      worldType: 'mixed',
      _dimensionValues: dimensionValues,
    } as WorldConfig

    record = {
      ...record,
      worldConfig,
      calibration: migrateLegacyScpCalibration(record.calibration, worldConfig),
      worldTags: migrateLegacyScpWorldTags(record.worldTags),
    }
  }

  const currentContextId = typeof record.currentContextId === 'string'
    ? record.currentContextId
    : null
  const existingContexts = isRecord(record.contexts)
    ? record.contexts as Record<string, unknown>
    : {}

  if (currentContextId && isRecord(existingContexts[currentContextId])) {
    const contexts = structuredClone(existingContexts) as Record<string, WorldContextInstance>
    for (const [contextId, instance] of Object.entries(contexts)) {
      if (!instance?.record || !instance.scope) continue
      normalizeContextClock(instance)
      delete (instance as unknown as Record<string, unknown>).entities
      delete (instance as unknown as Record<string, unknown>).worldInitAIStatus
      delete (instance.spatialGraph as unknown as Record<string, unknown>).entityLocations
      instance.capabilityProfile = alignCapabilityProfileRuntimeMembership(
        migrateLegacyCapabilityProfile(instance.capabilityProfile),
      )
      if (contextId === currentContextId) {
        instance.scope.scope = 'active'
        instance.record.lifecycle = 'open'
      } else if (instance.scope.scope === 'active') {
        instance.scope.scope = 'dormant'
        instance.scope.reason = '存档迁移：非当前上下文降为休眠'
        instance.record.lifecycle = 'dormant'
      } else if (instance.scope.scope === 'background') {
        instance.record.lifecycle = 'open'
      } else if (instance.scope.scope === 'closed') {
        instance.record.lifecycle = 'closed'
      } else {
        instance.record.lifecycle = 'dormant'
      }
    }
    assertValidWorldContextHierarchy(Object.fromEntries(
      Object.entries(contexts).map(([contextId, instance]) => {
        if (!instance?.record) throw new Error(`上下文记录缺失：${contextId}`)
        return [contextId, instance.record]
      }),
    ))
    const current = contexts[currentContextId]
    return {
      ...record,
      contexts,
      currentContextId,
      crossContextEdges: isRecord(record.crossContextEdges)
        ? structuredClone(record.crossContextEdges)
        : {},
      transitionHistory: normalizeTransitionHistory(record.transitionHistory),
      ...(current ? {
        worldConfig: structuredClone(current.worldConfig),
        initialized: current.initialized,
        worldCode: current.worldCode,
        currentYear: current.currentYear,
        worldTags: [...current.worldTags],
        eraStartYear: current.eraStartYear,
        eraName: current.eraName,
        calibration: structuredClone(current.calibration),
      } : {}),
    }
  }

  if (!isRecord(record.worldConfig)) {
    return {
      ...record,
      contexts: {},
      currentContextId: null,
      crossContextEdges: {},
      transitionHistory: [],
    }
  }

  const worldConfig = record.worldConfig as unknown as WorldConfig
  const worldCode = typeof record.worldCode === 'number' && Number.isFinite(record.worldCode)
    ? record.worldCode
    : 0
  const contextId = createWorldContextId({ legacyWorldCode: worldCode })
  const tags = (WORLDVIEW_TAG_DEFAULTS[worldConfig.essenceTag]
    ?? WORLDVIEW_TAG_DEFAULTS.mixed) as WorldTagsV2
  const instance = buildWorldContextInstance({
    contextId,
    config: worldConfig,
    snapshot: {
      contextId,
      rootSpatialNodeId: `${contextId}:space:root`,
      worldConfig,
      regions: [],
      tags,
    },
    worldCode,
    calibration: isRecord(record.calibration) ? record.calibration as never : null,
    worldTags: Array.isArray(record.worldTags)
      ? record.worldTags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    eraStartYear: typeof record.eraStartYear === 'number' ? record.eraStartYear : 0,
    eraName: typeof record.eraName === 'string' ? record.eraName : '',
    scope: 'active',
    globalTotalBasePoints: nonNegativeInteger(record.totalBasePoints)
      ?? basePointsFromCalendarDays(nonNegativeInteger(record.totalDays) ?? 0),
    derivedFrom: 'migration',
  })
  instance.currentYear = typeof record.currentYear === 'number' ? record.currentYear : 0
  instance.initialized = record.initialized === true
  return {
    ...record,
    contexts: { [contextId]: instance },
    currentContextId: contextId,
    crossContextEdges: {},
    transitionHistory: normalizeTransitionHistory(record.transitionHistory),
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
