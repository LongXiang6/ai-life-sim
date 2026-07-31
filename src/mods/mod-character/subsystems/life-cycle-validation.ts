import type {
  BiologicalClockMode,
  CharacterAttributeModifiers,
} from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import {
  assertWorldEntityReference,
  listWorldContexts,
} from '@/mods/mod-world'

const ATTRIBUTE_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma'] as const
const CLOCK_MODES = new Set<BiologicalClockMode>(['aging', 'ageless', 'cyclic', 'external'])

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknownKeys = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknownKeys.length > 0) throw new Error(`${label}包含未知字段：${unknownKeys.join('、')}`)
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}必须是非空字符串`)
  return value.trim()
}

export function requireInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的整数`)
  }
  return value as number
}

export function requireFinite(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的有限数字`)
  }
  return value
}

export function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`)
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label}不能包含重复项`)
  return normalized
}

export function requireClockMode(value: unknown, label: string): BiologicalClockMode {
  if (!CLOCK_MODES.has(value as BiologicalClockMode)) throw new Error(`${label}无效`)
  return value as BiologicalClockMode
}

export function requireAttributeModifiers(
  value: unknown,
  label: string,
): CharacterAttributeModifiers {
  if (!isRecord(value)) throw new Error(`${label}必须是对象`)
  assertKnownKeys(value, ATTRIBUTE_KEYS, label)
  const result: CharacterAttributeModifiers = {}
  for (const key of ATTRIBUTE_KEYS) {
    if (value[key] === undefined) continue
    result[key] = requireInteger(value[key], `${label}.${key}`, -100000, 100000)
  }
  return result
}

export function assertEntityVisible(entityId: string, contextId: string): void {
  const reference = assertWorldEntityReference(entityId)
  if (!reference.contextIds.includes(contextId)) {
    throw new Error(`实体 ${entityId} 不在上下文 ${contextId} 可见范围`)
  }
}

export function assertKnownContext(contextId: string): void {
  if (!listWorldContexts().some((instance) => instance.record.id === contextId)) {
    throw new Error(`引用未知上下文：${contextId}`)
  }
}

export function validateEvidence(
  value: unknown,
  contextId: string,
  label: string,
): string[] {
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
