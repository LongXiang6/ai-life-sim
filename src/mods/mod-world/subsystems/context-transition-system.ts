/**
 * ContextTransitionSystem
 *
 * 职责：预检并原子迁移当前上下文、实体位置、模拟范围和当地时间。
 * 非职责：不创作到达叙事、不推进规范时间、不拥有物品或同伴业务状态。
 * 输入：ContextTransitionRequest、规范 totalDays、运行上下文注入适配器。
 * 输出与写入：当前投影、上下文状态、位置和完整 transitionHistory。
 * AI 参与：提议；本地预检通过后才提交。
 * 状态权威：mod-world Store。
 * 持久化权威：world Store + save/restore 聚合。
 * 运行存活：mod-world manifest 与 MVP runtime policy。
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import { eventBus } from '@/core'
import type {
  ContextTransitionRecord,
  ContextTransitionRequest,
  ContextTransitionResult,
  RoundContext,
  SpatialEdge,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'

import { useWorldStore } from '../store'
import type { WorldContextInstance } from '../types'
import { placeEntityLocationsUniquely } from './spatial-graph-system'
import {
  createRuntimeId,
  projectWorldContextInstance,
  syncLocalClock,
} from '../utils/world-context-runtime'

type RuntimeContextAdapter = {
  /** 当前角色系统提供的真实全局实体 ID；调用者输入不能覆盖。 */
  actorEntityId: string
  /** 将已投影的新世界/角色状态注入运行系统。 */
  apply: () => boolean | Promise<boolean>
  /** apply 已产生副作用后，按调用者拥有的快照恢复运行系统。 */
  rollback: () => void | Promise<void>
}

function movedEntityIdsOf(request: ContextTransitionRequest): string[] {
  return [...new Set([
    request.actorEntityId,
    ...(request.carriedEntityIds ?? []),
    ...(request.companionEntityIds ?? []),
  ].filter((entityId): entityId is string => typeof entityId === 'string' && entityId.trim().length > 0))]
}

function findTransitionEdge(
  source: WorldContextInstance,
  target: WorldContextInstance,
  edges: Record<string, SpatialEdge>,
  requestedId?: string,
): SpatialEdge | null {
  const candidates = requestedId ? [edges[requestedId]].filter(Boolean) : Object.values(edges)
  return candidates.find((edge) => {
    if (!edge.enabled) return false
    const forward = edge.fromNodeId === source.record.rootSpatialNodeId
      && edge.toNodeId === target.record.rootSpatialNodeId
    const reverse = edge.bidirectional
      && edge.toNodeId === source.record.rootSpatialNodeId
      && edge.fromNodeId === target.record.rootSpatialNodeId
    return forward || reverse
  }) ?? null
}

function transitionRecord(input: {
  source: WorldContextInstance
  target: WorldContextInstance
  edge?: SpatialEdge | null
  request: ContextTransitionRequest
  globalTotalDays: number
  status: ContextTransitionRecord['status']
  reason?: string
}): ContextTransitionRecord {
  const movedEntityIds = movedEntityIdsOf(input.request)
  return {
    id: createRuntimeId('ctx_transition'),
    sourceContextId: input.source.record.id,
    targetContextId: input.target.record.id,
    exitEdgeId: input.edge?.id ?? input.request.exitEdgeId ?? 'missing',
    actorEntityId: input.request.actorEntityId,
    movedEntityIds,
    globalTotalDays: input.globalTotalDays,
    sourceLocalDays: input.source.record.localClock.totalLocalDays,
    targetLocalDays: input.target.record.localClock.totalLocalDays,
    status: input.status,
    reason: input.reason,
  }
}

export class ContextTransitionSystem extends BaseSubsystem {
  readonly id = 'context-transition' as const
  readonly mod = 'mod-world' as const
  readonly label = '上下文切换' as const
  readonly description = '校验并原子迁移世界、星球、区域或场景上下文' as const

  async transition(
    request: ContextTransitionRequest,
    globalTotalDays: number,
    runtimeAdapter: RuntimeContextAdapter,
  ): Promise<ContextTransitionResult> {
    const before = useWorldStore.getState()
    const source = before.currentContextId ? before.contexts[before.currentContextId] : undefined
    const target = before.contexts[request.targetContextId]
    if (!source || !target) {
      const fallback = source ?? target
      if (!fallback) throw new Error('切换失败：当前与目标上下文均不存在')
      const record = transitionRecord({
        source: source ?? fallback,
        target: target ?? fallback,
        request,
        globalTotalDays,
        status: 'rejected',
        reason: !source ? '当前上下文不存在' : '目标上下文不存在',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const activeContextIds = Object.values(before.contexts)
      .filter((instance) => instance.scope.scope === 'active')
      .map((instance) => instance.record.id)
    if (activeContextIds.length !== 1 || activeContextIds[0] !== source.record.id || source.record.lifecycle !== 'open') {
      const record = transitionRecord({
        source,
        target,
        request,
        globalTotalDays,
        status: 'rejected',
        reason: '当前上下文注册表不满足唯一 active 不变量',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    if (source.record.id === target.record.id) {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '目标已经是当前上下文',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const latestKnownGlobalDay = Math.max(
      source.record.localClock.lastGlobalTotalDays,
      target.record.localClock.lastGlobalTotalDays,
    )
    if (
      !Number.isFinite(latestKnownGlobalDay)
      || !Number.isFinite(globalTotalDays)
      || globalTotalDays < latestKnownGlobalDay
    ) {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '切换时间无效或早于上下文已知的规范全局时间',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    if (
      !source.spatialGraph.nodes[source.record.rootSpatialNodeId]
      || !target.spatialGraph.nodes[target.record.rootSpatialNodeId]
    ) {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '来源或目标上下文缺少有效根空间节点',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const trustedActorEntityId = typeof runtimeAdapter?.actorEntityId === 'string'
      ? runtimeAdapter.actorEntityId.trim()
      : ''
    const requestedActorEntityId = typeof request.actorEntityId === 'string'
      ? request.actorEntityId.trim()
      : ''
    if (!trustedActorEntityId || !requestedActorEntityId) {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '缺少迁移角色全局实体 ID',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    if (request.actorEntityId !== trustedActorEntityId) {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '迁移角色与当前真实角色不一致',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const requestedEntityIds = [
      request.actorEntityId,
      ...(request.carriedEntityIds ?? []),
      ...(request.companionEntityIds ?? []),
    ]
    if (requestedEntityIds.some((entityId) => typeof entityId !== 'string' || entityId.trim().length === 0)) {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '迁移实体 ID 无效',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    if (request.leaveScope !== undefined && request.leaveScope !== 'background' && request.leaveScope !== 'dormant') {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '来源上下文离开范围无效',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const movedEntityIds = movedEntityIdsOf(request)
    const misplacedEntityIds = movedEntityIds.filter((entityId) => {
      const location = source.spatialGraph.entityLocations[entityId]
      return !location
        || location.contextId !== source.record.id
        || !source.spatialGraph.nodes[location.nodeId]
    })
    if (misplacedEntityIds.length > 0) {
      const record = transitionRecord({
        source,
        target,
        request,
        globalTotalDays,
        status: 'rejected',
        reason: `迁移实体不在来源上下文：${misplacedEntityIds.join('、')}`,
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    if (target.scope.scope === 'closed' || target.record.lifecycle === 'closed') {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '目标上下文已关闭',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }

    const edge = findTransitionEdge(source, target, before.crossContextEdges, request.exitEdgeId)
    if (!edge) {
      const record = transitionRecord({
        source, target, request, globalTotalDays, status: 'rejected', reason: '不存在可用的跨上下文出口',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const satisfied = new Set(request.satisfiedRequirementIds ?? [])
    const missingRequirements = (edge.requirements ?? []).filter((requirement) => !satisfied.has(requirement))
    if (missingRequirements.length > 0) {
      const record = transitionRecord({
        source,
        target,
        edge,
        request,
        globalTotalDays,
        status: 'rejected',
        reason: `未满足出口资格：${missingRequirements.join('、')}`,
      })
      before.recordTransition(record)
      return { ok: false, record }
    }

    const nextSource = syncLocalClock(source, globalTotalDays)
    nextSource.scope = {
      contextId: source.record.id,
      scope: request.leaveScope ?? 'dormant',
      reason: '角色离开上下文',
      changedAtGlobalDay: globalTotalDays,
    }
    nextSource.record.lifecycle = nextSource.scope.scope === 'background' ? 'open' : 'dormant'

    const nextTarget = syncLocalClock(target, globalTotalDays)
    nextTarget.scope = {
      contextId: target.record.id,
      scope: 'active',
      reason: '角色到达上下文',
      changedAtGlobalDay: globalTotalDays,
    }
    nextTarget.record.lifecycle = 'open'
    const nextContexts = placeEntityLocationsUniquely({
      ...before.contexts,
      [source.record.id]: nextSource,
      [target.record.id]: nextTarget,
    }, movedEntityIds.map((entityId) => ({
        entityId,
        contextId: target.record.id,
        nodeId: target.record.rootSpatialNodeId,
        updatedAtGlobalDay: globalTotalDays,
    })))
    const committedSource = nextContexts[source.record.id]
    const committedTarget = nextContexts[target.record.id]

    const committedRecord = transitionRecord({
      source: committedSource,
      target: committedTarget,
      edge,
      request,
      globalTotalDays,
      status: 'committed',
    })
    useWorldStore.setState({
      contexts: nextContexts,
      currentContextId: target.record.id,
      transitionHistory: [...before.transitionHistory, committedRecord],
      ...projectWorldContextInstance(committedTarget),
    })

    try {
      if (!(await runtimeAdapter.apply())) {
        throw new Error('运行上下文注入返回失败')
      }
      eventBus.emit('mod-world:context-left', {
        contextId: source.record.id,
        transitionId: committedRecord.id,
      })
      eventBus.emit('mod-world:context-arrived', {
        contextId: target.record.id,
        transitionId: committedRecord.id,
      })
      return { ok: true, record: committedRecord }
    } catch (error) {
      useWorldStore.setState(before, true)
      let rollbackError: unknown
      try {
        await runtimeAdapter.rollback()
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError
      }
      const failureReason = error instanceof Error ? error.message : String(error)
      const rollbackFailureReason = rollbackError
        ? `；运行状态回滚失败：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        : ''
      const rolledBackRecord = {
        ...committedRecord,
        id: createRuntimeId('ctx_transition'),
        status: 'rolled-back' as const,
        reason: `${failureReason}${rollbackFailureReason}`,
      }
      useWorldStore.getState().recordTransition(rolledBackRecord)
      eventBus.emit('mod-world:context-transition-rolled-back', rolledBackRecord)
      return { ok: false, record: rolledBackRecord }
    }
  }

  collectState(_context: RoundContext): SubSystemState {
    const state = useWorldStore.getState()
    const latestTransition = state.transitionHistory.at(-1) ?? null
    return {
      id: this.id,
      summary: `【${this.label}：当前 ${state.currentContextId ?? '无'}，累计记录 ${state.transitionHistory.length}】`,
      data: structuredClone({
        currentContextId: state.currentContextId,
        transitionCount: state.transitionHistory.length,
        latestTransition,
      }),
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
    throw new Error(`[${this.id}] AI 只能提出切换意图，不能绕过预检直接写入`)
  }

  reset(): void {}
}

let runtimeContextTransitionSystem: ContextTransitionSystem | undefined

export function getContextTransitionSystem(): ContextTransitionSystem {
  runtimeContextTransitionSystem ??= new ContextTransitionSystem()
  return runtimeContextTransitionSystem
}
