/**
 * Purpose: Define stable narrative-memory synchronization and search result contracts.
 * Owner: core:storage
 * Responsibility: Narrative-memory types only; no persistence or weight calculations.
 */

import type { CompressedSummaryItem } from '@/foundation'

export interface NarrativeMemorySummaryInput extends Pick<
  CompressedSummaryItem,
  | 'level'
  | 'startRound'
  | 'endRound'
  | 'content'
  | 'archiveContent'
  | 'memoryEvents'
  | 'rawCompressionResponse'
  | 'sourceSummaryIds'
  | 'contextIds'
  | 'startTotalDays'
  | 'endTotalDays'
> {
  createdRound?: number
}

export interface NarrativeMemorySearchResult {
  eventId: string
  summaryId: string | null
  level: number | null
  timeSpan: string
  text: string
  occurrenceTime: string
  initialWeight: number
  currentWeight: number
  active: boolean
  permanent: boolean
  sourceRounds: number[]
  forgottenRound: number | null
}
