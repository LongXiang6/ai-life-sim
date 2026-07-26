import type {
  LifeScoringAuditSnapshot,
  NarrativeTransitionAuditSnapshot,
  ScoringCurveId,
  ScoringEvidenceKind,
  WorldScoringProfile,
} from '@/foundation'

export const LIFE_SCORING_VERSION = 1 as const

export interface LifeScoringInput {
  profile: WorldScoringProfile
  lifeRunId: string
  attributeValues: readonly number[]
  rounds: number
  committedRounds: number
  narrativeIds: readonly string[]
  resolvedChoiceCount: number
  breakthroughCount: number
  achievementIds: readonly string[]
  completed: boolean
  terminalCommitted: boolean
  stateTransitionsTrusted: boolean
  hasValidationFailure?: boolean
  transitionAudits?: readonly NarrativeTransitionAuditSnapshot[]
}

export interface LifeScoringDimensionResult {
  id: string
  label: string
  description: string
  weight: number
  value: number
  comment: string
}

export interface LifeScoringIntegrityResult {
  passed: boolean
  perfectGatePassed: boolean
  checks: Record<string, boolean>
  reasons: string[]
}

export interface LifeScoringResult {
  version: typeof LIFE_SCORING_VERSION
  score: number
  rawScore: number
  validCompletedLife: boolean
  dimensions: LifeScoringDimensionResult[]
  evidence: Record<ScoringEvidenceKind, number>
  integrity: LifeScoringIntegrityResult
}

const CURVE_WEIGHTS: Record<ScoringCurveId, Partial<Record<ScoringEvidenceKind, number>>> = {
  growth: { attributes: 0.75, breakthroughs: 0.25 },
  agency: { choices: 0.65, achievements: 0.35 },
  journey: { journey: 0.8, completion: 0.2 },
  impact: { achievements: 0.5, choices: 0.25, breakthroughs: 0.25 },
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function roundScore(value: number): number {
  return Math.round(clampScore(value))
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.trim())
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length
}

function validProfile(profile: WorldScoringProfile): boolean {
  if (profile.profileVersion !== 1 || !profile.worldId.trim()) return false
  if (profile.dimensions.length < 3 || profile.dimensions.length > 6) return false
  const ids = profile.dimensions.map((dimension) => dimension.id.trim())
  const labels = profile.dimensions.map((dimension) => dimension.label.trim())
  return uniqueNonEmpty(ids)
    && uniqueNonEmpty(labels)
    && profile.dimensions.every((dimension) => (
      Number.isInteger(dimension.weight)
      && dimension.weight > 0
      && dimension.evidenceKinds.length > 0
      && CURVE_WEIGHTS[dimension.curveId] !== undefined
    ))
    && profile.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0) === 100
}

function attributeEvidence(values: readonly number[]): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return 0
  const scores = values.map((value) => 50 + 50 * Math.tanh(value / 10))
  return roundScore(scores.reduce((sum, value) => sum + value, 0) / scores.length)
}

function buildEvidence(input: LifeScoringInput): Record<ScoringEvidenceKind, number> {
  const rounds = Math.max(0, Math.trunc(input.rounds))
  const choices = Math.max(0, Math.trunc(input.resolvedChoiceCount))
  const breakthroughs = Math.max(0, Math.trunc(input.breakthroughCount))
  const achievements = new Set(input.achievementIds.map((id) => id.trim()).filter(Boolean)).size
  return {
    attributes: attributeEvidence(input.attributeValues),
    journey: roundScore((input.completed ? 55 : 0) + rounds * 2.25),
    choices: roundScore(choices * 20),
    breakthroughs: roundScore(breakthroughs * 34),
    achievements: roundScore(achievements * 20),
    completion: input.completed ? 100 : 0,
  }
}

function scoreDimension(
  curveId: ScoringCurveId,
  evidenceKinds: readonly ScoringEvidenceKind[],
  evidence: Record<ScoringEvidenceKind, number>,
): number {
  const curve = CURVE_WEIGHTS[curveId]
  const selected = evidenceKinds
    .map((kind) => ({ kind, weight: curve[kind] ?? 0 }))
    .filter((item) => item.weight > 0)
  const effective = selected.length > 0
    ? selected
    : evidenceKinds.map((kind) => ({ kind, weight: 1 }))
  const totalWeight = effective.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight <= 0) return 0
  return roundScore(effective.reduce((sum, item) => sum + evidence[item.kind] * item.weight, 0) / totalWeight)
}

function dimensionComment(value: number): string {
  if (value >= 95) return '你在这一维度留下了接近满分的结构化证据。'
  if (value >= 85) return '你在这一维度表现突出，关键经历彼此印证。'
  if (value >= 70) return '你完成了这一维度的主要历程，并留下清晰成果。'
  if (value >= 50) return '你在这一维度形成了稳定积累，仍有未走完的空间。'
  return '你在这一维度留下的有效证据较少。'
}

function buildIntegrityChecks(input: LifeScoringInput): Record<string, boolean> {
  const rounds = Math.max(0, Math.trunc(input.rounds))
  const audits = input.transitionAudits
  const transitionAuditComplete = audits === undefined
    ? input.stateTransitionsTrusted
    : audits.length === rounds
      && audits.every((audit, index) => (
        audit.schemaVersion === 1
        && audit.round === index + 1
        && audit.narrativeId === input.narrativeIds[index]
        && audit.trusted
        && audit.validatedWritePath
      ))
  return {
    terminalCommitted: input.completed && input.terminalCommitted,
    scoringProfileComplete: validProfile(input.profile),
    evidenceFinite: input.attributeValues.every(Number.isFinite)
      && [input.rounds, input.committedRounds, input.resolvedChoiceCount, input.breakthroughCount].every(Number.isFinite),
    roundContinuity: Number.isInteger(input.rounds)
      && input.rounds > 0
      && input.committedRounds >= input.rounds
      && input.narrativeIds.length === input.rounds
      && uniqueNonEmpty(input.narrativeIds),
    achievementIdsUnique: uniqueNonEmpty(input.achievementIds),
    stateTransitionsTrusted: input.stateTransitionsTrusted && transitionAuditComplete,
    transitionAuditComplete,
    validationClean: !input.hasValidationFailure,
    lifeRunIdentified: input.lifeRunId.trim().length > 0,
  }
}

export function calculateLifeScore(input: LifeScoringInput): LifeScoringResult {
  const evidence = buildEvidence(input)
  const checks = buildIntegrityChecks(input)
  const integrityPassed = Object.values(checks).every(Boolean)
  const dimensions = input.profile.dimensions.map((dimension): LifeScoringDimensionResult => {
    const value = scoreDimension(dimension.curveId, dimension.evidenceKinds, evidence)
    return {
      id: dimension.id,
      label: dimension.label,
      description: dimension.description,
      weight: dimension.weight,
      value,
      comment: dimensionComment(value),
    }
  })
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
  const rawScore = totalWeight > 0
    ? clampScore(dimensions.reduce((sum, dimension) => sum + dimension.value * dimension.weight, 0) / totalWeight)
    : 0
  const validCompletedLife = input.completed && integrityPassed
  let score = !validCompletedLife
    ? Math.min(69, Math.round(rawScore))
    : rawScore < 90
      ? Math.min(89, Math.round(70 + 20 * Math.sqrt(rawScore / 90)))
      : Math.round(rawScore)

  const profileEvidence = new Set(input.profile.dimensions.flatMap((dimension) => dimension.evidenceKinds))
  const perfectChecks = {
    rawRoundsTo100: Math.round(rawScore) === 100,
    allDimensionsNearPerfect: dimensions.every((dimension) => dimension.value >= 99),
    journeyCovered: evidence.journey === 100,
    keyChoicesCovered: !profileEvidence.has('choices') || evidence.choices === 100,
    achievementsCovered: !profileEvidence.has('achievements') || evidence.achievements === 100,
    breakthroughsCovered: !profileEvidence.has('breakthroughs') || evidence.breakthroughs === 100,
    transitionAuditsClean: input.transitionAudits === undefined
      || (input.transitionAudits.length === input.rounds
        && input.transitionAudits.every((audit) => audit.validationClean)),
  }
  const perfectGatePassed = integrityPassed && Object.values(perfectChecks).every(Boolean)
  if (score === 100 && !perfectGatePassed) score = 99

  const reasons = [
    ...Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name),
    ...(Math.round(rawScore) === 100
      ? Object.entries(perfectChecks).filter(([, passed]) => !passed).map(([name]) => name)
      : []),
  ]
  return {
    version: LIFE_SCORING_VERSION,
    score,
    rawScore: Math.round(rawScore * 10) / 10,
    validCompletedLife,
    dimensions,
    evidence,
    integrity: {
      passed: integrityPassed,
      perfectGatePassed,
      checks: { ...checks, ...perfectChecks },
      reasons,
    },
  }
}

/** 服务端/管理者复算入口：只接受存档中固化的评分输入，不信任客户端汇总数字。 */
export function verifyStoredLifeScore(record: {
  overallScore: number
  rounds: number
  attributes?: { physique: number; mind: number; talentAptitude: number; charisma: number }
  dimensions: readonly { id?: string; value: number }[]
  achievements?: readonly { id: string; kind: 'choice' | 'breakthrough' }[]
  scoring?: {
    version: number
    profile: WorldScoringProfile
    rawScore: number
    validCompletedLife: boolean
    evidence: Record<ScoringEvidenceKind, number>
    integrity: LifeScoringIntegrityResult
    audit?: LifeScoringAuditSnapshot
  }
}): { valid: boolean; result?: LifeScoringResult; reasons: string[] } {
  const audit = record.scoring?.audit
  if (!record.scoring || !audit || !record.attributes) {
    return { valid: false, reasons: ['missing-scoring-audit'] }
  }
  const result = calculateLifeScore({
    profile: record.scoring.profile,
    lifeRunId: audit.lifeRunId,
    attributeValues: [
      record.attributes.physique,
      record.attributes.mind,
      record.attributes.talentAptitude,
      record.attributes.charisma,
    ],
    rounds: record.rounds,
    committedRounds: audit.committedRounds,
    narrativeIds: audit.narrativeIds,
    resolvedChoiceCount: audit.resolvedChoiceCount,
    breakthroughCount: audit.breakthroughCount,
    achievementIds: audit.achievementIds,
    completed: audit.completed,
    terminalCommitted: audit.terminalCommitted,
    stateTransitionsTrusted: audit.stateTransitionsTrusted,
    hasValidationFailure: audit.hasValidationFailure,
    transitionAudits: audit.transitionAudits,
  })
  const reasons: string[] = []
  if (record.overallScore !== result.score) reasons.push('score-mismatch')
  if (record.scoring.version !== result.version) reasons.push('version-mismatch')
  if (record.scoring.validCompletedLife !== result.validCompletedLife) reasons.push('completion-validity-mismatch')
  if (record.scoring.rawScore !== result.rawScore) reasons.push('raw-score-mismatch')
  if (JSON.stringify(record.scoring.evidence) !== JSON.stringify(result.evidence)) reasons.push('evidence-mismatch')
  if (JSON.stringify(record.scoring.integrity) !== JSON.stringify(result.integrity)) reasons.push('integrity-mismatch')
  // Dimension values live on the top-level record; compare them separately while retaining the profile as authority.
  if (record.dimensions.length !== result.dimensions.length) reasons.push('dimension-count-mismatch')
  for (const dimension of result.dimensions) {
    const stored = record.dimensions.find((candidate) => candidate.id === dimension.id)
    if (!stored || stored.value !== dimension.value) reasons.push(`dimension-mismatch:${dimension.id}`)
  }
  return { valid: reasons.length === 0, result, reasons }
}
