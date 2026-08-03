/**
 * Purpose: Define stable AI usage, aggregate, run, calibration, and snapshot contracts.
 * Owner: core:ai-service
 * Responsibility: Usage-stat type contracts only; no pricing or persistence behavior.
 */

import type { ReasoningEffort } from '@/foundation'

import type {
  DEEPSEEK_PRICE_SOURCE,
  DEEPSEEK_PRICE_VERSION,
} from './pricing'

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

export interface AiUsageRun {
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

export interface AiUsageStore {
  version: 2
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
