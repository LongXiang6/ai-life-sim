import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { assertWorldSpatialNode, contextHasCapability, listWorldContexts } from '@/mods/mod-world'
import type { RoundContext } from '@/foundation'

export const clone = <T>(value: T): T => structuredClone(value)

export function worldConfig(contextId: string) {
  return listWorldContexts().find((item) => item.record.id === contextId)?.worldConfig
}

export function hasSupernatural(contextId: string): boolean {
  return contextHasCapability(contextId, 'supernatural')
}

export function assertContext(changes: { targetContextId?: string }, context: RoundContext, label: string): void {
  if (changes.targetContextId && changes.targetContextId !== context.contextId) throw new Error(`${label}指令上下文不匹配`)
}

export function assertEvidence(ids: readonly string[], contextId: string, label: string): void {
  if (ids.length === 0) throw new Error(`${label}变更必须引用已确认历史事件`)
  for (const id of ids) {
    const event = getHistoricalEvent(id)
    if (!event || event.status === 'void' || (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId))) {
      throw new Error(`${label}事件证据无效：${id}`)
    }
  }
}

export function assertNode(contextId: string, nodeId: string): void {
  assertWorldSpatialNode(contextId, nodeId)
}

export function stableIndex(...parts: Array<string | number>): number {
  let hash = 2166136261
  for (const part of parts.join('|')) {
    hash ^= part.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function adjacentNodes(contextId: string, nodeId: string): string[] {
  const instance = listWorldContexts().find((item) => item.record.id === contextId)
  if (!instance) return []
  return Object.values(instance.spatialGraph.edges)
    .filter((edge) => edge.enabled && (edge.fromNodeId === nodeId || (edge.bidirectional && edge.toNodeId === nodeId)))
    .map((edge) => edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId)
    .filter((id) => id !== nodeId)
}
