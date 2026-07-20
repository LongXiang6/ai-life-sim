/**
 * @module utils.ts
 * @description 历史事件账本无语义工具；仅负责 ID、复制与基础形状判断
 * @mod mod-history-dynamics
 */

let fallbackIdSequence = 0

export function createLedgerId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}:${uuid}`
  fallbackIdSequence += 1
  return `${prefix}:${Date.now()}:${fallbackIdSequence}`
}

export function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function nonEmptyText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}
