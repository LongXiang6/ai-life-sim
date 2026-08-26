/**
 * Purpose: Define the story-continuity ledger preparation consumed by the round transaction.
 * Owner: mod-engine
 * Responsibility: Internal 02 result contracts only; persistence stays with existing owners.
 */

import type { HistoricalEventPreparedAppend, RoundContext } from '@/foundation'

export interface StoryContinuitySourceTime {
  label: string
  totalBasePoints: number | null
  totalDays: number | null
}

export interface PreparedNarrativeStoryContinuityLedger {
  narrativeId: string
  roundContext: RoundContext
  basePrepared: HistoricalEventPreparedAppend
}
