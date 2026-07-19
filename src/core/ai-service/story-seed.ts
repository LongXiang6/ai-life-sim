/**
 * @module story-seed.ts
 * @description 故事种子边界归一化，防止 NaN 经 JSON 序列化后变成 null
 * @mod core
 */

/** 只允许有限数值进入 Provider seed；空值、非数字字符串与 Infinity 一律省略。 */
export function normalizeStorySeed(storySeed: unknown): number | undefined {
  if (typeof storySeed === 'number') {
    return Number.isFinite(storySeed) ? storySeed : undefined
  }
  if (typeof storySeed !== 'string') return undefined

  const normalized = storySeed.trim()
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 旧客户端可能把 NaN 序列化为 null；代理只把该历史空值归一为“未提供”。 */
export function normalizeProxyStorySeedInput(value: unknown): unknown {
  return value === null ? undefined : value
}
