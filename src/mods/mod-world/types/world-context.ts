/**
 * Purpose: Define complete world snapshots, context instances, and context collections.
 * Owner: mod-world / world-context-registry.
 * Responsibility: Context aggregate shapes only; creation, validation, and persistence stay outside.
 */

import type {
  ContextCapabilityProfile,
  SimulationScopeRecord,
  SpatialEdge,
  SpatialGraphContract,
  WorldContextRecord,
} from '@/foundation'
import type { WorldCalibration } from './calibration'
import type { RegionData } from './regions'
import type { WorldConfig } from './world-config'
import type { WorldTagsV2 } from './world-tags'

export interface WorldSnapshot {
  contextId: string
  rootSpatialNodeId: string
  worldConfig: WorldConfig
  regions: RegionData[]
  tags: WorldTagsV2
}

export interface WorldContextInstance {
  record: WorldContextRecord
  capabilityProfile: ContextCapabilityProfile
  scope: SimulationScopeRecord
  spatialGraph: SpatialGraphContract
  worldConfig: WorldConfig
  worldCode: number
  initialized: boolean
  regions: RegionData[]
  tags: WorldTagsV2
  worldTags: string[]
  currentYear: number
  eraStartYear: number
  eraName: string
  calibration: WorldCalibration | null
}

export interface WorldContextCollection {
  contexts: Record<string, WorldContextInstance>
  currentContextId: string | null
  crossContextEdges: Record<string, SpatialEdge>
}
