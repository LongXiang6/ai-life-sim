/**
 * Purpose: Validate and verify the authoritative AI five-dimension life score.
 * Owner: core:scoring
 * Responsibility: Structure, evidence references, arithmetic mean, and completeness audit only.
 */

import { z } from 'zod'

import type {
  LifeScoringAuditSnapshot,
  LifeScoringDimension,
  LifeScoringIntegrityResult,
  LifeScoringResult,
  StoredLifeScoringResult,
} from '@/foundation'

export const LIFE_SCORING_VERSION = 2 as const

export const LifeScoringDimensionResponseSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(500),
  value: z.number().int().min(0).max(100),
  comment: z.string().trim().min(1).max(500),
  evidenceIds: z.array(z.string().trim().min(1).max(200)).min(1),
}).strict()

export const LifeScoringAIResponseSchema = z.object({
  dimensions: z.array(LifeScoringDimensionResponseSchema).length(5),
}).strict()

export type LifeScoringAIResponse = z.infer<typeof LifeScoringAIResponseSchema>

function uniqueNonEmpty(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.trim())
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length
}

function buildAuditChecks(audit: LifeScoringAuditSnapshot): Record<string, boolean> {
  const narrativeIdsUnique = uniqueNonEmpty(audit.narrativeIds)
  const achievementIdsUnique = uniqueNonEmpty(audit.achievementIds)
  const transitionAuditComplete = audit.transitionAudits.length === audit.narrativeIds.length
    && audit.transitionAudits.every((item, index) => (
      item.schemaVersion === 1
      && item.round === index + 1
      && item.narrativeId === audit.narrativeIds[index]
      && item.trusted
      && item.validationClean
    ))
  return {
    auditSchemaSupported: audit.schemaVersion === 1,
    lifeRunIdentified: audit.lifeRunId.trim().length > 0,
    completed: audit.completed,
    terminalCommitted: audit.terminalCommitted,
    roundContinuity: Number.isInteger(audit.committedRounds)
      && audit.committedRounds >= audit.narrativeIds.length
      && audit.narrativeIds.length > 0
      && narrativeIdsUnique,
    achievementIdsUnique,
    stateTransitionsTrusted: audit.stateTransitionsTrusted,
    transitionAuditComplete,
    validationClean: !audit.hasValidationFailure,
  }
}

function buildIntegrity(input: {
  audit: LifeScoringAuditSnapshot
  dimensions: readonly LifeScoringDimension[]
  evidenceIds: readonly string[]
}): LifeScoringIntegrityResult {
  const allowedEvidenceIds = new Set(input.evidenceIds)
  const checks = {
    ...buildAuditChecks(input.audit),
    exactlyFiveDimensions: input.dimensions.length === 5,
    dimensionIdsUnique: uniqueNonEmpty(input.dimensions.map((dimension) => dimension.id)),
    dimensionLabelsUnique: uniqueNonEmpty(input.dimensions.map((dimension) => dimension.label)),
    dimensionValuesValid: input.dimensions.every((dimension) => (
      Number.isInteger(dimension.value) && dimension.value >= 0 && dimension.value <= 100
    )),
    evidenceCatalogUnique: uniqueNonEmpty(input.evidenceIds),
    evidenceReferencesValid: input.dimensions.every((dimension) => (
      uniqueNonEmpty(dimension.evidenceIds)
      && dimension.evidenceIds.every((id) => allowedEvidenceIds.has(id))
    )),
  }
  const reasons = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  return { passed: reasons.length === 0, checks, reasons }
}

function arithmeticMean(dimensions: readonly LifeScoringDimension[]): number {
  if (dimensions.length !== 5) return 0
  return Math.round(dimensions.reduce((sum, dimension) => sum + dimension.value, 0) / 5)
}

export function createLifeScoringResult(input: {
  response: unknown
  allowedEvidenceIds: readonly string[]
  audit: LifeScoringAuditSnapshot
}): LifeScoringResult {
  const parsed = LifeScoringAIResponseSchema.parse(input.response)
  const dimensions = parsed.dimensions.map((dimension) => ({
    ...dimension,
    evidenceIds: [...dimension.evidenceIds],
  }))
  const evidenceIds = [...input.allowedEvidenceIds]
  const integrity = buildIntegrity({ audit: input.audit, dimensions, evidenceIds })
  return {
    version: LIFE_SCORING_VERSION,
    source: 'ai',
    score: arithmeticMean(dimensions),
    dimensions,
    evidenceIds,
    integrity,
  }
}

export function verifyStoredLifeScore(record: {
  overallScore: number
  rounds: number
  dimensions: readonly unknown[]
  scoring?: StoredLifeScoringResult | { version?: number }
}): { valid: boolean; result?: StoredLifeScoringResult; reasons: string[] } {
  const scoring = record.scoring
  if (!scoring || scoring.version !== LIFE_SCORING_VERSION || !('audit' in scoring)) {
    return { valid: false, reasons: ['unsupported-scoring-version'] }
  }
  const parsed = LifeScoringAIResponseSchema.safeParse({ dimensions: scoring.dimensions })
  if (!parsed.success) return { valid: false, reasons: ['invalid-five-dimension-structure'] }

  const recomputedIntegrity = buildIntegrity({
    audit: scoring.audit,
    dimensions: scoring.dimensions,
    evidenceIds: scoring.evidenceIds,
  })
  const reasons = [...recomputedIntegrity.reasons]
  const recomputedScore = arithmeticMean(scoring.dimensions)
  if (scoring.source !== 'ai') reasons.push('invalid-score-source')
  if (record.rounds !== scoring.audit.narrativeIds.length) reasons.push('record-round-mismatch')
  if (scoring.score !== recomputedScore) reasons.push('scoring-mean-mismatch')
  if (record.overallScore !== scoring.score) reasons.push('score-projection-mismatch')
  if (JSON.stringify(record.dimensions) !== JSON.stringify(scoring.dimensions)) {
    reasons.push('dimension-projection-mismatch')
  }
  if (JSON.stringify(scoring.integrity) !== JSON.stringify(recomputedIntegrity)) {
    reasons.push('integrity-projection-mismatch')
  }
  return {
    valid: reasons.length === 0,
    result: scoring,
    reasons: [...new Set(reasons)],
  }
}
