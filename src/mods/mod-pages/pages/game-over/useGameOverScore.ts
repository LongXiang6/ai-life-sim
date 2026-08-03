/**
 * Purpose: Read completed-life state and derive the authoritative local scoring projection.
 * Owner: mod-pages/game-over
 * Responsibility: Read-only score, achievement, record, and local-review derivation only.
 */

import { useMemo } from 'react'

import { calculateLifeScore, useGlobalStore } from '@/core'
import {
  useCharacterStore,
} from '@/mods/mod-character'
import { useEngineStore } from '@/mods/mod-engine'
import type { RadarDimension } from '@/mods/mod-ui'
import {
  buildFallbackWorldScoringProfile,
  isCompleteWorldScoringProfile,
  useWorldStore,
} from '@/mods/mod-world'
import type { LifeScoringAuditSnapshot } from '@/foundation'

import {
  buildGameOverAchievements,
  getReincarnationStrengthTier,
  selectFeaturedAchievement,
} from './game-over-scoring'
import { buildLocalEndingReview, type EndingReview } from './game-over-review'
import {
  formatMorality,
  missingTransitionAudit,
  selectLifeRecords,
} from './game-over-life-records'

export function useGameOverScore() {
  const characterName = useCharacterStore((state) => state.name)
  const characterAge = useCharacterStore((state) => state.age)
  const physique = useCharacterStore((state) => state.characterBase.current.physique)
  const mind = useCharacterStore((state) => state.characterBase.current.mind)
  const talentAptitude = useCharacterStore((state) => state.characterBase.current.talentAptitude)
  const charisma = useCharacterStore((state) => state.characterBase.current.charisma)
  const morality = useCharacterStore((state) => state.morality)
  const lifespanAdjustments = useCharacterStore((state) => state.lifespan.adjustments)
  const regularPatterns = useCharacterStore((state) => state.destinyPatterns.patterns)
  const isDead = useCharacterStore((state) => !state.health.alive)
  const death = useCharacterStore((state) => state.health.death)
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const currentContextId = useWorldStore((state) => state.currentContextId)
  const worldviewId = useGlobalStore((state) => state.worldviewId)
  const narrativeHistory = useEngineStore((state) => state.narrativeHistory)
  const storyRepetitionStats = useEngineStore((state) => state.storyRepetitionStats)
  const compressedSummaries = useEngineStore((state) => state.compressedSummaries)
  const lifeRunId = useEngineStore((state) => state.lifeRunId)
  const totalRounds = useEngineStore((state) => state.totalRounds)
  const narrativeError = useEngineStore((state) => state.narrativeError)
  const status = useEngineStore((state) => state.status)
  const canViewGameOver = status === 'complete' || isDead
  const attributes = { physique, mind, talentAptitude, charisma }

  const allNarratives = useMemo(
    () => narrativeHistory.map((narrative) => narrative.text),
    [narrativeHistory],
  )
  const achievements = useMemo(
    () => buildGameOverAchievements(narrativeHistory, lifespanAdjustments),
    [lifespanAdjustments, narrativeHistory],
  )
  const worldName = worldConfig?.name ?? '未知世界'
  const scoringProfile = useMemo(() => (
    isCompleteWorldScoringProfile(worldConfig?.scoringProfile)
      ? worldConfig.scoringProfile
      : buildFallbackWorldScoringProfile(
          worldConfig ?? { essenceTag: 'unknown', powerSystemTag: 'unknown' },
          currentContextId ?? `world-${worldCode}`,
        )
  ), [currentContextId, worldCode, worldConfig])
  const scoringNarrativeIds = useMemo(() => narrativeHistory.map((entry, index) => (
    entry.id?.trim() || `missing-narrative-id-${index + 1}`
  )), [narrativeHistory])
  const transitionAudits = useMemo(() => narrativeHistory.map((entry, index) => {
    const narrativeId = scoringNarrativeIds[index]!
    return entry.transitionAudit
      ? { ...entry.transitionAudit, narrativeId }
      : missingTransitionAudit(index + 1, narrativeId)
  }), [narrativeHistory, scoringNarrativeIds])
  const scoringAudit = useMemo<LifeScoringAuditSnapshot>(() => {
    const stateTransitionsTrusted = transitionAudits.length === narrativeHistory.length
      && transitionAudits.every((audit) => audit.trusted && audit.validationClean)
    return {
      schemaVersion: 1,
      lifeRunId,
      committedRounds: totalRounds,
      narrativeIds: scoringNarrativeIds,
      resolvedChoiceCount: achievements.filter((item) => item.kind === 'choice').length,
      lifespanAdjustmentCount: lifespanAdjustments.filter((adjustment) => adjustment.deltaDays > 0).length,
      achievementIds: achievements.map((item) => item.id),
      completed: canViewGameOver,
      terminalCommitted: canViewGameOver
        && transitionAudits.length > 0
        && transitionAudits.at(-1)?.trusted === true,
      stateTransitionsTrusted,
      hasValidationFailure: Boolean(narrativeError)
        || transitionAudits.some((audit) => !audit.validationClean),
      transitionAudits,
    }
  }, [
    achievements,
    canViewGameOver,
    lifeRunId,
    lifespanAdjustments,
    narrativeError,
    narrativeHistory.length,
    scoringNarrativeIds,
    totalRounds,
    transitionAudits,
  ])
  const scoreResult = useMemo(() => calculateLifeScore({
    profile: scoringProfile,
    lifeRunId: scoringAudit.lifeRunId,
    attributeValues: [physique, mind, talentAptitude, charisma],
    rounds: narrativeHistory.length,
    committedRounds: scoringAudit.committedRounds,
    narrativeIds: scoringAudit.narrativeIds,
    resolvedChoiceCount: scoringAudit.resolvedChoiceCount,
    lifespanAdjustmentCount: scoringAudit.lifespanAdjustmentCount,
    achievementIds: scoringAudit.achievementIds,
    completed: scoringAudit.completed,
    terminalCommitted: scoringAudit.terminalCommitted,
    stateTransitionsTrusted: scoringAudit.stateTransitionsTrusted,
    hasValidationFailure: scoringAudit.hasValidationFailure,
    transitionAudits: scoringAudit.transitionAudits,
  }), [charisma, mind, narrativeHistory.length, physique, scoringAudit, scoringProfile, talentAptitude])
  const dimensions = useMemo<RadarDimension[]>(() => scoreResult.dimensions.map((dimension) => ({
    label: dimension.label,
    value: dimension.value,
    comment: dimension.comment,
  })), [scoreResult.dimensions])
  const overallScore = scoreResult.score
  const reincarnationStrength = useMemo(
    () => getReincarnationStrengthTier(overallScore),
    [overallScore],
  )
  const featuredAchievement = useMemo(
    () => selectFeaturedAchievement(achievements),
    [achievements],
  )
  const localEndingReview = useMemo(() => buildLocalEndingReview({
    lifeRunId,
    round: narrativeHistory.length,
    characterName: characterName || '无名之辈',
    worldName,
    finalAge: characterAge,
    died: isDead,
    score: overallScore,
    dimensions: scoreResult.dimensions,
    achievements,
  }), [
    achievements,
    characterAge,
    characterName,
    isDead,
    lifeRunId,
    narrativeHistory.length,
    overallScore,
    scoreResult.dimensions,
    worldName,
  ])
  const committedEpilogueReview = useMemo<EndingReview | null>(() => {
    const epilogueText = death?.epilogueText?.trim()
    if (!isDead || death?.epilogueStatus !== 'ready' || !epilogueText) return null
    return {
      perspective: 'micro',
      review: epilogueText,
      evidenceIds: [death.historicalEventId],
      source: 'ai',
    }
  }, [death, isDead])
  const lifeRecords = useMemo(() => selectLifeRecords(narrativeHistory), [narrativeHistory])
  const firstRecordedAge = useMemo(
    () => narrativeHistory.find((entry) => entry.displayAge !== undefined)?.displayAge,
    [narrativeHistory],
  )
  const ageLabel = firstRecordedAge !== undefined && firstRecordedAge < characterAge
    ? `${firstRecordedAge}—${characterAge} 岁`
    : `${characterAge} 岁`

  return {
    achievements,
    ageLabel,
    allNarratives,
    attributes,
    canViewGameOver,
    characterAge,
    characterName,
    committedEpilogueReview,
    compressedSummaries,
    dimensions,
    featuredAchievement,
    isDead,
    lifeRecords,
    lifeRunId,
    localEndingReview,
    morality,
    moralityLabel: formatMorality(morality.level),
    narrativeHistory,
    overallScore,
    regularPatterns,
    reincarnationStrength,
    roundLabel: String(allNarratives.length).padStart(3, '0'),
    scoreResult,
    scoringAudit,
    scoringProfile,
    sealCharacter: characterName.trim().slice(0, 1) || '终',
    storyRepetitionStats,
    worldviewId,
    worldConfig,
    worldName,
  }
}
