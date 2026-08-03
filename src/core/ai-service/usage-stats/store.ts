/**
 * Purpose: Normalize, read, write, and announce the versioned browser AI usage store.
 * Owner: core:ai-service
 * Responsibility: Local-storage representation only; usage calculations and pricing stay separate.
 */

import type { ReasoningEffort } from '@/foundation'

import type {
  AiUsageAggregate,
  AiUsageRun,
  AiUsageStore,
  NarrativeTokenCalibrationSample,
} from './contracts'

const AI_USAGE_STATS_KEY = 'ai-usage-stats'
const AI_USAGE_STATS_VERSION = 2 as const

export function emptyAggregate(): AiUsageAggregate {
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

export function emptyStore(): AiUsageStore {
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

export function normalizeCount(value: unknown): number {
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
    .filter((item): item is Partial<NarrativeTokenCalibrationSample> => (
      Boolean(item && typeof item === 'object')
    ))
    .map((item) => ({
      providerId: typeof item.providerId === 'string' ? item.providerId : '',
      model: typeof item.model === 'string' ? item.model : '',
      callKind: typeof item.callKind === 'string' ? item.callKind : '',
      reasoningEffort: normalizeReasoningEffort(item.reasoningEffort),
      envelopeTokens: normalizeCount(item.envelopeTokens),
      reasoningTokens: normalizeCount(item.reasoningTokens),
      ...(Number.isFinite(item.targetWordCount)
        ? { targetWordCount: Math.round(Number(item.targetWordCount)) }
        : {}),
      ...(Number.isFinite(item.actualNarrativeChars)
        ? { actualNarrativeChars: Math.round(Number(item.actualNarrativeChars)) }
        : {}),
      ...(typeof item.finishReason === 'string' ? { finishReason: item.finishReason } : {}),
      recordedAt: Number.isFinite(item.recordedAt) ? Number(item.recordedAt) : 0,
    }))
    .filter((item) => item.providerId && item.model && item.callKind)
    .slice(-200)
}

export function readUsageStore(): AiUsageStore {
  if (typeof localStorage === 'undefined') return emptyStore()
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_USAGE_STATS_KEY) ?? 'null') as Partial<AiUsageStore> | null
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
      calibrationSamples: normalizeCalibrationSamples(parsed.calibrationSamples),
    }
  } catch {
    return emptyStore()
  }
}

export function writeUsageStore(store: AiUsageStore): void {
  localStorage.setItem(AI_USAGE_STATS_KEY, JSON.stringify(store))
}

export function notifyUsageStatsUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ai-usage-stats-updated'))
}
