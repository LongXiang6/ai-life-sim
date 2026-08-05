/**
 * SpatialGraphSystem
 *
 * 职责：拥有统一空间节点、边、跨上下文出口和实体位置。
 * 非职责：不拥有地图 UI、地理资源、移动叙事或切换提交。
 * 输入：经过拥有者校验的空间节点、边和实体位置事件。
 * 输出与写入：上下文 spatialGraph 与 crossContextEdges。
 * AI 参与：事件输入。
 * 状态权威：mod-world Store。
 * 持久化权威：world Store。
 * 运行存活：mod-world manifest 与 MVP runtime policy。
 */

/**
 * Purpose: Own world spatial nodes, edges, and entity locations.
 * Owner: mod-world
 * Responsibility: Spatial graph state only; world-context instances and entity identities remain with their owning systems.
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type {
  EntitySpatialLocation,
  RoundContext,
  SpatialEdge,
  SpatialNode,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'

import { useWorldStore } from '../store'
import type { WorldContextInstance } from '../types'

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => structurallyEqual(item, right[index]))
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key, index) => (
    key === rightKeys[index]
    && structurallyEqual(leftRecord[key], rightRecord[key])
  ))
}

function assertValidNodeParent(
  contextId: string,
  node: SpatialNode,
  nodes: Record<string, SpatialNode>,
): void {
  if (!node.parentNodeId) return
  if (node.parentNodeId === node.id) throw new Error(`空间节点不能自引用：${node.id}`)

  const visited = new Set([node.id])
  let currentId: string | undefined = node.parentNodeId
  while (currentId) {
    if (visited.has(currentId)) throw new Error(`空间节点父链成环：${node.id}`)
    visited.add(currentId)
    const current: SpatialNode | undefined = nodes[currentId]
    if (!current) throw new Error(`空间节点父级不存在：${currentId}`)
    if (current.contextId !== contextId) throw new Error(`空间节点父级跨越上下文：${currentId}`)
    currentId = current.parentNodeId
  }
}

/**
 * 空间位置的单一写入规则：同一全局实体在整个存档中只能保留一个当前位置。
 * 先完整校验全部目标位置，再克隆并提交，避免批量迁移出现半写入。
 */
export function placeEntityLocationsUniquely(
  contexts: Record<string, WorldContextInstance>,
  locations: EntitySpatialLocation[],
): Record<string, WorldContextInstance> {
  const locationByEntityId = new Map<string, EntitySpatialLocation>()
  for (const input of locations) {
    const location = structuredClone(input)
    if (!location.entityId.trim()) throw new Error('实体位置缺少全局实体 ID')
    const instance = contexts[location.contextId]
    const node = instance?.spatialGraph.nodes[location.nodeId]
    if (!instance || !node || node.contextId !== location.contextId) {
      throw new Error(`实体位置引用未知节点：${location.nodeId}`)
    }
    const existing = locationByEntityId.get(location.entityId)
    if (existing && (
      existing.contextId !== location.contextId
      || existing.nodeId !== location.nodeId
    )) {
      throw new Error(`同一批次为实体指定了多个位置：${location.entityId}`)
    }
    locationByEntityId.set(location.entityId, location)
  }

  const nextContexts = structuredClone(contexts)
  for (const instance of Object.values(nextContexts)) {
    for (const entityId of locationByEntityId.keys()) {
      delete instance.spatialGraph.entityLocations[entityId]
    }
  }
  for (const location of locationByEntityId.values()) {
    nextContexts[location.contextId].spatialGraph.entityLocations[location.entityId] = location
  }
  return nextContexts
}

export class SpatialGraphSystem extends BaseSubsystem {
  readonly id = 'spatial-graph' as const
  readonly mod = 'mod-world' as const
  readonly label = '空间关系图' as const
  readonly description = '管理统一位置层级、邻接、出口、可达性和实体当前位置' as const

  addNode(contextId: string, node: SpatialNode): void {
    const state = useWorldStore.getState()
    const instance = state.contexts[contextId]
    if (!instance || node.contextId !== contextId) throw new Error(`空间节点上下文无效：${node.id}`)
    assertValidNodeParent(contextId, node, instance.spatialGraph.nodes)
    const existing = instance.spatialGraph.nodes[node.id]
    if (existing) {
      if (structurallyEqual(existing, node)) return
      throw new Error(`空间节点 ID 已存在且内容不同：${node.id}`)
    }
    state.replaceContext({
      ...instance,
      spatialGraph: {
        ...instance.spatialGraph,
        nodes: { ...instance.spatialGraph.nodes, [node.id]: structuredClone(node) },
      },
    })
  }

  addEdge(contextId: string, edge: SpatialEdge): void {
    const state = useWorldStore.getState()
    const instance = state.contexts[contextId]
    if (!instance) throw new Error(`未知上下文：${contextId}`)
    const nodes = instance.spatialGraph.nodes
    if (
      !nodes[edge.fromNodeId]
      || !nodes[edge.toNodeId]
      || nodes[edge.fromNodeId].contextId !== contextId
      || nodes[edge.toNodeId].contextId !== contextId
    ) {
      throw new Error(`空间边引用未知节点：${edge.id}`)
    }
    const existing = instance.spatialGraph.edges[edge.id]
    if (existing) {
      if (structurallyEqual(existing, edge)) return
      throw new Error(`空间边 ID 已存在且内容不同：${edge.id}`)
    }
    state.replaceContext({
      ...instance,
      spatialGraph: {
        ...instance.spatialGraph,
        edges: { ...instance.spatialGraph.edges, [edge.id]: structuredClone(edge) },
      },
    })
  }

  addCrossContextExit(edge: SpatialEdge): void {
    const state = useWorldStore.getState()
    const nodeIds = new Set(Object.values(state.contexts).flatMap((instance) => Object.keys(instance.spatialGraph.nodes)))
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      throw new Error(`跨上下文出口引用未知节点：${edge.id}`)
    }
    const existing = state.crossContextEdges[edge.id]
    if (existing) {
      if (structurallyEqual(existing, edge)) return
      throw new Error(`跨上下文出口 ID 已存在且内容不同：${edge.id}`)
    }
    state.setCrossContextEdge(edge)
  }

  setEntityLocation(location: EntitySpatialLocation): void {
    const state = useWorldStore.getState()
    this.assertEntityLocation(location)
    useWorldStore.setState({
      contexts: placeEntityLocationsUniquely(state.contexts, [location]),
    })
  }

  assertEntityLocation(location: EntitySpatialLocation): void {
    const instance = useWorldStore.getState().contexts[location.contextId]
    const node = instance?.spatialGraph.nodes[location.nodeId]
    if (!instance || !node || node.contextId !== location.contextId) {
      throw new Error(`实体位置引用未知节点：${location.nodeId}`)
    }
  }

  collectState(context: RoundContext): SubSystemState {
    const state = useWorldStore.getState()
    const instance = state.contexts[context.contextId]
    const graph = instance?.spatialGraph
    const graphSummary = graph
      ? `节点 ${Object.keys(graph.nodes).length}，边 ${Object.keys(graph.edges).length}，跨界出口 ${Object.keys(state.crossContextEdges).length}`
      : '未建立'
    return {
      id: this.id,
      summary: `【${this.label}：${graphSummary}】`,
      data: graph ? structuredClone(graph) : {},
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] Changes must be an object`)
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Changes payload must be a plain object`)
    }
    if (!changes.description || changes.description.trim().length === 0) {
      throw new Error(`[${this.id}] Changes description is required`)
    }
    const requestedChanges = changes.changes
    void requestedChanges
    throw new Error(`[${this.id}] 只接受拥有系统校验后的空间事件，不接受叙事 AI 直接写入`)
  }

  reset(): void {}
}

let runtimeSpatialGraphSystem: SpatialGraphSystem | undefined

export function getSpatialGraphSystem(): SpatialGraphSystem {
  runtimeSpatialGraphSystem ??= new SpatialGraphSystem()
  return runtimeSpatialGraphSystem
}
