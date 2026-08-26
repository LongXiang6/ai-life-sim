/**
 * Purpose: Expose world-context creation, transition, and query operations.
 * Owner: mod-world
 * Responsibility: Public API wiring only; context state remains in the world store and systems.
 *
 * @module world-context-api.ts
 * @description P0 多世界上下文重 API；创建、连接、切换与查询
 * @mod mod-world
 */

import type {
  ContextTransitionRequest,
  ContextTransitionResult,
  ContextCapability,
  SpatialEdge,
  SpatialNodeId,
} from '@/foundation'

import { useWorldStore } from './store'
import type { WorldConfig, WorldContextInstance } from './types'
import {
  createAdditionalWorldContext as createAdditionalWorldContextInternal,
  type AdditionalWorldContextOptions,
} from './world-init-bundle'
import { getContextTransitionSystem } from './subsystems/context-transition-system'
import { getSimulationScopePolicySystem } from './subsystems/simulation-scope-policy-system'
import { getSpatialGraphSystem } from './subsystems/spatial-graph-system'
import { createCrossContextExit } from './utils/world-context-runtime'

export async function createAdditionalWorldContext(
  config: WorldConfig,
  options?: AdditionalWorldContextOptions,
) {
  if (options?.globalTotalBasePoints !== undefined || Object.keys(useWorldStore.getState().contexts).length === 0) {
    return createAdditionalWorldContextInternal(config, options)
  }
  const { orchestrator } = await import('@/mods/mod-engine/engine-api')
  return createAdditionalWorldContextInternal(config, {
    ...options,
    globalTotalBasePoints: orchestrator.getState().round.totalBasePoints,
  })
}

/** 玩家/页面只提交目的上下文或区域，不提交实体位置。 */
export type WorldContextTransitionIntent = ContextTransitionRequest

export function listWorldContexts(): WorldContextInstance[] {
  return Object.values(useWorldStore.getState().contexts).map((instance) => structuredClone(instance))
}

export function getCurrentWorldContext(): WorldContextInstance | null {
  const state = useWorldStore.getState()
  const instance = state.currentContextId ? state.contexts[state.currentContextId] : undefined
  return instance ? structuredClone(instance) : null
}

export function contextHasCapability(contextId: string, capability: ContextCapability): boolean {
  return useWorldStore.getState().contexts[contextId]?.capabilityProfile.capabilities.includes(capability) ?? false
}

export function canRunBackgroundWorldSubsystem(contextId: string, subsystemId: string): boolean {
  const instance = useWorldStore.getState().contexts[contextId]
  return instance?.scope.scope === 'background'
    && instance.capabilityProfile.backgroundSubsystemIds.includes(subsystemId)
}

export function assertWorldSpatialNode(contextId: string, nodeId: SpatialNodeId): void {
  const node = useWorldStore.getState().contexts[contextId]?.spatialGraph.nodes[nodeId]
  if (!node || node.contextId !== contextId) throw new Error(`空间节点不存在：${nodeId}`)
}

export function getCurrentRegion(contextId = useWorldStore.getState().currentContextId ?? '') {
  const instance = useWorldStore.getState().contexts[contextId]
  if (!instance) return null
  const regionId = instance.spatialGraph.currentRegionId
  return instance.spatialGraph.regionProfiles[regionId]
    ? structuredClone(instance.spatialGraph.regionProfiles[regionId])
    : null
}

export function setCurrentRegion(contextId: string, regionId: SpatialNodeId): void {
  getSpatialGraphSystem().setCurrentRegion(contextId, regionId)
}

export function connectWorldContexts(
  sourceContextId: string,
  targetContextId: string,
  bidirectional = true,
): SpatialEdge {
  const state = useWorldStore.getState()
  const source = state.contexts[sourceContextId]
  const target = state.contexts[targetContextId]
  if (!source || !target) throw new Error('建立出口失败：来源或目标上下文不存在')
  const edge = createCrossContextExit(source, target, bidirectional)
  getSpatialGraphSystem().addCrossContextExit(edge)
  return structuredClone(edge)
}

export function closeWorldContext(
  contextId: string,
  reason: string,
  globalTotalBasePoints: number,
): void {
  const state = useWorldStore.getState()
  if (state.currentContextId === contextId) throw new Error('不能关闭当前 active 上下文')
  if (!Number.isFinite(globalTotalBasePoints) || globalTotalBasePoints < 0) {
    throw new Error('关闭上下文必须提供规范的非负 globalTotalBasePoints')
  }
  getSimulationScopePolicySystem().setScope(contextId, 'closed', reason, globalTotalBasePoints)
}

export async function transitionToWorldContext(
  request: WorldContextTransitionIntent,
): Promise<ContextTransitionResult> {
  const { ensureOrchestratorContextFromStores, orchestrator } = await import('@/mods/mod-engine/engine-api')
  const result = await getContextTransitionSystem().transition(
    request,
    orchestrator.getState().round.totalBasePoints,
    {
      apply: () => ensureOrchestratorContextFromStores(),
    },
  )
  return result
}

export async function createConnectedWorldContext(
  config: WorldConfig,
  options?: AdditionalWorldContextOptions,
) {
  return createAdditionalWorldContext(config, {
    ...options,
    connectFromCurrent: options?.connectFromCurrent ?? true,
  })
}
