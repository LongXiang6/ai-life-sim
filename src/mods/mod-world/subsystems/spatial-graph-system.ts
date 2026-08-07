/**
 * SpatialGraphSystem
 *
 * 职责：拥有世界形态、区域节点、边、跨上下文出口和当前区域。
 * 非职责：不拥有地图 UI、详细地点、移动叙事或切换提交。
 * 输入：经过拥有者校验的空间节点、边和区域切换事件。
 * 输出与写入：上下文 spatialGraph 与 crossContextEdges。
 * AI 参与：事件输入。
 * 状态权威：mod-world Store。
 * 持久化权威：world Store。
 * 运行存活：mod-world manifest 与 MVP runtime policy。
 */

/**
 * Purpose: Own world shape, region nodes, edges, and current region.
 * Owner: mod-world
 * Responsibility: Spatial graph state only; context lifecycle and narrative facts remain outside.
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type {
  RoundContext,
  SpatialEdge,
  SpatialNode,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'

import { useWorldStore } from '../store'
import type { WorldContextInstance } from '../types'

const REGION_PROFILE_TEXT_FIELDS = new Set([
  'summary',
  'climate',
  'ecology',
  'pollution',
  'economy',
  'population',
  'settlement',
  'culture',
  'education',
  'socialStructure',
  'factions',
  'law',
])

const REGION_PROFILE_FIELDS = new Set([
  ...REGION_PROFILE_TEXT_FIELDS,
  'resources',
])

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

export class SpatialGraphSystem extends BaseSubsystem {
  readonly id = 'spatial-graph' as const
  readonly mod = 'mod-world' as const
  readonly label = '世界区域' as const
  readonly description = '管理世界形态、区域层级、关联边、出口、可达性和当前区域' as const

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

  setCurrentRegion(contextId: string, regionId: string): void {
    const state = useWorldStore.getState()
    const instance = state.contexts[contextId]
    const node = instance?.spatialGraph.nodes[regionId]
    if (!instance || !node || node.contextId !== contextId || node.kind !== 'region') {
      throw new Error(`区域引用未知节点：${regionId}`)
    }
    state.replaceContext({
      ...instance,
      spatialGraph: { ...instance.spatialGraph, currentRegionId: regionId },
    })
  }

  collectState(context: RoundContext): SubSystemState {
    const state = useWorldStore.getState()
    const instance = state.contexts[context.contextId]
    const graph = instance?.spatialGraph
    const currentRegionNode = graph?.nodes[graph.currentRegionId]
    const currentRegionProfile = graph?.regionProfiles[graph.currentRegionId]
    const graphSummary = graph
      ? `世界形态 ${graph.worldForm}；当前区域 ${currentRegionNode?.name ?? '未选择'}；区域 ${Object.keys(graph.regionProfiles).length} 个，关联边 ${Object.keys(graph.edges).length} 条，跨界出口 ${Object.keys(state.crossContextEdges).length} 个`
      : '未建立'
    return {
      id: this.id,
      summary: `【${this.label}：${graphSummary}】`,
      data: graph
        ? {
            ...structuredClone(graph),
            currentRegionName: currentRegionNode?.name ?? null,
            currentRegionProfile: currentRegionProfile ? structuredClone(currentRegionProfile) : null,
          }
        : {},
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] Changes must be an object`)
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Changes payload must be a plain object`)
    }
    if (!changes.description || changes.description.trim().length === 0) {
      throw new Error(`[${this.id}] Changes description is required`)
    }
    if (changes.operation !== 'update-region-profile') {
      throw new Error(`[${this.id}] 不支持操作：${changes.operation ?? '未声明'}`)
    }
    if (changes.targetContextId !== context.contextId) {
      throw new Error(`[${this.id}] 区域概况目标上下文不是当前回合上下文`)
    }
    if (!changes.targetObjectId) {
      throw new Error(`[${this.id}] 区域概况缺少目标区域`)
    }
    const state = useWorldStore.getState()
    const instance = state.contexts[context.contextId]
    if (!instance) throw new Error(`[${this.id}] 未知上下文：${context.contextId}`)
    const graph = instance.spatialGraph
    const targetNode = graph.nodes[changes.targetObjectId]
    if (!targetNode || targetNode.contextId !== context.contextId || targetNode.kind !== 'region') {
      throw new Error(`[${this.id}] 区域概况目标不是当前上下文中的区域：${changes.targetObjectId}`)
    }
    if (graph.currentRegionId !== changes.targetObjectId) {
      throw new Error(`[${this.id}] 只允许更新当前区域概况：${changes.targetObjectId}`)
    }
    const currentProfile = graph.regionProfiles[changes.targetObjectId]
    if (!currentProfile) throw new Error(`[${this.id}] 当前区域缺少概况：${changes.targetObjectId}`)

    const requestedChanges = changes.changes
    const requestedFields = Object.keys(requestedChanges)
    if (requestedFields.length === 0) throw new Error(`[${this.id}] 区域概况变更不能为空`)
    for (const field of requestedFields) {
      if (!REGION_PROFILE_FIELDS.has(field)) throw new Error(`[${this.id}] 不允许更新区域字段：${field}`)
      const value = requestedChanges[field]
      if (REGION_PROFILE_TEXT_FIELDS.has(field)) {
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new Error(`[${this.id}] 区域字段 ${field} 必须为非空文本`)
        }
        continue
      }
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
        throw new Error(`[${this.id}] 区域字段 resources 必须为字符串数组`)
      }
    }

    const nextProfile = {
      ...currentProfile,
      ...Object.fromEntries(Object.entries(requestedChanges).map(([field, value]) => (
        [field, Array.isArray(value) ? value.map((item) => item.trim()) : (value as string).trim()]
      ))),
      updatedAtGlobalDay: context.totalDays,
    }
    state.replaceContext({
      ...instance,
      spatialGraph: {
        ...graph,
        regionProfiles: {
          ...graph.regionProfiles,
          [changes.targetObjectId]: nextProfile,
        },
      },
    })
  }

  reset(): void {}
}

let runtimeSpatialGraphSystem: SpatialGraphSystem | undefined

export function getSpatialGraphSystem(): SpatialGraphSystem {
  runtimeSpatialGraphSystem ??= new SpatialGraphSystem()
  return runtimeSpatialGraphSystem
}
