/**
 * @module world-context-api.ts
 * @description P0 多世界上下文重 API；创建、连接、切换与查询
 * @mod mod-world
 */

import type {
  ContextTransitionRequest,
  ContextTransitionResult,
  ContextCapability,
  EntitySpatialLocation,
  EntityReference,
  EntityReferenceKind,
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
import { getWorldEntitySystem } from './subsystems/world-entity-system'
import { createCrossContextExit } from './utils/world-context-runtime'

export async function createAdditionalWorldContext(
  config: WorldConfig,
  options?: AdditionalWorldContextOptions,
) {
  if (options?.globalTotalDays !== undefined || Object.keys(useWorldStore.getState().contexts).length === 0) {
    return createAdditionalWorldContextInternal(config, options)
  }
  const { orchestrator } = await import('@/mods/mod-engine/engine-api')
  return createAdditionalWorldContextInternal(config, {
    ...options,
    globalTotalDays: orchestrator.getState().round.totalDays,
  })
}

/** 玩家/页面只提交目的地与同行实体；actor 必须由当前角色 Store 注入。 */
export type WorldContextTransitionIntent = Omit<ContextTransitionRequest, 'actorEntityId'> & {
  actorEntityId?: never
}

export function listWorldContexts(): WorldContextInstance[] {
  return Object.values(useWorldStore.getState().contexts).map((instance) => structuredClone(instance))
}

export function getCurrentWorldContext(): WorldContextInstance | null {
  const state = useWorldStore.getState()
  const instance = state.currentContextId ? state.contexts[state.currentContextId] : undefined
  return instance ? structuredClone(instance) : null
}

export function registerWorldEntityReference(reference: EntityReference): EntityReference {
  return getWorldEntitySystem().registerEntityReference(reference)
}

export function getWorldEntityReference(entityId: string): EntityReference | undefined {
  return getWorldEntitySystem().getEntityReference(entityId)
}

export function listWorldEntityReferences(): EntityReference[] {
  return getWorldEntitySystem().listEntityReferences()
}

/** 刷新恢复窗口中，从世界上下文与空间图重建缺失的实体目录投影。 */
export function repairWorldEntityReferenceDirectory(): { fallbackEntityIds: string[] } {
  return getWorldEntitySystem().repairEntityReferenceDirectory()
}

export function assertWorldEntityReference(
  entityId: string,
  allowedKinds?: readonly EntityReferenceKind[],
): EntityReference {
  return getWorldEntitySystem().assertEntityReference(entityId, allowedKinds)
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

export function assertWorldEntityLocation(location: EntitySpatialLocation): void {
  assertWorldEntityReference(location.entityId)
  getSpatialGraphSystem().assertEntityLocation(location)
}

export function listCoLocatedWorldEntityIds(
  contextId: string,
  anchorEntityId: string,
): string[] {
  const instance = useWorldStore.getState().contexts[contextId]
  if (!instance) throw new Error(`查询同场实体时上下文不存在：${contextId}`)
  const anchor = instance.spatialGraph.entityLocations[anchorEntityId]
  if (!anchor) return [anchorEntityId]
  return Object.values(instance.spatialGraph.entityLocations)
    .filter((location) => location.nodeId === anchor.nodeId)
    .map((location) => location.entityId)
}

export function moveWorldEntityLocation(location: EntitySpatialLocation): void {
  assertWorldEntityLocation(location)
  getSpatialGraphSystem().setEntityLocation(location)
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
  globalTotalDays: number,
): void {
  const state = useWorldStore.getState()
  if (state.currentContextId === contextId) throw new Error('不能关闭当前 active 上下文')
  if (!Number.isFinite(globalTotalDays) || globalTotalDays < 0) {
    throw new Error('关闭上下文必须提供规范的非负 globalTotalDays')
  }
  getSimulationScopePolicySystem().setScope(contextId, 'closed', reason, globalTotalDays)
}

export async function transitionToWorldContext(
  request: WorldContextTransitionIntent,
): Promise<ContextTransitionResult> {
  const { ensureOrchestratorContextFromStores, orchestrator } = await import('@/mods/mod-engine/engine-api')
  const { useCharacterStore } = await import('@/mods/mod-character')
  const characterState = useCharacterStore.getState()
  const actorEntityId = characterState.characterId || characterState.ensureCharacterId()
  const previousCharacterState = useCharacterStore.getState()
  const previousOrchestratorSnapshot = orchestrator.captureSnapshot()
  const result = await getContextTransitionSystem().transition(
    {
      ...request,
      actorEntityId,
    },
    orchestrator.getState().round.totalDays,
    {
      actorEntityId,
      apply: () => ensureOrchestratorContextFromStores(),
      rollback: () => {
        useCharacterStore.setState(previousCharacterState, true)
        orchestrator.restoreSnapshot(previousOrchestratorSnapshot)
        if (!ensureOrchestratorContextFromStores()) {
          throw new Error('无法恢复切换前的世界与角色运行上下文')
        }
      },
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
