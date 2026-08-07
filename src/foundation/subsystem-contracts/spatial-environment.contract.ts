/**
 * Purpose: Define the read-only map projection derived from world regions.
 * Owner: foundation / mod-world-map public boundary.
 * Responsibility: Cross-domain projection shapes only; region facts stay in mod-world.
 */

import type {
  RegionNarrativeProfile,
  SpatialEdgeId,
  SpatialEdgeKind,
  SpatialNodeId,
  WorldContextId,
  WorldContextKind,
} from './world-context.contract'

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
  profile?: RegionNarrativeProfile
  isCurrentRegion: boolean
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
  nodes: MapProjectionNode[]
  edges: MapProjectionEdge[]
}

export interface MapProjectionRequest {
  contextId: WorldContextId
  totalDays: number
  knownNodeIds?: SpatialNodeId[]
}
