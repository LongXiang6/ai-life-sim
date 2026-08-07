import type {
  ProgressionScope,
} from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { useCharacterStore } from '@/mods/mod-character'
import { listWorldContexts } from '@/mods/mod-world'

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${label}包含未知字段：${unknown.join('、')}`)
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}必须是非空字符串`)
  return value.trim()
}

export function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`)
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label}不能包含重复项`)
  return normalized
}

export function optionalStringList(value: unknown, label: string): string[] {
  return value === undefined ? [] : requireStringList(value, label)
}

export function requireInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的整数`)
  }
  return value as number
}

export function requireTotalDays(value: unknown, label: string): number {
  return requireInteger(value, label, 0, Number.MAX_SAFE_INTEGER)
}

export function validateEvidence(value: unknown, contextId: string, label: string): string[] {
  const eventIds = value === undefined ? [] : requireStringList(value, label)
  for (const eventId of eventIds) {
    const event = getHistoricalEvent(eventId)
    if (!event || (event.status !== 'occurred' && event.status !== 'resolved')) {
      throw new Error(`${label}引用的事件尚未发生或不存在：${eventId}`)
    }
    if (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId)) {
      throw new Error(`${label}引用的事件不属于上下文 ${contextId}：${eventId}`)
    }
  }
  return eventIds
}

export function assertEntityVisible(entityId: string, contextId: string): void {
  if (useCharacterStore.getState().characterId !== entityId) throw new Error(`成长目标不是当前玩家角色：${entityId}`)
  assertContextIds([contextId])
}

export function normalizeProgressionScope(
  kindValue: unknown,
  contextIdsValue: unknown,
  operationContextId: string,
): ProgressionScope {
  if (kindValue !== 'global' && kindValue !== 'context') throw new Error('成长作用域类型无效')
  const contextIds = contextIdsValue === undefined
    ? (kindValue === 'context' ? [operationContextId] : [])
    : requireStringList(contextIdsValue, '成长作用域上下文')
  if (kindValue === 'global' && contextIds.length !== 0) throw new Error('全局成长作用域不能绑定上下文')
  if (kindValue === 'context' && (contextIds.length !== 1 || contextIds[0] !== operationContextId)) {
    throw new Error('当地成长作用域必须只绑定目标上下文')
  }
  assertContextIds(contextIds)
  return { kind: kindValue, contextIds }
}

export function validateStoredProgressionScope(value: unknown, label: string): ProgressionScope {
  if (!isRecord(value)) throw new Error(`${label}必须是对象`)
  assertKnownKeys(value, ['kind', 'contextIds'], label)
  if (value.kind !== 'global' && value.kind !== 'context') throw new Error(`${label}.kind 无效`)
  const contextIds = requireStringList(value.contextIds, `${label}.contextIds`)
  if (value.kind === 'global' && contextIds.length !== 0) throw new Error(`${label}全局作用域不能绑定上下文`)
  if (value.kind === 'context' && contextIds.length !== 1) throw new Error(`${label}当地作用域必须绑定一个上下文`)
  assertContextIds(contextIds)
  return { kind: value.kind, contextIds }
}

function assertContextIds(contextIds: readonly string[]): void {
  const known = new Set(listWorldContexts().map((instance) => instance.record.id))
  for (const contextId of contextIds) {
    if (!known.has(contextId)) throw new Error(`引用未知上下文：${contextId}`)
  }
}
