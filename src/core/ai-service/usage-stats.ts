import type { ReasoningEffort } from '@/foundation'
import type { AICallUsageSnapshot } from '@/core/logger/ai-call-log'

const AI_USAGE_STATS_KEY = 'ai-usage-stats'
const AI_USAGE_STATS_VERSION = 2

export const DEEPSEEK_PRICE_VERSION = 'deepseek-cny-2026-07-26'
export const DEEPSEEK_PRICE_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing'

interface ModelPrice {
  hitNanoYuanPerToken: number
  missNanoYuanPerToken: number
  outputNanoYuanPerToken: number
}

const DEEPSEEK_PRICES: Record<string, ModelPrice> = {
  'deepseek-v4-flash': {
    hitNanoYuanPerToken: 20,
    missNanoYuanPerToken: 1_000,
    outputNanoYuanPerToken: 2_000,
  },
  'deepseek-v4-pro': {
    hitNanoYuanPerToken: 25,
    missNanoYuanPerToken: 3_000,
    outputNanoYuanPerToken: 6_000,
  },
}

export interface AiUsageContext {
  providerId: string
  model: string
  pool: string
  callKind: string
  reasoningEffort: ReasoningEffort
  lifeRunId?: string
  round?: number
  executionKind?: string
  targetWordCount?: number
  actualNarrativeChars?: number
  finishReason?: string
  durationMs?: number
}

export interface AiUsageAggregate {
  knownCalls: number
  unknownUsageCalls: number
  unpricedCalls: number
  hitTokens: number
  missTokens: number
  completionTokens: number
  reasoningTokens: number
  totalTokens: number
  costNanoYuan: number
  latencySamples: number
  latencyMsTotal: number
  latencyMaxMs: number
}

interface AiUsageRun {
  total: AiUsageAggregate
  byPool: Record<string, AiUsageAggregate>
  latestRound: number | null
  latestRoundUsage: AiUsageAggregate
}

export interface NarrativeTokenCalibrationSample {
  providerId: string
  model: string
  callKind: string
  reasoningEffort: ReasoningEffort
  envelopeTokens: number
  reasoningTokens: number
  targetWordCount?: number
  actualNarrativeChars?: number
  finishReason?: string
  recordedAt: number
}

interface AiUsageStore {
  version: typeof AI_USAGE_STATS_VERSION
  total: AiUsageAggregate
  byPool: Record<string, AiUsageAggregate>
  runs: Record<string, AiUsageRun>
  latestLifeRunId: string | null
  updatedAt: number | null
  calibrationSamples: NarrativeTokenCalibrationSample[]
}

export interface AiUsageStatsSnapshot extends AiUsageStore {
  priceVersion: typeof DEEPSEEK_PRICE_VERSION
  priceSource: typeof DEEPSEEK_PRICE_SOURCE
}

function emptyAggregate(): AiUsageAggregate {
  return {
    knownCalls: 0,
    unknownUsageCalls: 0,
    unpricedCalls: 0,
    hitTokens: 0,
    missTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costNanoYuan: 0,
    latencySamples: 0,
    latencyMsTotal: 0,
    latencyMaxMs: 0,
  }
}

function emptyStore(): AiUsageStore {
  return {
    version: AI_USAGE_STATS_VERSION,
    total: emptyAggregate(),
    byPool: {},
    runs: {},
    latestLifeRunId: null,
    updatedAt: null,
    calibrationSamples: [],
  }
}

function normalizeCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function normalizeAggregate(value: unknown): AiUsageAggregate {
  const candidate = value && typeof value === 'object' ? value as Partial<AiUsageAggregate> : {}
  return {
    knownCalls: normalizeCount(candidate.knownCalls),
    unknownUsageCalls: normalizeCount(candidate.unknownUsageCalls),
    unpricedCalls: normalizeCount(candidate.unpricedCalls),
    hitTokens: normalizeCount(candidate.hitTokens),
    missTokens: normalizeCount(candidate.missTokens),
    completionTokens: normalizeCount(candidate.completionTokens),
    reasoningTokens: normalizeCount(candidate.reasoningTokens),
    totalTokens: normalizeCount(candidate.totalTokens),
    costNanoYuan: normalizeCount(candidate.costNanoYuan),
    latencySamples: normalizeCount(candidate.latencySamples),
    latencyMsTotal: normalizeCount(candidate.latencyMsTotal),
    latencyMaxMs: normalizeCount(candidate.latencyMaxMs),
  }
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  if (value === 'auto' || value === 'high' || value === 'max' || value === 'disabled') return value
  return 'disabled'
}

function normalizeCalibrationSamples(value: unknown): NarrativeTokenCalibrationSample[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Partial<NarrativeTokenCalibrationSample> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      providerId: typeof item.providerId === 'string' ? item.providerId : '',
      model: typeof item.model === 'string' ? item.model : '',
      callKind: typeof item.callKind === 'string' ? item.callKind : '',
      reasoningEffort: normalizeReasoningEffort(item.reasoningEffort),
      envelopeTokens: normalizeCount(item.envelopeTokens),
      reasoningTokens: normalizeCount(item.reasoningTokens),
      ...(Number.isFinite(item.targetWordCount) ? { targetWordCount: Math.round(Number(item.targetWordCount)) } : {}),
      ...(Number.isFinite(item.actualNarrativeChars) ? { actualNarrativeChars: Math.round(Number(item.actualNarrativeChars)) } : {}),
      ...(typeof item.finishReason === 'string' ? { finishReason: item.finishReason } : {}),
      recordedAt: Number.isFinite(item.recordedAt) ? Number(item.recordedAt) : 0,
    }))
    .filter((item) => item.providerId && item.model && item.callKind)
    .slice(-200)
}

function readStore(): AiUsageStore {
  if (typeof localStorage === 'undefined') return emptyStore()
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_USAGE_STATS_KEY) ?? 'null') as Partial<AiUsageStore> | null
    // 旧版按宽泛调用池累计，无法无损拆分到当前的精细分类，直接从新版统计重新累计。
    if (!parsed || parsed.version !== AI_USAGE_STATS_VERSION) return emptyStore()
    const byPool = Object.fromEntries(
      Object.entries(parsed.byPool ?? {}).map(([key, value]) => [key, normalizeAggregate(value)]),
    )
    const runs = Object.fromEntries(
      Object.entries(parsed.runs ?? {}).map(([key, value]) => {
        const run = value as Partial<AiUsageRun>
        return [key, {
          total: normalizeAggregate(run.total),
          byPool: Object.fromEntries(
            Object.entries(run.byPool ?? {}).map(([pool, aggregate]) => [pool, normalizeAggregate(aggregate)]),
          ),
          latestRound: Number.isInteger(run.latestRound) ? Number(run.latestRound) : null,
          latestRoundUsage: normalizeAggregate(run.latestRoundUsage),
        } satisfies AiUsageRun]
      }),
    )
    return {
      version: AI_USAGE_STATS_VERSION,
      total: normalizeAggregate(parsed.total),
      byPool,
      runs,
      latestLifeRunId: typeof parsed.latestLifeRunId === 'string' ? parsed.latestLifeRunId : null,
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : null,
      calibrationSamples: normalizeCalibrationSamples((parsed as Partial<AiUsageStore>).calibrationSamples),
    }
  } catch {
    return emptyStore()
  }
}

function applyUsage(
  aggregate: AiUsageAggregate,
  usage: AICallUsageSnapshot | undefined,
  price: ModelPrice | undefined,
  durationMs?: number,
): void {
  if (Number.isFinite(durationMs) && durationMs !== undefined && durationMs >= 0) {
    const normalizedDuration = Math.round(durationMs)
    aggregate.latencySamples += 1
    aggregate.latencyMsTotal += normalizedDuration
    aggregate.latencyMaxMs = Math.max(aggregate.latencyMaxMs, normalizedDuration)
  }
  if (!usage) {
    aggregate.unknownUsageCalls += 1
    return
  }
  const hitTokens = normalizeCount(usage.hitTokens)
  const missTokens = normalizeCount(usage.missTokens)
  const completionTokens = normalizeCount(usage.completionTokens)
  aggregate.knownCalls += 1
  aggregate.hitTokens += hitTokens
  aggregate.missTokens += missTokens
  aggregate.completionTokens += completionTokens
  aggregate.reasoningTokens += normalizeCount(usage.reasoningTokens)
  aggregate.totalTokens += normalizeCount(usage.totalTokens)
  if (!price) {
    aggregate.unpricedCalls += 1
    return
  }
  aggregate.costNanoYuan += hitTokens * price.hitNanoYuanPerToken
    + missTokens * price.missNanoYuanPerToken
    + completionTokens * price.outputNanoYuanPerToken
}

function resolvePrice(context: AiUsageContext): ModelPrice | undefined {
  const model = context.model.trim().toLowerCase()
  if (context.providerId !== 'deepseek' && context.providerId !== 'custom') return undefined
  return DEEPSEEK_PRICES[model]
}

function notifyUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ai-usage-stats-updated'))
}

/** 记录上游实际返回的 usage；金额使用整数纳元累计，思考 Token 不重复计费。 */
export function recordAiUsage(
  usage: AICallUsageSnapshot | undefined,
  context: AiUsageContext,
): void {
  if (typeof localStorage === 'undefined') return
  try {
    const store = readStore()
    const price = resolvePrice(context)
    applyUsage(store.total, usage, price, context.durationMs)

    const poolKey = context.pool
    const pool = store.byPool[poolKey] ?? emptyAggregate()
    applyUsage(pool, usage, price, context.durationMs)
    store.byPool[poolKey] = pool

    if (context.lifeRunId) {
      const run = store.runs[context.lifeRunId] ?? {
        total: emptyAggregate(),
        byPool: {},
        latestRound: null,
        latestRoundUsage: emptyAggregate(),
      }
      applyUsage(run.total, usage, price, context.durationMs)
      const runPool = run.byPool[poolKey] ?? emptyAggregate()
      applyUsage(runPool, usage, price, context.durationMs)
      run.byPool[poolKey] = runPool
      if (context.executionKind !== 'preview' && Number.isInteger(context.round)) {
        if (run.latestRound !== context.round) {
          run.latestRound = context.round ?? null
          run.latestRoundUsage = emptyAggregate()
        }
        applyUsage(run.latestRoundUsage, usage, price, context.durationMs)
      }
      store.runs[context.lifeRunId] = run
      store.latestLifeRunId = context.lifeRunId
    }

    // 只为真实主叙事保留数值校准样本，不保存正文或 Prompt。
    if (
      usage
      && context.callKind === 'narrative-main'
      && context.executionKind !== 'preview'
      && Number.isFinite(context.actualNarrativeChars)
      && context.actualNarrativeChars !== undefined
    ) {
      const storyTokens = Math.ceil(Math.max(0, context.actualNarrativeChars) * 0.6)
      const envelopeTokens = Math.max(
        0,
        normalizeCount(usage.completionTokens) - normalizeCount(usage.reasoningTokens) - storyTokens,
      )
      store.calibrationSamples = [
        ...store.calibrationSamples,
        {
          providerId: context.providerId,
          model: context.model,
          callKind: context.callKind,
          reasoningEffort: context.reasoningEffort,
          envelopeTokens,
          reasoningTokens: normalizeCount(usage.reasoningTokens),
          ...(Number.isFinite(context.targetWordCount) ? { targetWordCount: Math.round(context.targetWordCount as number) } : {}),
          actualNarrativeChars: Math.round(context.actualNarrativeChars),
          ...(context.finishReason ? { finishReason: context.finishReason } : {}),
          recordedAt: Date.now(),
        },
      ].slice(-200)
    }

    store.updatedAt = Date.now()
    localStorage.setItem(AI_USAGE_STATS_KEY, JSON.stringify(store))
    notifyUpdated()
  } catch {
    // 用量统计失败不能阻塞叙事请求；上游原始 usage 仍保留在服务端归档。
  }
}

function percentile(values: number[], percentileValue: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * percentileValue))
  return sorted[index]
}

/** 返回同 Provider、模型、调用类型和思考模式的 P95 校准；样本不足时使用启动值。 */
export function getNarrativeTokenCalibration(input: {
  providerId: string
  model: string
  reasoningEffort: ReasoningEffort
  callKind?: string
}): { envelopeTokens?: number; reasoningTokens?: number } {
  const samples = readStore().calibrationSamples.filter((sample) => (
    sample.providerId === input.providerId
    && sample.model === input.model
    && sample.reasoningEffort === input.reasoningEffort
    && sample.callKind === (input.callKind ?? 'narrative-main')
    && sample.finishReason !== 'length'
  ))
  if (samples.length < 8) return {}
  return {
    envelopeTokens: percentile(samples.map((sample) => sample.envelopeTokens), 0.95),
    reasoningTokens: percentile(samples.map((sample) => sample.reasoningTokens), 0.95),
  }
}

export function getAiUsageStats(): AiUsageStatsSnapshot {
  return {
    ...readStore(),
    priceVersion: DEEPSEEK_PRICE_VERSION,
    priceSource: DEEPSEEK_PRICE_SOURCE,
  }
}

export function resetAiUsageStats(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(AI_USAGE_STATS_KEY, JSON.stringify(emptyStore()))
  notifyUpdated()
}

export function formatNanoYuan(value: number): string {
  const safe = Math.max(0, Math.round(value))
  const whole = Math.floor(safe / 1_000_000_000)
  const fraction = String(safe % 1_000_000_000).padStart(9, '0').replace(/0+$/u, '')
  return `¥${whole}${fraction ? `.${fraction}` : ''}`
}
