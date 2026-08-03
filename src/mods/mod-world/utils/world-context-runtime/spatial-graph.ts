/**
 * Purpose: Namespace world entities and build the spatial graph owned by a world context.
 * Owner: mod-world / spatial-graph.
 * Responsibility: Spatial projection only; capability and context lifecycle state stay outside.
 */

import type {
  SpatialEdge,
  SpatialGraphContract,
  SpatialNode,
  WorldContextKind,
} from '@/foundation'
import type { AnyWorldEntity, RegionData, WorldContextInstance } from '../../types'
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

export function namespaceEntities(
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
  return { contextId, rootNodeId, nodes, edges, entityLocations: {} }
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
