export interface NormalizedAiUsage {
  hitTokens: number
  missTokens: number
  completionTokens: number
  totalTokens: number
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : undefined
}

function asNonNegativeNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function maxKnown(values: unknown[]): number | undefined {
  const numbers = values
    .map(asNonNegativeNumber)
    .filter((value): value is number => value !== undefined)
  return numbers.length > 0 ? Math.max(...numbers) : undefined
}

/**
 * 将 DeepSeek 与 LongCat 的 OpenAI 兼容 usage 字段归一为项目缓存统计格式。
 * LongCat 的实际命中量以 prompt_tokens_details.cached_tokens / effectiveCachedTokens 为准，
 * 顶层 cached_tokens 与 cache_read_tokens 可能保持为 0，不能优先覆盖有效值。
 */
export function normalizeAiUsage(usage: unknown): NormalizedAiUsage | undefined {
  const record = asRecord(usage)
  if (!record) return undefined

  const promptDetails = asRecord(record.prompt_tokens_details)
  const promptTokens = maxKnown([record.prompt_tokens, record.input_tokens]) ?? 0
  const hitTokens = maxKnown([
    record.prompt_cache_hit_tokens,
    promptDetails?.cached_tokens,
    record.effectiveCachedTokens,
    record.cached_tokens,
    record.cache_read_tokens,
  ]) ?? 0
  const explicitMissTokens = asNonNegativeNumber(record.prompt_cache_miss_tokens)
  const missTokens = explicitMissTokens ?? Math.max(promptTokens - hitTokens, 0)
  const completionTokens = maxKnown([record.completion_tokens, record.output_tokens]) ?? 0
  const totalTokens = maxKnown([record.total_tokens]) ?? promptTokens + completionTokens

  return { hitTokens, missTokens, completionTokens, totalTokens }
}
