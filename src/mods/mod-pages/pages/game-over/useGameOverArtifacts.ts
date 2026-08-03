/**
 * Purpose: Build mythic, share-card, and persisted life-record projections from the final score.
 * Owner: mod-pages/game-over
 * Responsibility: Read-only post-score artifact assembly and active mythic selection only.
 */

import { useMemo, useState } from 'react'

import {
  useCharacterStore,
  useMythicLibraryStore,
} from '@/mods/mod-character'
import { ENGINE_VERSION } from '@/core/version'

import { buildGameOverShareFacts } from './game-over-share-card'
import type { EndingReview } from './game-over-review'
import type { useGameOverScore } from './useGameOverScore'

type GameOverScore = ReturnType<typeof useGameOverScore>

export function useGameOverArtifacts(score: GameOverScore, effectiveEndingReview: EndingReview) {
  const mythicCandidates = useCharacterStore((state) => state.mythicCandidates)
  const sealedMythicPatternId = useCharacterStore((state) => state.sealedMythicPatternId)
  const mythicLibrary = useMythicLibraryStore((state) => state.patterns)
  const [activeMythicIndex, setActiveMythicIndex] = useState(0)
  const {
    achievements,
    ageLabel,
    allNarratives,
    attributes,
    characterAge,
    characterName,
    compressedSummaries,
    dimensions,
    featuredAchievement,
    isDead,
    lifeRunId,
    morality,
    moralityLabel,
    narrativeHistory,
    overallScore,
    regularPatterns,
    scoreResult,
    scoringAudit,
    scoringProfile,
    worldName,
  } = score

  const sealedMythicPattern = mythicLibrary.find((pattern) => pattern.id === sealedMythicPatternId) ?? null
  const sealedCandidateIndex = sealedMythicPattern
    ? mythicCandidates.findIndex((candidate) => (
        candidate.name === sealedMythicPattern.name
        && candidate.concept === sealedMythicPattern.concept
        && candidate.effect === sealedMythicPattern.effect
      ))
    : -1
  const effectiveMythicIndex = sealedCandidateIndex >= 0 ? sealedCandidateIndex : activeMythicIndex
  const activeMythicCandidate = sealedMythicPattern
    ?? mythicCandidates[effectiveMythicIndex]
    ?? mythicCandidates[0]
  const sealedOutsideCurrentCandidates = Boolean(sealedMythicPattern && sealedCandidateIndex < 0)

  const shareCardData = useMemo(() => ({
    lifeRunId,
    characterName: characterName || '无名之辈',
    worldName,
    ageLabel,
    rounds: allNarratives.length,
    moralityLabel,
    overallScore,
    attributes,
    achievementCount: achievements.length,
    featuredAchievement: featuredAchievement
      ? { title: featuredAchievement.title, detail: featuredAchievement.detail }
      : null,
    dimensions,
    mythic: activeMythicCandidate
      ? {
          name: activeMythicCandidate.name,
          concept: activeMythicCandidate.concept,
          effect: activeMythicCandidate.effect,
        }
      : null,
  }), [
    achievements.length,
    activeMythicCandidate,
    ageLabel,
    allNarratives.length,
    attributes,
    characterName,
    dimensions,
    featuredAchievement,
    lifeRunId,
    moralityLabel,
    overallScore,
    worldName,
  ])
  const shareFacts = useMemo(() => buildGameOverShareFacts(shareCardData), [shareCardData])
  const cloudLifeRecord = useMemo(() => ({
    recordId: lifeRunId,
    completedAt: narrativeHistory[narrativeHistory.length - 1]?.timestamp ?? 0,
    characterName: characterName || '无名之辈',
    worldName,
    finalAge: characterAge,
    rounds: narrativeHistory.length,
    died: isDead,
    moralityLabel,
    overallScore,
    achievements: achievements.map(({ id, kind, title, detail, timeLabel }) => ({
      id,
      kind,
      title,
      detail,
      timeLabel,
    })),
    dimensions: scoreResult.dimensions.map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      description: dimension.description,
      weight: dimension.weight,
      value: dimension.value,
      comment: dimension.comment,
    })),
    scoring: {
      version: scoreResult.version,
      profile: scoringProfile,
      rawScore: scoreResult.rawScore,
      validCompletedLife: scoreResult.validCompletedLife,
      evidence: scoreResult.evidence,
      integrity: scoreResult.integrity,
      audit: scoringAudit,
    },
    endingReview: effectiveEndingReview,
    destinyNames: regularPatterns.map((pattern) => pattern.name),
    ...(sealedMythicPattern ? { mythicName: sealedMythicPattern.name } : {}),
    gameVersion: ENGINE_VERSION,
  }), [
    achievements,
    characterAge,
    characterName,
    effectiveEndingReview,
    isDead,
    lifeRunId,
    moralityLabel,
    narrativeHistory,
    overallScore,
    regularPatterns,
    scoreResult,
    scoringAudit,
    scoringProfile,
    sealedMythicPattern,
    worldName,
  ])
  const mythicLifeDigests = useMemo(() => (
    compressedSummaries.summaries
      .slice()
      .sort((left, right) => left.startRound - right.startRound)
      .map((item) => ({ startRound: item.startRound, endRound: item.endRound, summary: item.content }))
  ), [compressedSummaries.summaries])
  const mythicLifeRecords = useMemo(() => narrativeHistory.map((entry, index) => (
    `${entry.displayTimeLabel ?? `第${index + 1}轮`}：${entry.text}`
  )), [narrativeHistory])
  const mythicFinalState = useMemo(() => ({
    outcome: {
      finalAge: characterAge,
      rounds: narrativeHistory.length,
      died: isDead,
    },
    attributes,
    morality: {
      value: morality.value,
      level: morality.level,
      label: moralityLabel,
    },
    endingScore: scoreResult,
    achievements,
    regularPatterns: regularPatterns.map((pattern) => ({ name: pattern.name, effect: pattern.effect })),
  }), [
    achievements,
    attributes,
    characterAge,
    isDead,
    morality.level,
    morality.value,
    moralityLabel,
    narrativeHistory.length,
    regularPatterns,
    scoreResult,
  ])

  return {
    activeMythicCandidate,
    activeMythicIndex,
    cloudLifeRecord,
    effectiveMythicIndex,
    mythicCandidates,
    mythicFinalState,
    mythicLibrary,
    mythicLifeDigests,
    mythicLifeRecords,
    sealedMythicPattern,
    sealedMythicPatternId,
    sealedOutsideCurrentCandidates,
    setActiveMythicIndex,
    shareCardData,
    shareFacts,
  }
}
