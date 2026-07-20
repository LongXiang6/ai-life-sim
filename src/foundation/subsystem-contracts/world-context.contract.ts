/**
 * @module world-context.contract.ts
 * @description P0 多世界基础的 provider-owned 跨域纯类型契约
 * @mod foundation
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
  | 'npc'
  | 'economy'
  | 'politics'
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
  totalLocalDays: number
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

export interface EntitySpatialLocation {
  entityId: GlobalEntityId
  contextId: WorldContextId
  nodeId: SpatialNodeId
  updatedAtGlobalDay: number
}

export interface SpatialGraphContract {
  contextId: WorldContextId
  rootNodeId: SpatialNodeId
  nodes: Record<SpatialNodeId, SpatialNode>
  edges: Record<SpatialEdgeId, SpatialEdge>
  entityLocations: Record<GlobalEntityId, EntitySpatialLocation>
}

export interface SimulationScopeRecord {
  contextId: WorldContextId
  scope: SimulationScope
  reason: string
  changedAtGlobalDay: number
}

export interface ContextTransitionRequest {
  targetContextId: WorldContextId
  exitEdgeId?: SpatialEdgeId
  actorEntityId: GlobalEntityId
  carriedEntityIds?: GlobalEntityId[]
  companionEntityIds?: GlobalEntityId[]
  /** 已由拥有系统确认满足的出口资格 ID */
  satisfiedRequirementIds?: string[]
  leaveScope?: Exclude<SimulationScope, 'active' | 'closed'>
}

export interface ContextTransitionRecord {
  id: string
  sourceContextId: WorldContextId
  targetContextId: WorldContextId
  exitEdgeId: SpatialEdgeId
  actorEntityId: GlobalEntityId
  movedEntityIds: GlobalEntityId[]
  globalTotalDays: number
  sourceLocalDays: number
  targetLocalDays: number
  status: 'committed' | 'rejected' | 'rolled-back'
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
