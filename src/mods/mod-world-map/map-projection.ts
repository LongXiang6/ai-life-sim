/** Pure read projection from spatial ownership into a deterministic map view. */

import type {
  MapProjection,
  MapProjectionKind,
  MapProjectionNode,
  MapProjectionRequest,
  SpatialEdge,
  SpatialNode,
  WorldContextKind,
} from '@/foundation'
import {
  getGeographySystem,
  getNaturalResourceSystem,
} from '@/mods/mod-environment-ecology/environment-simulation-api'
import { useWorldStore } from '@/mods/mod-world'

function requireTotalDays(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error('地图投影时间必须是非负整数')
  return value
}

function projectionKind(kind: WorldContextKind, spatialForm: string): MapProjectionKind {
  if (['universe', 'galaxy'].includes(kind) || /star|galaxy|universe/i.test(spatialForm)) return 'star-chart'
  if (kind === 'plane' || /plane|multiverse|omniverse/i.test(spatialForm)) return 'plane-chart'
  if (['settlement', 'scene', 'vehicle', 'dream', 'digital'].includes(kind)) return 'scene-navigation'
  return 'map'
}

function nodePosition(index: number, count: number, isRoot: boolean): { x: number; y: number } {
  if (isRoot || count <= 1) return { x: 0, y: 0 }
  const ringIndex = index - 1
  const ring = Math.floor(Math.sqrt(ringIndex)) + 1
  const start = (ring - 1) * (ring - 1)
  const ringCount = Math.max(1, ring * ring - start + ring * 2)
  const angle = ((ringIndex - start) / ringCount) * Math.PI * 2 - Math.PI / 2
  return {
    x: Math.cos(angle) * ring,
    y: Math.sin(angle) * ring,
  }
}

function nodeContextId(nodeId: string, contexts: ReturnType<typeof useWorldStore.getState>['contexts']): string | undefined {
  for (const [contextId, instance] of Object.entries(contexts)) {
    if (instance.spatialGraph.nodes[nodeId]) return contextId
  }
  return undefined
}

function crossContextEdgesFor(
  contextNodeIds: Set<string>,
  edges: Record<string, SpatialEdge>,
): SpatialEdge[] {
  return Object.values(edges).filter((edge) => (
    contextNodeIds.has(edge.fromNodeId) || contextNodeIds.has(edge.toNodeId)
  ))
}

export function projectWorldMap(request: MapProjectionRequest): MapProjection {
  const totalDays = requireTotalDays(request.totalDays)
  const world = useWorldStore.getState()
  const context = world.contexts[request.contextId]
  if (!context) throw new Error(`地图投影引用未知上下文：${request.contextId}`)

  const playerEntityId = Object.values(world.entityReferences)
    .filter((reference) => reference.kind === 'player')
    .sort((left, right) => left.entityId.localeCompare(right.entityId))[0]?.entityId
  const observerEntityId = request.observerEntityId ?? playerEntityId
  const observerLocation = observerEntityId
    ? Object.values(world.contexts)
        .map((instance) => instance.spatialGraph.entityLocations[observerEntityId])
        .find(Boolean)
    : undefined

  const localNodes = Object.values(context.spatialGraph.nodes)
  const localNodeIds = new Set(localNodes.map((node) => node.id))
  const crossEdges = crossContextEdgesFor(localNodeIds, world.crossContextEdges)
  const remoteNodeIds = [...new Set(crossEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]))]
    .filter((nodeId) => !localNodeIds.has(nodeId))
  const remoteNodes = remoteNodeIds.flatMap((nodeId): SpatialNode[] => {
    const contextId = nodeContextId(nodeId, world.contexts)
    const node = contextId ? world.contexts[contextId]?.spatialGraph.nodes[nodeId] : undefined
    return node ? [node] : []
  })
  const orderedNodes = [...localNodes, ...remoteNodes]
    .sort((left, right) => {
      if (left.id === context.record.rootSpatialNodeId) return -1
      if (right.id === context.record.rootSpatialNodeId) return 1
      return left.id.localeCompare(right.id)
    })

  const knownNodeIds = request.knownNodeIds ? new Set(request.knownNodeIds) : null
  const geography = getGeographySystem()
  const resources = getNaturalResourceSystem()
  const nodes: MapProjectionNode[] = orderedNodes.map((node, index) => {
    const instance = world.contexts[node.contextId]
    const locationEntries = instance
      ? Object.values(instance.spatialGraph.entityLocations).filter((location) => location.nodeId === node.id)
      : []
    const isCurrentLocation = observerLocation?.contextId === node.contextId && observerLocation.nodeId === node.id
    const position = nodePosition(index, orderedNodes.length, node.id === context.record.rootSpatialNodeId)
    return {
      nodeId: node.id,
      contextId: node.contextId,
      ...(node.parentNodeId ? { parentNodeId: node.parentNodeId } : {}),
      kind: node.kind,
      name: node.name,
      ...position,
      visibility: isCurrentLocation
        ? 'current'
        : (!knownNodeIds || knownNodeIds.has(node.id) ? 'known' : 'unknown'),
      geography: geography.getNode(node.contextId, node.id),
      resources: resources.listDeposits(node.contextId, node.id),
      entityIds: locationEntries.map((location) => location.entityId).sort(),
      isCurrentLocation,
    }
  })

  const allNodeIds = new Set(nodes.map((node) => node.nodeId))
  const edges = [...Object.values(context.spatialGraph.edges), ...crossEdges]
    .filter((edge) => allNodeIds.has(edge.fromNodeId) && allNodeIds.has(edge.toNodeId))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((edge) => ({
      edgeId: edge.id,
      kind: edge.kind,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      bidirectional: edge.bidirectional,
      enabled: edge.enabled,
      crossContext: nodeContextId(edge.fromNodeId, world.contexts) !== nodeContextId(edge.toNodeId, world.contexts),
    }))

  return {
    contextId: context.record.id,
    contextName: context.record.name,
    kind: projectionKind(context.record.kind, context.worldConfig.spatialForm),
    generatedAtTotalDays: totalDays,
    ...(observerEntityId ? { observerEntityId } : {}),
    nodes,
    edges,
  }
}
