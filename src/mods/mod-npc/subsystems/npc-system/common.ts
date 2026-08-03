/**
 * Purpose: Provide shared strict value validators and cloning helpers for the NPC subsystem.
 * Owner: mod-npc
 * Responsibility: Validate primitive payload shapes without reading or writing NPC business state.
 */

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${label}包含未知字段：${unknown.join('、')}`)
}

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function requireString(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${label}不能为空`)
  return normalized
}

export function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`)
  const normalized = value.map((item, index) => requireString(item, `${label}[${index}]`))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label}不能包含重复项`)
  return normalized
}

export function stringList(value: unknown): string[] {
  if (value === undefined) return []
  return requireStringList(value, '字符串列表')
}

export function requireFiniteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的有限数`)
  }
  return value
}

export function requireTotalDays(value: unknown, label: string): number {
  const totalDays = requireFiniteNumber(value, label, 0, Number.MAX_SAFE_INTEGER)
  if (!Number.isInteger(totalDays)) throw new Error(`${label}必须是非负整数`)
  return totalDays
}

