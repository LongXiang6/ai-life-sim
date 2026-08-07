/**
 * Purpose: Namespace regions and build the regional graph owned by one world context.
 * Owner: mod-world / spatial-graph.
 * Responsibility: Region identity and graph projection only; context lifecycle stays outside.
 */

import type {
  RegionNarrativeProfile,
  SpatialEdge,
  SpatialGraphContract,
  SpatialNode,
  WorldContextKind,
} from '@/foundation'
import type { RegionData, WorldContextInstance } from '../../types'
import {
  createGlobalEntityId,
  createRuntimeId,
  safeContextSegment,
} from './identifiers'

export function namespaceRegions(contextId: string, regions: RegionData[]): {
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

function toProfile(region: RegionData): RegionNarrativeProfile {
  return {
    regionId: region.id,
    name: region.name,
    summary: region.summary,
    climate: region.climate,
    ecology: region.ecology,
    resources: [...region.resources],
    pollution: region.pollution,
    economy: region.economy,
    population: region.population,
    settlement: region.settlement,
    culture: region.culture,
    education: region.education,
    socialStructure: region.socialStructure,
    factions: region.factions,
    law: region.law,
    updatedAtGlobalDay: region.updatedAtGlobalDay,
  }
}

export function buildSpatialGraph(
  contextId: string,
  contextKind: WorldContextKind,
  contextName: string,
  worldForm: string,
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
      attributes: { worldForm },
    },
  }
  const edges: SpatialGraphContract['edges'] = {}
  const regionProfiles: SpatialGraphContract['regionProfiles'] = {}
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
    regionProfiles[region.id] = toProfile(region)
    const edgeId = `${contextId}:edge:contains:${safeContextSegment(region.localId ?? region.id)}`
    edges[edgeId] = {
      id: edgeId,
      kind: 'contains',
      fromNodeId: rootNodeId,
      toNodeId: region.id,
      bidirectional: true,
      enabled: true,
    }
  }
  const currentRegionId = regions[0]?.id ?? rootNodeId
  return { contextId, worldForm, rootNodeId, currentRegionId, nodes, edges, regionProfiles }
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
