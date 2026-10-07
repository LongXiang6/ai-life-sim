/**
 * Purpose: Define provider-owned world context, region graph, and transition contracts.
 * Owner: foundation / mod-world public boundary.
 * Responsibility: Cross-domain types only; region generation and persistence stay in mod-world.
 */

export type WorldContextId = string
export type GlobalEntityId = string
export type SpatialNodeId = string
export type SpatialEdgeId = string

export type WorldContextKind =
  | 'campaign-root'
  | 'world'
  | 'universe'
  | 'plane'
  | 'galaxy'
  | 'planet'
  | 'continent'
  | 'region'
  | 'settlement'
  | 'scene'
  | 'vehicle'
  | 'dream'
  | 'digital'
  | 'abstract'

export type WorldContextLifecycle = 'open' | 'dormant' | 'closed'
export type SimulationScope = 'active' | 'background' | 'dormant' | 'closed'

export type ContextCapability =
  | 'life'
  | 'space'
  | 'technology'
  | 'supernatural'

export interface LocalCalendarProfile {
  calendarId: string
  displayName: string
  daysPerYear: number
  monthsPerYear: number
  timeScale: number
  pausedWhenInactive: boolean
}

export interface LocalClockState {
  /** 当地模拟游标；基础点是由日历游标派生的统一业务投影。 */
  totalBasePoints: number
  /** 上次同步时对应的全局基础点游标。 */
  lastGlobalTotalBasePoints: number
  /** 由 totalBasePoints 按当地历法派生的显示天数。 */
  totalLocalDays: number
  /** 由 lastGlobalTotalBasePoints 派生的兼容日期快照。 */
  lastGlobalTotalDays: number
}

export interface WorldContextRecord {
  id: WorldContextId
  parentContextId?: WorldContextId
  kind: WorldContextKind
  name: string
  description: string
  lifecycle: WorldContextLifecycle
  rootSpatialNodeId: SpatialNodeId
  /** 上下文创建时的全局基础点投影。 */
  createdAtGlobalBasePoints: number
  /** 由 createdAtGlobalBasePoints 派生的日期快照。 */
  createdAtGlobalDay: number
  localCalendar: LocalCalendarProfile
  localClock: LocalClockState
  legacyWorldCode?: number
}

export interface ContextCapabilityProfile {
  contextId: WorldContextId
  capabilities: ContextCapability[]
  enabledSubsystemIds: string[]
  backgroundSubsystemIds: string[]
  derivedFrom: 'world-config' | 'confirmed-facts' | 'migration'
}

export interface SpatialNode {
  id: SpatialNodeId
  contextId: WorldContextId
  parentNodeId?: SpatialNodeId
  kind: WorldContextKind
  name: string
  localId?: string
  attributes: Record<string, unknown>
}

export type SpatialEdgeKind = 'contains' | 'adjacent' | 'route' | 'portal' | 'transition'

export interface SpatialEdge {
  id: SpatialEdgeId
  kind: SpatialEdgeKind
  fromNodeId: SpatialNodeId
  toNodeId: SpatialNodeId
  bidirectional: boolean
  enabled: boolean
  distance?: number
  requirements?: string[]
}

export interface RegionNarrativeProfile {
  regionId: SpatialNodeId
  name: string
  summary: string
  climate: string
  ecology: string
  resources: string[]
  pollution: string
  economy: string
  population: string
  settlement: string
  culture: string
  education: string
  socialStructure: string
  factions: string
  law: string
  updatedAtGlobalDay: number
}

export interface SpatialGraphContract {
  contextId: WorldContextId
  worldForm: string
  rootNodeId: SpatialNodeId
  currentRegionId: SpatialNodeId
  nodes: Record<SpatialNodeId, SpatialNode>
  edges: Record<SpatialEdgeId, SpatialEdge>
  regionProfiles: Record<SpatialNodeId, RegionNarrativeProfile>
}

export interface SimulationScopeRecord {
  contextId: WorldContextId
  scope: SimulationScope
  reason: string
  /** 范围变更时的全局基础点；日期字段仅为派生快照。 */
  changedAtGlobalBasePoints: number
  changedAtGlobalDay: number
}

export interface ContextTransitionRequest {
  targetContextId: WorldContextId
  targetRegionId?: SpatialNodeId
  exitEdgeId?: SpatialEdgeId
  /** 已由拥有系统确认满足的出口资格 ID */
  satisfiedRequirementIds?: string[]
  leaveScope?: Exclude<SimulationScope, 'active' | 'closed'>
}

export interface ContextTransitionRecord {
  id: string
  sourceContextId: WorldContextId
  targetContextId: WorldContextId
  sourceRegionId: SpatialNodeId
  targetRegionId: SpatialNodeId
  exitEdgeId: SpatialEdgeId
  /** 切换提交时的全局基础点。 */
  globalTotalBasePoints: number
  /** 由 globalTotalBasePoints 派生的日期快照。 */
  globalTotalDays: number
  /** 来源上下文当地基础点游标。 */
  sourceLocalBasePoints: number
  sourceLocalDays: number
  /** 目标上下文当地基础点游标。 */
  targetLocalBasePoints: number
  targetLocalDays: number
  status: 'committed' | 'rejected' | 'failed'
  reason?: string
}

export interface ContextTransitionResult {
  ok: boolean
  record: ContextTransitionRecord
}

export interface WorldContextRegistryContract {
  currentContextId: WorldContextId | null
  contexts: Record<WorldContextId, WorldContextRecord>
}

export interface ContextCapabilityProfileContract {
  profiles: Record<WorldContextId, ContextCapabilityProfile>
}

export interface SimulationScopePolicyContract {
  scopes: Record<WorldContextId, SimulationScopeRecord>
}
