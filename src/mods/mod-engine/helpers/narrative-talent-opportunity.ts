/**
 * Purpose: Select automatic destiny-pattern growth opportunities with deterministic randomness.
 * Owner: mod-engine
 * Responsibility: Local eligibility checks and seeded opportunity rolls only; no AI calls.
 *
 * @module narrative-talent-opportunity.ts
 * @description 天赋自动进阶的本地机缘判定；同一存档重载得到同一结果。
 * @mod mod-engine
 */

import type {
  DestinyPattern,
  DestinyPatternGrowthAssessment,
  DestinyPatternGrowthOpportunityKind,
} from '@/mods/mod-character'

import type { NarrativeTalentGrowthEvidenceWindow } from './narrative-talent-growth-context'

/** Initial tuning values; these are balance knobs, not narrative rules. */
export const TALENT_OPPORTUNITY_TUNING = {
  baseChance: 0.02,
  perEvidenceChance: 0.025,
  maxEvidenceChance: 0.12,
  adultBonus: 0.01,
  oldPenalty: 0.01,
  stageBonus: 0.01,
  luckScale: 0.0003,
  maxLuckBonus: 0.03,
  aptitudePenaltyPerTier: 0.003,
  minChance: 0.01,
  maxChance: 0.25,
} as const

export interface TalentOpportunityCandidate {
  pattern: DestinyPattern
  evidenceWindows: readonly NarrativeTalentGrowthEvidenceWindow[]
}

export interface TalentOpportunitySelection {
  pattern: DestinyPattern
  evidenceWindows: NarrativeTalentGrowthEvidenceWindow[]
  kind: DestinyPatternGrowthOpportunityKind
  chance: number
  roll: number
}

export interface TalentOpportunityCheckResult {
  selection?: TalentOpportunitySelection
  checkedAssessments: DestinyPatternGrowthAssessment[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Stable FNV-1a unit interval value; never uses Math.random so reload cannot reroll. */
export function deterministicUnit(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000
}

function opportunityChance(input: {
  pattern: DestinyPattern
  evidenceCount: number
  currentAge: number
  currentStageId?: string
  fortuneValue: number
}): number {
  const tuning = TALENT_OPPORTUNITY_TUNING
  const evidenceChance = Math.min(
    tuning.maxEvidenceChance,
    input.evidenceCount * tuning.perEvidenceChance,
  )
  const ageBonus = input.currentAge >= 60
    ? -tuning.oldPenalty
    : input.currentAge >= 18
      ? tuning.adultBonus
      : 0
  const stageBonus = input.currentStageId === 'life-stage-3' ? tuning.stageBonus : 0
  const luckBonus = clamp(
    input.fortuneValue * tuning.luckScale,
    -tuning.maxLuckBonus,
    tuning.maxLuckBonus,
  )
  const aptitudePenalty = Math.max(0, input.pattern.aptitudeTier - 1) * tuning.aptitudePenaltyPerTier
  return clamp(
    tuning.baseChance
      + evidenceChance
      + ageBonus
      + stageBonus
      + luckBonus
      - aptitudePenalty,
    tuning.minChance,
    tuning.maxChance,
  )
}

function opportunityKind(seed: string): DestinyPatternGrowthOpportunityKind {
  const roll = deterministicUnit(`${seed}:kind`)
  if (roll < 0.15) return 'mutation'
  if (roll < 0.4) return 'legacy'
  if (roll < 0.7) return 'crisis'
  return 'insight'
}

function latestEvidenceRound(windows: readonly NarrativeTalentGrowthEvidenceWindow[]): number | undefined {
  return windows.reduce<number | undefined>(
    (latest, window) => Math.max(latest ?? 0, window.round),
    undefined,
  )
}

/**
 * Check every candidate with new evidence. A miss records the checked evidence watermark so
 * the same evidence is not rolled again; a hit records it only after the caller accepts it.
 */
export function checkTalentGrowthOpportunity(input: {
  candidates: readonly TalentOpportunityCandidate[]
  assessments?: readonly DestinyPatternGrowthAssessment[]
  currentRound: number
  currentAge: number
  currentStageId?: string
  fortuneValue?: number
  lifeRunId?: string
}): TalentOpportunityCheckResult {
  const assessmentByLineage = new Map(
    (input.assessments ?? []).map((assessment) => [assessment.lineageId, assessment]),
  )
  const checkedAssessments: DestinyPatternGrowthAssessment[] = []
  const hits: TalentOpportunitySelection[] = []

  for (const candidate of input.candidates) {
    const latestRound = latestEvidenceRound(candidate.evidenceWindows)
    if (latestRound === undefined) continue
    const previous = assessmentByLineage.get(candidate.pattern.lineageId)
    if (previous && latestRound <= previous.evaluatedThroughRound) continue

    const chance = opportunityChance({
      pattern: candidate.pattern,
      evidenceCount: candidate.evidenceWindows.length,
      currentAge: input.currentAge,
      currentStageId: input.currentStageId,
      fortuneValue: input.fortuneValue ?? 0,
    })
    const seed = [
      input.lifeRunId ?? 'life',
      input.currentRound,
      candidate.pattern.lineageId,
      latestRound,
      candidate.evidenceWindows.length,
    ].join(':')
    const roll = deterministicUnit(seed)
    checkedAssessments.push({
      lineageId: candidate.pattern.lineageId,
      evaluatedThroughRound: latestRound,
    })
    if (roll < chance) {
      hits.push({
        pattern: candidate.pattern,
        evidenceWindows: [...candidate.evidenceWindows],
        kind: opportunityKind(seed),
        chance,
        roll,
      })
    }
  }

  hits.sort((left, right) => (
    right.chance - left.chance
    || left.pattern.lineageId.localeCompare(right.pattern.lineageId)
  ))
  return {
    ...(hits[0] ? { selection: hits[0] } : {}),
    checkedAssessments,
  }
}
