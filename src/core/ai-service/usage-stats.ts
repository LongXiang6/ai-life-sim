/**
 * Purpose: Record and expose browser-side AI usage aggregates and narrative token calibration.
 * Owner: core:ai-service
 * Responsibility: Public usage-stat operations only; contracts, pricing, and persistence are delegated.
 */

import type { ReasoningEffort } from '@/foundation'
import type { AICallUsageSnapshot } from '@/core/logger/ai-call-log'

import type {
  AiUsageAggregate,
  AiUsageContext,
  AiUsageStatsSnapshot,
} from './usage-stats/contracts'
import {
  DEEPSEEK_PRICE_SOURCE,
  DEEPSEEK_PRICE_VERSION,
  resolveUsagePrice,
  type ModelPrice,
} from './usage-stats/pricing'
import {
  emptyAggregate,
  emptyStore,
  normalizeCount,
  notifyUsageStatsUpdated,
  readUsageStore,
  writeUsageStore,
} from './usage-stats/store'

export type {
  AiUsageAggregate,
  AiUsageContext,
  AiUsageStatsSnapshot,
  NarrativeTokenCalibrationSample,
} from './usage-stats/contracts'
export { DEEPSEEK_PRICE_SOURCE, DEEPSEEK_PRICE_VERSION } from './usage-stats/pricing'

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

export function recordAiUsage(
  usage: AICallUsageSnapshot | undefined,
  context: AiUsageContext,
): void {
  if (typeof localStorage === 'undefined') return
  try {
    const store = readUsageStore()
    const price = resolveUsagePrice(context)
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
          ...(Number.isFinite(context.targetWordCount)
            ? { targetWordCount: Math.round(context.targetWordCount as number) }
            : {}),
          actualNarrativeChars: Math.round(context.actualNarrativeChars),
          ...(context.finishReason ? { finishReason: context.finishReason } : {}),
          recordedAt: Date.now(),
        },
      ].slice(-200)
    }
    store.updatedAt = Date.now()
    writeUsageStore(store)
    notifyUsageStatsUpdated()
  } catch {
    // Usage telemetry must never block the narrative request.
  }
}

function percentile(values: number[], percentileValue: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * percentileValue))
  return sorted[index]
}

export function getNarrativeTokenCalibration(input: {
  providerId: string
  model: string
  reasoningEffort: ReasoningEffort
  callKind?: string
}): { envelopeTokens?: number; reasoningTokens?: number } {
  const samples = readUsageStore().calibrationSamples.filter((sample) => (
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
    ...readUsageStore(),
    priceVersion: DEEPSEEK_PRICE_VERSION,
    priceSource: DEEPSEEK_PRICE_SOURCE,
  }
}

export function resetAiUsageStats(): void {
  if (typeof localStorage === 'undefined') return
  writeUsageStore(emptyStore())
  notifyUsageStatsUpdated()
}

export function formatNanoYuan(value: number): string {
  const safe = Math.max(0, Math.round(value))
  const whole = Math.floor(safe / 1_000_000_000)
  const fraction = String(safe % 1_000_000_000).padStart(9, '0').replace(/0+$/u, '')
  return `¥${whole}${fraction ? `.${fraction}` : ''}`
}
