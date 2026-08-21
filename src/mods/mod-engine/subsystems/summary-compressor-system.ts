/**
 * Purpose: Own the per-round continuity memory derived from completed stories.
 * Owner: mod-engine / summary-compressor
 * Responsibility: Prepare, commit, and restore one single-round 02 continuity result.
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
  lastCompletedAt: number
}

export interface PreparedNarrativeStoryContinuity {
  readonly currentRound: number
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
    lastCompletedAt?: number
  },
): CompressorStats {
  return {
    compressedRoundCount: stats?.compressedRoundCount ?? summaries.summaries.length,
    lastSourceRound: stats?.lastSourceRound
      ?? summaries.summaries.at(-1)?.sourceRound
      ?? null,
    lastCompletedAt: stats?.lastCompletedAt ?? 0,
  }
}

function buildMemoryEvents(input: {
  sourceRound: number
  currentRound: number
  sourceNarrative: NarrativeChunk
  result: NarrativeAIStoryContinuityData
}): CompressedMemoryEvent[] {
  const timeSpan = input.sourceNarrative.displayTimeLabel?.trim() || `第${input.sourceRound}轮`
  return input.result.本轮记忆.map((event, index) => ({
    id: `round-memory:${input.sourceRound}:event:${index + 1}`,
    timeSpan,
    text: event.事实,
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
    createdRound: input.currentRound,
    content: formatTimelineEvents(memoryEvents),
    memoryEvents,
    rawCompressionResponse: input.rawResponse,
    ...(input.sourceNarrative.contextId ? { contextId: input.sourceNarrative.contextId } : {}),
    ...(typeof input.sourceNarrative.totalDays === 'number'
      ? { totalDays: input.sourceNarrative.totalDays }
      : {}),
  }
}

export class SummaryCompressorSystem extends BaseSubsystem {
  readonly id = 'summary-compressor' as const
  readonly mod = 'mod-engine' as const
  readonly label = '故事连续性' as const
  readonly description = '把当前完成故事保存为带权重的逐轮连续记忆' as const

  private compressedSummaries: CompressedSummaries = { summaries: [] }
  private stats: CompressorStats = {
    compressedRoundCount: 0,
    lastSourceRound: null,
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
      lastCompletedAt?: number
    },
  ): void {
    this.compressedSummaries = normalizeSummaries(summaries)
    this.stats = normalizeStats(this.compressedSummaries, stats)
  }

  prepareRoundContinuity(input: {
    currentRound: number
    sourceRound: number | null
    sourceNarrative?: NarrativeChunk
    result: NarrativeAIStoryContinuityData | null
    rawResponse: string
  }): PreparedNarrativeStoryContinuity {
    if (!Number.isSafeInteger(input.currentRound) || input.currentRound < 1) {
      throw new Error('逐轮故事连续性的当前回合无效')
    }

    const current = this.getSummaries()
    if (
      input.sourceRound === null
      || !Number.isSafeInteger(input.sourceRound)
      || input.sourceRound < 1
      || input.sourceRound > input.currentRound
    ) {
      throw new Error('逐轮故事连续性来源必须是当前回合或此前尚未提取的完成回合')
    }
    if (!input.sourceNarrative) throw new Error(`故事连续性缺少第 ${input.sourceRound} 轮完整故事`)
    if (input.result === null) {
      return {
        currentRound: input.currentRound,
        sourceRound: input.sourceRound,
        didCompress: false,
        nextSummaries: current,
        nextStats: this.getStats(),
      }
    }
    if (current.summaries.some((summary) => summary.sourceRound === input.sourceRound)) {
      throw new Error(`第 ${input.sourceRound} 轮已经存在逐轮连续记忆`)
    }

    const summary = buildSummary({
      sourceRound: input.sourceRound,
      currentRound: input.currentRound,
      sourceNarrative: input.sourceNarrative,
      result: input.result,
      rawResponse: input.rawResponse,
    })
    const nextStats = this.getStats()
    nextStats.compressedRoundCount += 1
    nextStats.lastSourceRound = input.sourceRound
    nextStats.lastCompletedAt = Date.now()
    return {
      currentRound: input.currentRound,
      sourceRound: input.sourceRound,
      didCompress: true,
      nextSummaries: { summaries: [...current.summaries, summary] },
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
      throw new Error('逐轮记忆压缩事务快照无效')
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
    this.stats = { compressedRoundCount: 0, lastSourceRound: null, lastCompletedAt: 0 }
  }
}

export const summaryCompressor = new SummaryCompressorSystem()
