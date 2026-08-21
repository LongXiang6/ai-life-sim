/**
 * Purpose: Define the AI five-dimension life-settlement contracts.
 * Owner: foundation:types
 * Responsibility: Shared scoring evidence, result, and audit types only.
 */

export type LifeScoringEvidenceKind =
  | 'world-fact'
  | 'character-state'
  | 'narrative'
  | 'life-digest'
  | 'achievement'

export interface LifeScoringEvidence {
  id: string
  kind: LifeScoringEvidenceKind
  content: string
  timeLabel?: string
}

export interface LifeScoringDimension {
  id: string
  label: string
  description: string
  value: number
  comment: string
  evidenceIds: string[]
}

export interface LifeScoringIntegrityResult {
  passed: boolean
  checks: Record<string, boolean>
  reasons: string[]
}

export interface LifeScoringResult {
  version: 2
  source: 'ai'
  score: number
  dimensions: LifeScoringDimension[]
  evidenceIds: string[]
  integrity: LifeScoringIntegrityResult
}

/** Single-round state-transition evidence; excludes story text and Prompt content. */
export interface NarrativeTransitionAuditSnapshot {
  schemaVersion: 1
  round: number
  narrativeId: string
  validatedWritePath: boolean
  interceptorPassed: boolean
  intentValidationPassed: boolean
  historicalCommitPassed: boolean
  structuredDataPresent: boolean
  structuredDataAccepted: boolean
  requestedChangeCount: number
  committedChangeCount: number
  rejectedChangeCount: number
  trusted: boolean
  validationClean: boolean
  reasons: string[]
}

/** Settlement-time completeness audit; AI does not decide these facts. */
export interface LifeScoringAuditSnapshot {
  schemaVersion: 1
  lifeRunId: string
  committedRounds: number
  narrativeIds: string[]
  resolvedChoiceCount: number
  achievementIds: string[]
  completed: boolean
  terminalCommitted: boolean
  stateTransitionsTrusted: boolean
  hasValidationFailure: boolean
  transitionAudits: NarrativeTransitionAuditSnapshot[]
}

export interface StoredLifeScoringResult extends LifeScoringResult {
  audit: LifeScoringAuditSnapshot
}
