/**
 * Purpose: Own five-round continuity memory batches derived from completed stories.
 * Owner: mod-engine / summary-compressor
 * Responsibility: Prepare, commit, and restore one five-round 02 continuity result.
 */

import { BaseSubsystem } from '@/core'
import type {
  CompressedMemoryEvent,
  CompressedSummaries,
  CompressedSummaryItem,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'

import type { NarrativeAIStoryContinuityData } from '../helpers/narrative-ai-protocol'
import { formatTimelineEvents } from '../helpers/timeline-memory'
import type { NarrativeChunk } from '../types'

export interface CompressorStats {
  compressedRoundCount: number
  lastSourceRound: number | null
  lastAttemptRound: number | null
  lastCompletedAt: number
}

export interface PreparedNarrativeStoryContinuity {
  readonly currentRound: number
  readonly sourceRounds: number[]
  readonly sourceRound: number | null
  readonly didCompress: boolean
  readonly nextSummaries: CompressedSummaries
  readonly nextStats: CompressorStats
}

export interface NarrativeStoryContinuityTransactionSnapshot {
  readonly summaries: CompressedSummaries
  readonly stats: CompressorStats
}

function normalizeSummaries(input: CompressedSummaries | undefined): CompressedSummaries {
  return {
    summaries: (input?.summaries ?? []).map((summary) => structuredClone(summary)),
  }
}

function normalizeStats(
  summaries: CompressedSummaries,
  stats?: {
    compressedRoundCount?: number
    lastSourceRound?: number | null
    lastAttemptRound?: number | null
    lastCompletedAt?: number
  },
): CompressorStats {
  return {
    compressedRoundCount: stats?.compressedRoundCount ?? summaries.summaries.length,
    lastSourceRound: stats?.lastSourceRound
      ?? summaries.summaries.at(-1)?.sourceRound
      ?? null,
    lastAttemptRound: stats?.lastAttemptRound ?? null,
    lastCompletedAt: stats?.lastCompletedAt ?? 0,
  }
}

function buildMemoryEvents(input: {
  sourceRound: number
  sourceNarrative: NarrativeChunk
  result: NarrativeAIStoryContinuityData
}): CompressedMemoryEvent[] {
  const timeSpan = input.sourceNarrative.displayTimeLabel?.trim() || `第${input.sourceRound}轮`
  return input.result.本轮剧情
    .filter((event) => event.来源回合 === undefined || event.来源回合 === input.sourceRound)
    .map((event, index) => ({
      id: `round-memory:${input.sourceRound}:event:${index + 1}`,
      timeSpan,
      text: event.剧情,
      occurrenceTime: event.时间,
      weight: event.权重,
    }))
}

function buildSummary(input: {
  sourceRound: number
  currentRound: number
  sourceNarrative: NarrativeChunk
  result: NarrativeAIStoryContinuityData
  rawResponse: string
}): CompressedSummaryItem {
  const memoryEvents = buildMemoryEvents(input)
  return {
    sourceRound: input.sourceRound,
    sourceRounds: [input.sourceRound],
    createdRound: input.currentRound,
    content: formatTimelineEvents(memoryEvents),
    memoryEvents,
    rawCompressionResponse: input.rawResponse,
    ...(input.sourceNarrative.contextId ? { contextId: input.sourceNarrative.contextId } : {}),
    ...(typeof input.sourceNarrative.totalBasePoints === 'number'
      ? { totalBasePoints: input.sourceNarrative.totalBasePoints }
      : {}),
    ...(typeof input.sourceNarrative.totalDays === 'number'
      ? { totalDays: input.sourceNarrative.totalDays }
      : {}),
  }
}

export class SummaryCompressorSystem extends BaseSubsystem {
  readonly id = 'summary-compressor' as const
  readonly mod = 'mod-engine' as const
  readonly label = '故事连续性' as const
  readonly description = '把连续五轮完成故事保存为带权重的长期连续记忆' as const

  private compressedSummaries: CompressedSummaries = { summaries: [] }
  private stats: CompressorStats = {
    compressedRoundCount: 0,
    lastSourceRound: null,
    lastAttemptRound: null,
    lastCompletedAt: 0,
  }

  getSummaries(): CompressedSummaries {
    return structuredClone(this.compressedSummaries)
  }

  getStats(): CompressorStats {
    return { ...this.stats }
  }

  restoreFromEngineState(
    summaries: CompressedSummaries | undefined,
    stats?: {
      compressedRoundCount?: number
      lastSourceRound?: number | null
      lastAttemptRound?: number | null
      lastCompletedAt?: number
    },
  ): void {
    this.compressedSummaries = normalizeSummaries(summaries)
    this.stats = normalizeStats(this.compressedSummaries, stats)
  }

  prepareRoundContinuity(input: {
    currentRound: number
    sourceRounds: readonly number[]
    sourceNarratives?: readonly NarrativeChunk[]
    result: NarrativeAIStoryContinuityData | null
    rawResponse: string
  }): PreparedNarrativeStoryContinuity {
    if (!Number.isSafeInteger(input.currentRound) || input.currentRound < 1) {
      throw new Error('故事连续性批量压缩的当前回合无效')
    }

    const current = this.getSummaries()
    const sourceRounds = [...input.sourceRounds]
    if (sourceRounds.length === 0) {
      return {
        currentRound: input.currentRound,
        sourceRounds: [],
        sourceRound: null,
        didCompress: false,
        nextSummaries: current,
        nextStats: this.getStats(),
      }
    }
    if (
      sourceRounds.length !== 5
      || sourceRounds.some((round) => !Number.isSafeInteger(round) || round < 1 || round > input.currentRound)
      || sourceRounds.some((round, index) => index > 0 && round !== sourceRounds[index - 1] + 1)
    ) {
      throw new Error('故事连续性来源必须是连续的五轮完成正文')
    }
    if (!input.sourceNarratives || input.sourceNarratives.length !== sourceRounds.length) {
      throw new Error('故事连续性批量压缩缺少五轮完整故事')
    }
    if (sourceRounds.some((round) => current.summaries.some((summary) => (
      summary.sourceRounds?.includes(round) ?? summary.sourceRound === round
    )))) {
      throw new Error('故事连续性批次包含已经提交的来源回合')
    }
    const nextStats = this.getStats()
    nextStats.lastAttemptRound = input.currentRound
    if (input.result === null) {
      return {
        currentRound: input.currentRound,
        sourceRounds,
        sourceRound: sourceRounds[0] ?? null,
        didCompress: false,
        nextSummaries: current,
        nextStats,
      }
    }
    const summaries = sourceRounds.map((sourceRound, index) => buildSummary({
      sourceRound,
      currentRound: input.currentRound,
      sourceNarrative: input.sourceNarratives![index],
      result: {
        本轮剧情: input.result!.本轮剧情.filter((event) => (
          event.来源回合 === undefined
            ? sourceRounds.length === 1
            : event.来源回合 === sourceRound
        )),
        未来事件: input.result!.未来事件,
      },
      rawResponse: input.rawResponse,
    }))
    nextStats.compressedRoundCount += sourceRounds.length
    nextStats.lastSourceRound = sourceRounds.at(-1) ?? null
    nextStats.lastCompletedAt = Date.now()
    return {
      currentRound: input.currentRound,
      sourceRounds,
      sourceRound: sourceRounds[0] ?? null,
      didCompress: true,
      nextSummaries: { summaries: [...current.summaries, ...summaries] },
      nextStats,
    }
  }

  captureTransactionState(): NarrativeStoryContinuityTransactionSnapshot {
    return {
      summaries: this.getSummaries(),
      stats: this.getStats(),
    }
  }

  restoreTransactionState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('五轮记忆压缩事务快照无效')
    }
    const value = snapshot as Partial<NarrativeStoryContinuityTransactionSnapshot>
    this.compressedSummaries = normalizeSummaries(value.summaries)
    this.stats = normalizeStats(this.compressedSummaries, value.stats)
  }

  async commitPreparedRoundContinuity(
    prepared: PreparedNarrativeStoryContinuity,
    _lifeRunId: string,
  ): Promise<void> {
    this.compressedSummaries = normalizeSummaries(prepared.nextSummaries)
    this.stats = { ...prepared.nextStats }
  }

  async restoreCommittedTransactionState(
    snapshot: NarrativeStoryContinuityTransactionSnapshot,
    _lifeRunId: string,
    _previousCommittedRound: number,
  ): Promise<void> {
    this.restoreTransactionState(snapshot)
  }

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: `【${this.label}】已提取回合:${this.stats.compressedRoundCount}`,
      data: structuredClone({ stats: this.stats, summaries: this.compressedSummaries }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    throw new Error('故事连续性只接受 02 调用形成的准备结果')
  }

  reset(): void {
    this.compressedSummaries = { summaries: [] }
    this.stats = { compressedRoundCount: 0, lastSourceRound: null, lastAttemptRound: null, lastCompletedAt: 0 }
  }
}

export const summaryCompressor = new SummaryCompressorSystem()
