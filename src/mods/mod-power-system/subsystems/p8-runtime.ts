import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { listWorldContexts } from '@/mods/mod-world'
import type { RoundContext } from '@/foundation'

export const clone = <T>(value: T): T => structuredClone(value)

export function worldConfig(contextId: string) {
  return listWorldContexts().find((item) => item.record.id === contextId)?.worldConfig
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
