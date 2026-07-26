/**
 * @module narrative-memory-client.ts
 * @description 压缩系统与存档级明文 SQLite API 的公开边界
 * @mod mod-engine
 */

import type { CompressedSummaryItem } from '@/foundation'
import type { NarrativeMemorySearchResult, NarrativeMemorySummaryInput } from '@/core/storage/narrative-memory-store'

interface MemorySyncInput {
  lifeRunId: string
  currentRound: number
  summaries: readonly CompressedSummaryItem[]
}

function toSummaryInput(summary: CompressedSummaryItem): NarrativeMemorySummaryInput {
  return {
    level: summary.level,
    startRound: summary.startRound,
    endRound: summary.endRound,
    createdRound: summary.createdRound,
    content: summary.content,
    archiveContent: summary.archiveContent,
    memoryEvents: summary.memoryEvents,
    rawCompressionResponse: summary.rawCompressionResponse,
    sourceSummaryIds: summary.sourceSummaryIds,
    contextIds: summary.contextIds,
    startTotalDays: summary.startTotalDays,
    endTotalDays: summary.endTotalDays,
  }
}

async function postMemory(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch('/api/narrative-memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || data.ok !== true) {
    throw new Error(typeof data.error === 'string' ? data.error : `memory API ${response.status}`)
  }
  return data
}

export async function syncNarrativeMemory(input: MemorySyncInput): Promise<void> {
  if (typeof window === 'undefined') return
  await postMemory({
    action: 'sync',
    lifeRunId: input.lifeRunId,
    currentRound: input.currentRound,
    summaries: input.summaries.map(toSummaryInput),
  })
}

export async function advanceNarrativeMemory(lifeRunId: string, currentRound: number): Promise<void> {
  if (typeof window === 'undefined') return
  await postMemory({ action: 'advance', lifeRunId, currentRound })
}

export async function searchNarrativeMemory(
  lifeRunId: string,
  currentRound: number,
  terms: readonly string[],
): Promise<NarrativeMemorySearchResult[]> {
  if (typeof window === 'undefined') return []
  const data = await postMemory({
    action: 'search',
    lifeRunId,
    currentRound,
    terms: [...terms],
  })
  return Array.isArray(data.results) ? data.results as NarrativeMemorySearchResult[] : []
}
