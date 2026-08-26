/**
 * Purpose: Validate and commit context or region transitions without entity-location state.
 * Owner: mod-world / context-transition.
 * Responsibility: Transition preflight, local-clock synchronization, scope changes, and history records.
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
import { basePointsFromCalendarDays, calendarDaysFromBasePoints } from '@/foundation'

import { useWorldStore } from '../store'
import type { WorldContextInstance } from '../types'
import {
  createRuntimeId,
  localCalendarDaysFromBasePoints,
  projectWorldContextInstance,
  syncLocalClock,
} from '../utils/world-context-runtime'

type RuntimeContextAdapter = {
  apply: () => boolean | Promise<boolean>
}

function findTransitionEdge(
  source: WorldContextInstance,
  target: WorldContextInstance,
  edges: Record<string, SpatialEdge>,
  requestedId?: string,
): SpatialEdge | null {
  const candidates = requestedId
    ? [edges[requestedId]].filter((edge): edge is SpatialEdge => Boolean(edge))
    : Object.values(edges)
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

function regionIdOf(instance: WorldContextInstance, requested?: string): string {
  const regionId = requested ?? instance.spatialGraph.currentRegionId
  const node = instance.spatialGraph.nodes[regionId]
  if (!node || node.contextId !== instance.record.id || node.kind !== 'region') {
    throw new Error(`区域不存在：${regionId}`)
  }
  return regionId
}

function buildRecord(input: {
  source: WorldContextInstance
  target: WorldContextInstance
  request: ContextTransitionRequest
  edge?: SpatialEdge | null
  globalTotalBasePoints: number
  status: ContextTransitionRecord['status']
  reason?: string
}): ContextTransitionRecord {
  const globalTotalBasePoints = Number.isFinite(input.globalTotalBasePoints)
    ? Math.max(0, Math.floor(input.globalTotalBasePoints))
    : 0
  const sourceLocalBasePoints = Number.isFinite(input.source.record.localClock.totalBasePoints)
    ? Math.max(0, Math.floor(input.source.record.localClock.totalBasePoints))
    : basePointsFromCalendarDays(input.source.record.localClock.totalLocalDays)
  const targetLocalBasePoints = Number.isFinite(input.target.record.localClock.totalBasePoints)
    ? Math.max(0, Math.floor(input.target.record.localClock.totalBasePoints))
    : basePointsFromCalendarDays(input.target.record.localClock.totalLocalDays)
  return {
    id: createRuntimeId('ctx_transition'),
    sourceContextId: input.source.record.id,
    targetContextId: input.target.record.id,
    sourceRegionId: input.source.spatialGraph.currentRegionId,
    targetRegionId: input.target.spatialGraph.currentRegionId,
    exitEdgeId: input.edge?.id ?? input.request.exitEdgeId ?? 'region-transition',
    globalTotalBasePoints,
    globalTotalDays: calendarDaysFromBasePoints(globalTotalBasePoints),
    sourceLocalBasePoints,
    sourceLocalDays: localCalendarDaysFromBasePoints(sourceLocalBasePoints, input.source.record.localCalendar),
    targetLocalBasePoints,
    targetLocalDays: localCalendarDaysFromBasePoints(targetLocalBasePoints, input.target.record.localCalendar),
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
    globalTotalBasePoints: number,
    runtimeAdapter: RuntimeContextAdapter,
  ): Promise<ContextTransitionResult> {
    const before = useWorldStore.getState()
    const source = before.currentContextId ? before.contexts[before.currentContextId] : undefined
    const target = before.contexts[request.targetContextId]
    if (!source || !target) {
      const fallback = source ?? target
      if (!fallback) throw new Error('切换失败：当前与目标上下文均不存在')
      const record = buildRecord({
        source: source ?? fallback,
        target: target ?? fallback,
        request,
        globalTotalBasePoints,
        status: 'rejected',
        reason: !source ? '当前上下文不存在' : '目标上下文不存在',
      })
      before.recordTransition(record)
      return { ok: false, record }
    }
    if (!Number.isFinite(globalTotalBasePoints) || globalTotalBasePoints < 0) {
      const record = buildRecord({ source, target, request, globalTotalBasePoints, status: 'rejected', reason: '切换时间无效' })
      before.recordTransition(record)
      return { ok: false, record }
    }

    const targetRegionId = regionIdOf(target, request.targetRegionId)
    if (source.record.id === target.record.id) {
      const next = {
        ...syncLocalClock(source, globalTotalBasePoints),
        spatialGraph: { ...source.spatialGraph, currentRegionId: targetRegionId },
      }
      const record = buildRecord({
        source,
        target: next,
        request,
        globalTotalBasePoints,
        status: 'committed',
      })
      useWorldStore.setState({
        contexts: { ...before.contexts, [source.record.id]: next },
        transitionHistory: [...before.transitionHistory, record],
        ...projectWorldContextInstance(next),
      })
      return { ok: true, record }
    }

    const activeContextIds = Object.values(before.contexts)
      .filter((instance) => instance.scope.scope === 'active')
      .map((instance) => instance.record.id)
    if (activeContextIds.length !== 1 || activeContextIds[0] !== source.record.id || source.record.lifecycle !== 'open') {
      const record = buildRecord({ source, target, request, globalTotalBasePoints, status: 'rejected', reason: '当前上下文注册表不满足唯一 active 不变量' })
      before.recordTransition(record)
      return { ok: false, record }
    }
    if (target.scope.scope === 'closed' || target.record.lifecycle === 'closed') {
      const record = buildRecord({ source, target, request, globalTotalBasePoints, status: 'rejected', reason: '目标上下文已关闭' })
      before.recordTransition(record)
      return { ok: false, record }
    }

    const latestKnownGlobalBasePoints = Math.max(
      Number.isFinite(source.record.localClock.lastGlobalTotalBasePoints)
        ? source.record.localClock.lastGlobalTotalBasePoints
        : basePointsFromCalendarDays(source.record.localClock.lastGlobalTotalDays),
      Number.isFinite(target.record.localClock.lastGlobalTotalBasePoints)
        ? target.record.localClock.lastGlobalTotalBasePoints
        : basePointsFromCalendarDays(target.record.localClock.lastGlobalTotalDays),
    )
    if (globalTotalBasePoints < latestKnownGlobalBasePoints) {
      const record = buildRecord({ source, target, request, globalTotalBasePoints, status: 'rejected', reason: '切换时间早于上下文已知时间' })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const edge = findTransitionEdge(source, target, before.crossContextEdges, request.exitEdgeId)
    if (!edge) {
      const record = buildRecord({ source, target, request, globalTotalBasePoints, status: 'rejected', reason: '不存在可用的跨上下文出口' })
      before.recordTransition(record)
      return { ok: false, record }
    }
    const satisfied = new Set(request.satisfiedRequirementIds ?? [])
    const missing = (edge.requirements ?? []).filter((item) => !satisfied.has(item))
    if (missing.length > 0) {
      const record = buildRecord({ source, target, edge, request, globalTotalBasePoints, status: 'rejected', reason: `未满足出口资格：${missing.join('、')}` })
      before.recordTransition(record)
      return { ok: false, record }
    }

    const nextSource = syncLocalClock(source, globalTotalBasePoints)
    nextSource.scope = {
      contextId: source.record.id,
      scope: request.leaveScope ?? 'dormant',
      reason: '角色离开上下文',
      changedAtGlobalBasePoints: Math.floor(globalTotalBasePoints),
      changedAtGlobalDay: calendarDaysFromBasePoints(globalTotalBasePoints),
    }
    nextSource.record.lifecycle = nextSource.scope.scope === 'background' ? 'open' : 'dormant'
    const nextTarget = syncLocalClock(target, globalTotalBasePoints)
    nextTarget.scope = {
      contextId: target.record.id,
      scope: 'active',
      reason: '角色到达上下文',
      changedAtGlobalBasePoints: Math.floor(globalTotalBasePoints),
      changedAtGlobalDay: calendarDaysFromBasePoints(globalTotalBasePoints),
    }
    nextTarget.record.lifecycle = 'open'
    nextTarget.spatialGraph.currentRegionId = targetRegionId

    const committedRecord = buildRecord({
      source: nextSource,
      target: nextTarget,
      edge,
      request,
      globalTotalBasePoints,
      status: 'committed',
    })
    useWorldStore.setState({
      contexts: { ...before.contexts, [source.record.id]: nextSource, [target.record.id]: nextTarget },
      currentContextId: target.record.id,
      transitionHistory: [...before.transitionHistory, committedRecord],
      ...projectWorldContextInstance(nextTarget),
    })

    try {
      if (!(await runtimeAdapter.apply())) throw new Error('运行上下文注入返回失败')
      eventBus.emit('mod-world:context-left', { contextId: source.record.id, transitionId: committedRecord.id })
      eventBus.emit('mod-world:context-arrived', { contextId: target.record.id, transitionId: committedRecord.id })
      return { ok: true, record: committedRecord }
    } catch (error) {
      const failedRecord: ContextTransitionRecord = {
        ...committedRecord,
        id: createRuntimeId('ctx_transition'),
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      }
      useWorldStore.getState().recordTransition(failedRecord)
      return { ok: false, record: failedRecord }
    }
  }

  collectState(_context: RoundContext): SubSystemState {
    const state = useWorldStore.getState()
    const latestTransition = state.transitionHistory.at(-1) ?? null
    return {
      id: this.id,
      summary: `【${this.label}：当前 ${state.currentContextId ?? '无'}，累计记录 ${state.transitionHistory.length}】`,
      data: structuredClone({ currentContextId: state.currentContextId, transitionCount: state.transitionHistory.length, latestTransition }),
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
    throw new Error(`[${this.id}] AI 只能提出切换意图，不能绕过预检直接写入`)
  }

  reset(): void {}
}

let runtimeContextTransitionSystem: ContextTransitionSystem | undefined

export function getContextTransitionSystem(): ContextTransitionSystem {
  runtimeContextTransitionSystem ??= new ContextTransitionSystem()
  return runtimeContextTransitionSystem
}
