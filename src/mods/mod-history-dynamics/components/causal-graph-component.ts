/**
 * @module causal-graph-component.ts
 * @description P1 内部因果图组件；无 ISubSystem、无独立队列、无正文语义猜测
 * @mod mod-history-dynamics
 */

import type {
  HistoricalCausalEdge,
  HistoricalCausalEdgeInput,
  HistoricalEventRecord,
  HistoricalEventSource,
  HistoricalEventValidationContext,
} from '@/foundation'

import { cloneValue, createLedgerId } from '../utils'

export interface CausalGraphValidationResult {
  ok: boolean
  errors: string[]
}

/** 只校验和构造事件间的显式边；所有状态仍由历史事件账本拥有。 */
export class CausalGraphComponent {
  validateEdge(
    input: HistoricalCausalEdgeInput,
    events: ReadonlyMap<string, HistoricalEventRecord>,
  ): CausalGraphValidationResult {
    const errors: string[] = []
    const from = events.get(input.fromEventId)
    const to = events.get(input.toEventId)
    if (!from) errors.push(`因果起点事件不存在: ${input.fromEventId}`)
    if (!to) errors.push(`因果终点事件不存在: ${input.toEventId}`)
    if (input.fromEventId === input.toEventId) errors.push('因果边不能自我指向')

    if (from && to) {
      const endpointContexts = new Set([
        ...from.scope.contextIds,
        ...to.scope.contextIds,
      ])
      if (endpointContexts.size > 1 && input.scope.kind !== 'cross-context') {
        errors.push('跨上下文因果边必须使用 cross-context 作用域')
      }
      for (const contextId of endpointContexts) {
        if (input.scope.kind !== 'global' && !input.scope.contextIds.includes(contextId)) {
          errors.push(`因果边作用域未覆盖端点上下文: ${contextId}`)
        }
      }
    }
    return { ok: errors.length === 0, errors }
  }

  createEdge(
    input: HistoricalCausalEdgeInput,
    source: HistoricalEventSource,
    context: HistoricalEventValidationContext,
  ): HistoricalCausalEdge {
    return {
      edgeId: input.edgeId?.trim() || createLedgerId('causal-edge'),
      fromEventId: input.fromEventId,
      toEventId: input.toEventId,
      relation: input.relation,
      label: input.label?.trim() || undefined,
      scope: cloneValue(input.scope),
      evidenceIds: cloneValue(input.evidenceIds ?? []),
      source: cloneValue(source),
      createdRoundSequence: context.roundSequence,
      createdTotalDays: context.totalDays,
    }
  }
}
