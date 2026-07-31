/**
 * P3 spatial geography, natural resource, and read-side map contracts.
 * Runtime ownership remains with the providing systems; this file is types only.
 */

import type {
  GlobalEntityId,
  SpatialEdgeId,
  SpatialEdgeKind,
  SpatialNodeId,
  WorldContextId,
  WorldContextKind,
} from './world-context.contract'
import type { HistoricalEventId } from './historical-event.contract'

export type TerrainClass =
  | 'plain'
  | 'forest'
  | 'mountain'
  | 'desert'
  | 'water'
  | 'wetland'
  | 'ice'
  | 'volcanic'
  | 'underground'
  | 'artificial'
  | 'celestial'
  | 'void'
  | 'abstract'
  | 'unknown'

export interface NodeGeographyRecord {
  contextId: WorldContextId
  nodeId: SpatialNodeId
  terrainClass: TerrainClass
  displayName: string
  elevation?: number
  temperature?: number
  humidity?: number
  traversability: number
  traitTags: string[]
  hazardTags: string[]
  sourceEventIds: HistoricalEventId[]
  updatedAtTotalDays: number
}

export interface GeographyChangeRecord {
  changeId: string
  contextId: WorldContextId
  nodeId: SpatialNodeId
  changeType: string
  description: string
  occurredAtTotalDays: number
  evidenceEventIds: HistoricalEventId[]
}

export interface GeographyPersistenceState {
  schemaVersion: 1
  nodes: NodeGeographyRecord[]
  changes: GeographyChangeRecord[]
}

export interface GeographyMutationInput {
  contextId: WorldContextId
  nodeId: SpatialNodeId
  terrainClass?: TerrainClass
  displayName?: string
  elevation?: number
  temperature?: number
  humidity?: number
  traversability?: number
  traitTags?: string[]
  hazardTags?: string[]
  description: string
  totalDays: number
  evidenceEventIds: HistoricalEventId[]
}

export type ResourceDepositStatus = 'available' | 'strained' | 'depleted'

export interface NaturalResourceDeposit {
  depositId: string
  contextId: WorldContextId
  nodeId: SpatialNodeId
  resourceTypeId: string
  displayName: string
  unit: string
  quantity: number
  capacity: number
  renewable: boolean
  regenerationPerDay: number
  baselineConsumptionPerDay: number
  status: ResourceDepositStatus
  traitTags: string[]
  sourceEventIds: HistoricalEventId[]
  updatedAtTotalDays: number
}

export interface NaturalResourceTransaction {
  transactionId: string
  depositId: string
  contextId: WorldContextId
  nodeId: SpatialNodeId
  delta: number
  reason: string
  occurredAtTotalDays: number
  evidenceEventIds: HistoricalEventId[]
  source: 'initialization' | 'regeneration' | 'consumption' | 'event'
}

export interface NaturalResourcePersistenceState {
  schemaVersion: 1
  deposits: NaturalResourceDeposit[]
  transactions: NaturalResourceTransaction[]
  lastAdvancedTotalDaysByContext: Record<WorldContextId, number>
}

export interface NaturalResourceDepositInput {
  depositId?: string
  contextId: WorldContextId
  nodeId: SpatialNodeId
  resourceTypeId: string
  displayName: string
  unit: string
  quantity: number
  capacity: number
  renewable: boolean
  regenerationPerDay?: number
  baselineConsumptionPerDay?: number
  traitTags?: string[]
  totalDays: number
  evidenceEventIds?: HistoricalEventId[]
}

export interface NaturalResourceTransactionInput {
  depositId: string
  delta: number
  reason: string
  totalDays: number
  evidenceEventIds: HistoricalEventId[]
}

export type MapProjectionKind = 'map' | 'star-chart' | 'plane-chart' | 'scene-navigation'
export type MapProjectionVisibility = 'current' | 'known' | 'unknown'

export interface MapProjectionNode {
  nodeId: SpatialNodeId
  contextId: WorldContextId
  parentNodeId?: SpatialNodeId
  kind: WorldContextKind
  name: string
  x: number
  y: number
  visibility: MapProjectionVisibility
  geography?: NodeGeographyRecord
  resources: NaturalResourceDeposit[]
  entityIds: GlobalEntityId[]
  isCurrentLocation: boolean
}

export interface MapProjectionEdge {
  edgeId: SpatialEdgeId
  kind: SpatialEdgeKind
  fromNodeId: SpatialNodeId
  toNodeId: SpatialNodeId
  bidirectional: boolean
  enabled: boolean
  crossContext: boolean
}

export interface MapProjection {
  contextId: WorldContextId
  contextName: string
  kind: MapProjectionKind
  generatedAtTotalDays: number
  observerEntityId?: GlobalEntityId
  nodes: MapProjectionNode[]
  edges: MapProjectionEdge[]
}

export interface MapProjectionRequest {
  contextId: WorldContextId
  totalDays: number
  observerEntityId?: GlobalEntityId
  knownNodeIds?: SpatialNodeId[]
}
