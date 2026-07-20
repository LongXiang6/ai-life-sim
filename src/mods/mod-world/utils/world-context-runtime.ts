/**
 * @module world-context-runtime.ts
 * @description P0 世界上下文的稳定 ID、能力、空间与旧单世界迁移纯函数
 * @mod mod-world
 */

import type {
  ContextCapability,
  ContextCapabilityProfile,
  LocalCalendarProfile,
  SimulationScope,
  SimulationScopeRecord,
  SpatialEdge,
  SpatialGraphContract,
  SpatialNode,
  WorldContextKind,
  WorldContextRecord,
} from '@/foundation'

import { WORLDVIEW_TAG_DEFAULTS } from '../constants/world-tag-defaults'
import type {
  AnyWorldEntity,
  RegionData,
  WorldCalibration,
  WorldConfig,
  WorldContextInstance,
  WorldInitAIStatus,
  WorldSnapshot,
  WorldTagsV2,
} from '../types'

export const P0_FOUNDATION_SUBSYSTEM_IDS = [
  'world-context-registry',
  'contextual-capability-profile',
  'spatial-graph',
  'context-transition',
  'simulation-scope-policy',
  'world-init',
] as const

const CURRENT_WORLD_SUBSYSTEM_IDS = [
  'world-entity',
  'character-base',
  'destiny-pattern',
  'lifespan',
  'luck',
  'morality',
  'historical-event-ledger',
] as const

/**
 * Every context must keep these systems available regardless of worldview tags.
 * Later phases extend this explicit policy instead of inferring runtime members
 * from free-form labels.
 */
export const REQUIRED_CONTEXT_SUBSYSTEM_IDS = [
  ...P0_FOUNDATION_SUBSYSTEM_IDS,
  ...CURRENT_WORLD_SUBSYSTEM_IDS,
] as const

/**
 * Capability-gated system membership remains empty through P1. Later phases may add
 * systems here only after their runtime contracts are approved.
 */
export const CONTEXT_CAPABILITY_SUBSYSTEM_POLICY: Readonly<
  Record<ContextCapability, { enabledSubsystemIds: readonly string[]; backgroundSubsystemIds: readonly string[] }>
> = {
  life: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  space: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  npc: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  economy: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  politics: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  technology: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  supernatural: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
}

const KNOWN_LIFE_ESSENCE_TAGS = new Set([
  ...Object.keys(WORLDVIEW_TAG_DEFAULTS),
  'cultivation',
  'wuxia',
  'dark-fantasy',
  'mythological',
  'lovecraftian',
].map(normalizeStructuredTagKey))

const ORGANIZED_CIVILIZATION_STAGES = new Set([
  'ancient',
  'medieval',
  'renaissance',
  'industrial',
  'modern',
  'information',
  'space',
])

const TECHNOLOGICAL_CIVILIZATION_STAGES = new Set([
  'industrial',
  'modern',
  'information',
  'space',
])

const TECHNOLOGICAL_POWER_SYSTEM_TAGS = new Set(['technology'])
const SUPERNATURAL_POWER_SYSTEM_TAGS = new Set([
  'cultivation',
  'magic',
  'psi',
  'martial',
  'faith',
  'mixed',
])

const MAP_CONTEXT_KINDS = new Set<WorldContextKind>([
  'world',
  'universe',
  'plane',
  'galaxy',
  'planet',
  'continent',
])

const VALID_CONTEXT_CAPABILITIES = new Set<ContextCapability>([
  'life',
  'space',
  'npc',
  'economy',
  'politics',
  'technology',
  'supernatural',
])

function safeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'unnamed'
}

export function createRuntimeId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}_${randomId}`
}

export function createWorldContextId(options?: {
  contextId?: string
  legacyWorldCode?: number
}): string {
  if (options?.contextId?.trim()) return options.contextId.trim()
  if (options?.legacyWorldCode && options.legacyWorldCode > 0) {
    return `ctx_world_${options.legacyWorldCode}`
  }
  return createRuntimeId('ctx_world')
}

export function createGlobalEntityId(
  contextId: string,
  kind: 'entity' | 'space' | 'character',
  localId: string,
): string {
  const prefix = `${contextId}:${kind}:`
  if (localId.startsWith(prefix)) return localId
  return `${prefix}${safeSegment(localId)}`
}

export function inferContextKind(config: WorldConfig): WorldContextKind {
  switch (config.spatialForm) {
    case 'universe': return 'universe'
    case 'multiverse':
    case 'omniverse':
    case 'plane': return 'plane'
    case 'starSystems': return 'galaxy'
    case 'void': return 'abstract'
    default: return 'world'
  }
}

export function contextKindUsesRegionMap(contextKind: WorldContextKind): boolean {
  return MAP_CONTEXT_KINDS.has(contextKind)
}

function normalizeStructuredTagKey(value: string): string {
  return value.trim().replaceAll('-', '').replaceAll('_', '').toLowerCase()
}

function splitStructuredTags(value: string): string[] {
  return value
    .split('+')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function containsKnownTag(value: string, knownTags: ReadonlySet<string>): boolean {
  return splitStructuredTags(value).some((tag) => knownTags.has(normalizeStructuredTagKey(tag)))
}

function mergeUniqueIds(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flatMap((group) => [...group]))]
}

export function normalizeConfirmedCapabilities(
  capabilities: readonly ContextCapability[],
): ContextCapability[] {
  const normalized = new Set<ContextCapability>(['space'])
  for (const capability of capabilities) {
    if (!VALID_CONTEXT_CAPABILITIES.has(capability)) {
      throw new Error(`未知上下文能力：${String(capability)}`)
    }
    normalized.add(capability)
  }
  return [...normalized]
}

export function deriveCapabilityProfile(
  contextId: string,
  config: WorldConfig,
  derivedFrom: ContextCapabilityProfile['derivedFrom'] = 'world-config',
  confirmedCapabilities?: readonly ContextCapability[],
): ContextCapabilityProfile {
  const capabilities = new Set<ContextCapability>(
    confirmedCapabilities ? normalizeConfirmedCapabilities(confirmedCapabilities) : ['space'],
  )
  if (!confirmedCapabilities) {
    const supportsLife = containsKnownTag(config.essenceTag, KNOWN_LIFE_ESSENCE_TAGS)
    const organizedSociety = supportsLife && ORGANIZED_CIVILIZATION_STAGES.has(config.civilizationStage)
    const technological = TECHNOLOGICAL_CIVILIZATION_STAGES.has(config.civilizationStage)
      || containsKnownTag(config.powerSystemTag, TECHNOLOGICAL_POWER_SYSTEM_TAGS)
    const supernatural = containsKnownTag(config.powerSystemTag, SUPERNATURAL_POWER_SYSTEM_TAGS)

    if (supportsLife) {
      capabilities.add('life')
      capabilities.add('npc')
    }
    if (organizedSociety) {
      capabilities.add('economy')
      capabilities.add('politics')
    }
    if (technological) capabilities.add('technology')
    if (supernatural) capabilities.add('supernatural')
  }

  const capabilityPolicies = [...capabilities].map(
    (capability) => CONTEXT_CAPABILITY_SUBSYSTEM_POLICY[capability],
  )

  return {
    contextId,
    capabilities: [...capabilities],
    enabledSubsystemIds: mergeUniqueIds(
      REQUIRED_CONTEXT_SUBSYSTEM_IDS,
      ...capabilityPolicies.map((policy) => policy.enabledSubsystemIds),
    ),
    backgroundSubsystemIds: mergeUniqueIds(
      ...capabilityPolicies.map((policy) => policy.backgroundSubsystemIds),
    ),
    derivedFrom: confirmedCapabilities ? 'confirmed-facts' : derivedFrom,
  }
}

export function assertValidWorldContextHierarchy(
  records: Readonly<Record<string, WorldContextRecord>>,
): void {
  for (const [contextId, record] of Object.entries(records)) {
    if (record.id !== contextId) {
      throw new Error(`上下文注册键与记录 ID 不一致：${contextId}`)
    }
    const parentContextId = record.parentContextId
    if (!parentContextId) continue
    if (parentContextId === contextId) {
      throw new Error(`上下文不能以自身为父级：${contextId}`)
    }
    if (!records[parentContextId]) {
      throw new Error(`父上下文不存在：${parentContextId}`)
    }
  }

  const completed = new Set<string>()
  for (const contextId of Object.keys(records)) {
    if (completed.has(contextId)) continue
    const path = new Set<string>()
    let cursor: string | undefined = contextId
    while (cursor) {
      if (path.has(cursor)) {
        throw new Error(`上下文父子关系存在环：${cursor}`)
      }
      if (completed.has(cursor)) break
      path.add(cursor)
      cursor = records[cursor]?.parentContextId
    }
    for (const visited of path) completed.add(visited)
  }
}

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

function namespaceRegions(contextId: string, regions: RegionData[]): {
  regions: RegionData[]
  idMap: Map<string, string>
} {
  const idMap = new Map<string, string>()
  for (const region of regions) {
    idMap.set(region.id, createGlobalEntityId(contextId, 'space', region.id))
  }
  return {
    idMap,
    regions: regions.map((region) => ({
      ...structuredClone(region),
      id: idMap.get(region.id)!,
      localId: region.localId ?? region.id,
      contextId,
    })),
  }
}

function namespaceEntities(
  contextId: string,
  entities: AnyWorldEntity[],
  regionIdMap: Map<string, string>,
): AnyWorldEntity[] {
  const entityIdMap = new Map<string, string>()
  for (const entity of entities) {
    entityIdMap.set(entity.id, createGlobalEntityId(contextId, 'entity', entity.id))
  }

  return entities.map((entity) => {
    const next = {
      ...structuredClone(entity),
      id: entityIdMap.get(entity.id)!,
      localId: entity.localId ?? entity.id,
      contextId,
      regionId: entity.regionId ? (regionIdMap.get(entity.regionId) ?? entity.regionId) : entity.regionId,
    } as AnyWorldEntity

    if (next.type === 'faction') {
      next.influenceRegionIds = next.influenceRegionIds.map((id) => regionIdMap.get(id) ?? id)
    } else if (next.type === 'nobleHouse') {
      next.homeRegion = regionIdMap.get(next.homeRegion) ?? next.homeRegion
    } else if (next.type === 'tradeRoute') {
      next.fromSettlementId = entityIdMap.get(next.fromSettlementId) ?? next.fromSettlementId
      next.toSettlementId = entityIdMap.get(next.toSettlementId) ?? next.toSettlementId
    }
    return next
  })
}

export function normalizeWorldEntitiesForContext(
  contextId: string,
  entities: AnyWorldEntity[],
  regions: RegionData[],
): AnyWorldEntity[] {
  const regionIdMap = new Map<string, string>()
  for (const region of regions) {
    regionIdMap.set(region.id, region.id)
    if (region.localId) regionIdMap.set(region.localId, region.id)
  }
  return namespaceEntities(contextId, entities, regionIdMap)
}

export function buildSpatialGraph(
  contextId: string,
  contextKind: WorldContextKind,
  contextName: string,
  regions: RegionData[],
): SpatialGraphContract {
  const rootNodeId = createGlobalEntityId(contextId, 'space', 'root')
  const nodes: Record<string, SpatialNode> = {
    [rootNodeId]: {
      id: rootNodeId,
      contextId,
      kind: contextKind,
      name: contextName,
      localId: 'root',
      attributes: {},
    },
  }
  const edges: SpatialGraphContract['edges'] = {}

  for (const region of regions) {
    nodes[region.id] = {
      id: region.id,
      contextId,
      parentNodeId: rootNodeId,
      kind: 'region',
      name: region.name,
      localId: region.localId,
      attributes: {
        templateType: region.templateType,
        terrainTag: region.terrainTag,
      },
    }
    const edgeId = `${contextId}:edge:contains:${safeSegment(region.localId ?? region.id)}`
    edges[edgeId] = {
      id: edgeId,
      kind: 'contains',
      fromNodeId: rootNodeId,
      toNodeId: region.id,
      bidirectional: true,
      enabled: true,
    }
  }

  return {
    contextId,
    rootNodeId,
    nodes,
    edges,
    entityLocations: {},
  }
}

export function createCrossContextExit(
  source: WorldContextInstance,
  target: WorldContextInstance,
  bidirectional = true,
): SpatialEdge {
  return {
    id: createRuntimeId('ctx_exit'),
    kind: 'portal',
    fromNodeId: source.record.rootSpatialNodeId,
    toNodeId: target.record.rootSpatialNodeId,
    bidirectional,
    enabled: true,
  }
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
  worldInitAIStatus?: WorldInitAIStatus | null
  parentContextId?: string
  contextKind?: WorldContextKind
  localCalendar?: LocalCalendarProfile
  capabilities?: ContextCapability[]
  scope?: SimulationScope
  globalTotalDays?: number
  derivedFrom?: ContextCapabilityProfile['derivedFrom']
}): WorldContextInstance {
  const contextKind = input.contextKind ?? inferContextKind(input.config)
  const { regions, idMap } = namespaceRegions(input.contextId, input.snapshot.regions)
  const entities = namespaceEntities(input.contextId, input.snapshot.entities, idMap)
  const spatialGraph = buildSpatialGraph(input.contextId, contextKind, input.config.name, regions)
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
    entities,
    regions,
    tags: structuredClone(input.snapshot.tags),
    worldTags: [...(input.worldTags ?? [])],
    currentYear: 0,
    eraStartYear: input.eraStartYear ?? input.config.eraStartYear ?? 0,
    eraName: input.eraName ?? input.config.eraName ?? '',
    calibration: structuredClone(input.calibration),
    destinyPatternModifiers: {},
    worldInitAIStatus: structuredClone(input.worldInitAIStatus ?? null),
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
    entities: structuredClone(instance.entities),
    initialized: instance.initialized,
    worldCode: instance.worldCode,
    currentYear: instance.currentYear,
    worldTags: [...instance.worldTags],
    eraStartYear: instance.eraStartYear,
    eraName: instance.eraName,
    calibration: structuredClone(instance.calibration),
    destinyPatternModifiers: { ...instance.destinyPatternModifiers },
    worldInitAIStatus: structuredClone(instance.worldInitAIStatus),
  }
}
