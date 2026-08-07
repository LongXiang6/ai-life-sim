/**
 * Purpose: Define accepted narrative and event-recognition records consumed by the commit runtime.
 * Owner: mod-engine
 * Responsibility: Internal event-recognition contracts only; validation and state commits stay elsewhere.
 */

import type {
  HistoricalEventCandidateInput,
  RoundContext,
} from '@/foundation'
import type { ParsedNarrative } from '../../orchestrator-shared'
import type { NarrativeRoundMetadata } from '../../helpers/narrative-semantic-signals'

export interface AcceptedNarrativeRecord {
  schemaVersion: 1
  lifeRunId: string
  roundSequence: number
  narrativeId: string
  acceptedAt: number
  roundContext: RoundContext
  narrative: ParsedNarrative
  deliveredCausalEventIds: string[]
  deliveredHistoricalEventCandidateIds: string[]
  playerChoice?: string
}

export interface NarrativeEventRecognitionResult {
  metadata: NarrativeRoundMetadata
  candidates: HistoricalEventCandidateInput[]
}
