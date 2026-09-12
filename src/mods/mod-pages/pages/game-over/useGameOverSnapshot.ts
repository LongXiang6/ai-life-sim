/**
 * Purpose: Freeze the completed-life facts consumed by the ordered settlement flow.
 * Owner: mod-pages/game-over
 * Responsibility: Read-only world, character, narrative, evidence, and audit projection only.
 */

import { useMemo } from 'react'

import { useGlobalStore } from '@/core'
import type {
  LifeScoringAuditSnapshot,
  LifeScoringEvidence,
} from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { useEngineStore } from '@/mods/mod-engine'
import { useWorldStore } from '@/mods/mod-world'

import {
  buildGameOverAchievements,
  selectFeaturedAchievement,
} from './game-over-scoring'
import { missingTransitionAudit } from './game-over-projections'
import type { GameOverSettlementSnapshot } from './game-over-settlement'

export function useGameOverSnapshot() {
  const characterName = useCharacterStore((state) => state.name)
  const characterAge = useCharacterStore((state) => state.age)
  const characterGender = useCharacterStore((state) => state.gender)
  const characterRace = useCharacterStore((state) => state.race)
  const characterBackground = useCharacterStore((state) => state.background)
  const mind = useCharacterStore((state) => state.characterBase.current.mind)
  const physique = useCharacterStore((state) => state.characterBase.current.physique)
  const charisma = useCharacterStore((state) => state.characterBase.current.charisma)
  const familyBackground = useCharacterStore((state) => state.characterBase.current.familyBackground)
  const characterStatus = useCharacterStore((state) => state.characterBase.status)
  const regularPatterns = useCharacterStore((state) => state.destinyPatterns.patterns)
  const isDead = characterStatus?.health.alive === false
  const worldConfig = useWorldStore((state) => state.worldConfig)
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
  const attributes = useMemo(
    () => ({ mind, physique, charisma, familyBackground }),
    [charisma, familyBackground, mind, physique],
  )

  const allNarratives = useMemo(
    () => narrativeHistory.map((narrative) => narrative.text),
    [narrativeHistory],
  )
  const achievements = useMemo(
    () => buildGameOverAchievements(narrativeHistory),
    [narrativeHistory],
  )
  const worldName = worldConfig?.name ?? '未知世界'
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
      resolvedChoiceCount: achievements.length,
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
    narrativeError,
    narrativeHistory.length,
    scoringNarrativeIds,
    totalRounds,
    transitionAudits,
  ])
  const evidence = useMemo<LifeScoringEvidence[]>(() => [
    {
      id: 'world:setting',
      kind: 'world-fact',
      content: JSON.stringify({
        contextId: currentContextId,
        worldviewId,
        config: worldConfig,
      }),
    },
    {
      id: 'character:identity',
      kind: 'character-state',
      content: JSON.stringify({
        name: characterName || '无名之辈',
        gender: characterGender,
        race: characterRace,
        background: characterBackground,
      }),
    },
    {
      id: 'character:attributes',
      kind: 'character-state',
      content: JSON.stringify(attributes),
    },
    {
      id: 'character:destiny-patterns',
      kind: 'character-state',
      content: JSON.stringify(regularPatterns.map((pattern) => ({
        name: pattern.name,
        description: pattern.description,
        effect: pattern.effect,
      }))),
    },
    {
      id: 'outcome:final',
      kind: 'character-state',
      content: JSON.stringify({
        finalAge: characterAge,
        rounds: narrativeHistory.length,
        died: isDead,
      }),
    },
    ...narrativeHistory.map((entry, index) => ({
      id: `narrative:${scoringNarrativeIds[index]}`,
      kind: 'narrative' as const,
      timeLabel: entry.displayTimeLabel
        ?? (entry.displayAge === undefined ? `第 ${index + 1} 轮` : `${entry.displayAge} 岁`),
      content: entry.text,
    })),
    ...compressedSummaries.summaries.map((summary) => ({
      id: `life-digest:round-${summary.sourceRound}`,
      kind: 'life-digest' as const,
      timeLabel: `第 ${summary.sourceRound} 轮`,
      content: summary.content,
    })),
    ...achievements.map((achievement) => ({
      id: `achievement:${achievement.id}`,
      kind: 'achievement' as const,
      timeLabel: achievement.timeLabel,
      content: `${achievement.title}：${achievement.detail}`,
    })),
  ], [
    achievements,
    attributes,
    characterAge,
    characterBackground,
    characterGender,
    characterName,
    characterRace,
    compressedSummaries.summaries,
    currentContextId,
    isDead,
    narrativeHistory,
    regularPatterns,
    scoringNarrativeIds,
    worldviewId,
    worldConfig,
  ])
  const requestKey = `${lifeRunId}:${narrativeHistory.length}:${scoringNarrativeIds.at(-1) ?? 'empty'}`
  const settlementSnapshot = useMemo<GameOverSettlementSnapshot>(() => ({
    requestKey,
    lifeRunId,
    round: narrativeHistory.length,
    characterName: characterName || '无名之辈',
    worldName,
    finalAge: characterAge,
    died: isDead,
    evidence,
    audit: scoringAudit,
  }), [
    characterAge,
    characterName,
    evidence,
    isDead,
    lifeRunId,
    narrativeHistory.length,
    requestKey,
    scoringAudit,
    worldName,
  ])
  const featuredAchievement = useMemo(
    () => selectFeaturedAchievement(achievements),
    [achievements],
  )
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
    compressedSummaries,
    featuredAchievement,
    isDead,
    lifeRunId,
    narrativeHistory,
    regularPatterns,
    requestKey,
    roundLabel: String(allNarratives.length).padStart(3, '0'),
    scoringAudit,
    settlementSnapshot,
    storyRepetitionStats,
    worldviewId,
    worldConfig,
    worldName,
  }
}
