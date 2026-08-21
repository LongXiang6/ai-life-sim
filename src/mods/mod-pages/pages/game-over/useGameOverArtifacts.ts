/**
 * Purpose: Build reincarnation-promotion, share-card, and persisted record projections from one AI settlement result.
 * Owner: mod-pages/game-over
 * Responsibility: Read-only artifact assembly and active promotion selection only.
 */

import { useMemo, useState } from 'react'

import { ENGINE_VERSION } from '@/core/version'
import type { LifeScoringResult } from '@/foundation'
import {
  useCharacterStore,
  type AttributeModifiers,
  type DestinyPatternCategory,
  type DestinyPatternRarity,
  type ReincarnationTalent,
} from '@/mods/mod-character'

import { buildGameOverShareFacts } from './game-over-share-card'
import type { EndingReview } from './game-over-review'
import { getReincarnationStrengthTier } from './game-over-scoring'
import type { useGameOverSnapshot } from './useGameOverSnapshot'

type GameOverSnapshot = ReturnType<typeof useGameOverSnapshot>

export interface PromotionCandidate {
  id: string
  kind: 'pattern' | 'talent'
  lineageId: string
  version: number
  name: string
  description: string
  effect: string
  category: DestinyPatternCategory
  rarity: DestinyPatternRarity
  attrBonus: Partial<AttributeModifiers>
  /** 普通命格为 0；已入库轮回天赋为其当前强化等级。 */
  strengthenLevel: number
}

export function useGameOverArtifacts(
  snapshot: GameOverSnapshot,
  scoreResult: LifeScoringResult | null,
  endingReview: EndingReview | null,
  completedAt: number | null,
) {
  const equippedReincarnationTalents = useCharacterStore((state) => state.equippedReincarnationTalents)
  const [activePromotionIndex, setActivePromotionIndex] = useState(0)
  const [promotedTalent, setPromotedTalent] = useState<ReincarnationTalent | null>(null)
  const {
    achievements,
    ageLabel,
    allNarratives,
    attributes,
    characterAge,
    characterName,
    compressedSummaries,
    featuredAchievement,
    isDead,
    lifeRunId,
    narrativeHistory,
    regularPatterns,
    scoringAudit,
    worldName,
  } = snapshot
  const overallScore = scoreResult?.score ?? 0
  const dimensions = useMemo(() => scoreResult?.dimensions.map((dimension) => ({
    label: dimension.label,
    value: dimension.value,
    comment: dimension.comment,
  })) ?? [], [scoreResult])
  const reincarnationStrength = useMemo(
    () => getReincarnationStrengthTier(overallScore),
    [overallScore],
  )

  const promotionCandidates = useMemo<PromotionCandidate[]>(() => {
    const patterns = regularPatterns
      .map((pattern): PromotionCandidate => ({
        id: pattern.id,
        kind: 'pattern',
        lineageId: pattern.lineageId,
        version: pattern.version,
        name: pattern.name,
        description: pattern.description,
        effect: pattern.effect,
        category: pattern.category,
        rarity: pattern.rarity,
        attrBonus: pattern.attrBonus,
        strengthenLevel: 0,
      }))
    const talents = equippedReincarnationTalents
      .map((talent): PromotionCandidate => ({
        id: talent.id,
        kind: 'talent',
        lineageId: talent.lineageId,
        version: talent.version,
        name: talent.name,
        description: talent.description,
        effect: talent.effect,
        category: talent.category,
        rarity: talent.rarity,
        attrBonus: talent.attrBonus,
        strengthenLevel: talent.strengthenLevel,
      }))
    return [...patterns, ...talents]
  }, [equippedReincarnationTalents, regularPatterns])

  const effectivePromotionIndex = promotionCandidates.length > 0
    ? Math.min(activePromotionIndex, promotionCandidates.length - 1)
    : 0
  const activePromotionCandidate = promotionCandidates[effectivePromotionIndex] ?? null

  const shareCardData = useMemo(() => ({
    lifeRunId,
    characterName: characterName || '无名之辈',
    worldName,
    ageLabel,
    rounds: allNarratives.length,
    overallScore,
    attributes,
    achievementCount: achievements.length,
    featuredAchievement: featuredAchievement
      ? { title: featuredAchievement.title, detail: featuredAchievement.detail }
      : null,
    dimensions,
    reincarnation: promotedTalent
      ? {
          name: promotedTalent.name,
          description: promotedTalent.description,
          effect: promotedTalent.effect,
        }
      : null,
  }), [
    achievements.length,
    ageLabel,
    allNarratives.length,
    attributes,
    characterName,
    dimensions,
    featuredAchievement,
    lifeRunId,
    overallScore,
    promotedTalent,
    worldName,
  ])
  const shareFacts = useMemo(() => buildGameOverShareFacts(shareCardData), [shareCardData])
  const cloudLifeRecord = useMemo(() => scoreResult && endingReview && completedAt !== null ? ({
    recordId: lifeRunId,
    completedAt,
    characterName: characterName || '无名之辈',
    worldName,
    finalAge: characterAge,
    rounds: narrativeHistory.length,
    died: isDead,
    overallScore: scoreResult.score,
    attributes,
    achievements: achievements.map(({ id, kind, title, detail, timeLabel }) => ({
      id,
      kind,
      title,
      detail,
      timeLabel,
    })),
    dimensions: scoreResult.dimensions,
    scoring: {
      ...scoreResult,
      audit: scoringAudit,
    },
    endingReview,
    destinyNames: regularPatterns.map((pattern) => pattern.name),
    ...(promotedTalent ? { reincarnationName: promotedTalent.name } : {}),
    gameVersion: ENGINE_VERSION,
  }) : null, [
    achievements,
    attributes,
    characterAge,
    characterName,
    completedAt,
    endingReview,
    isDead,
    lifeRunId,
    narrativeHistory,
    promotedTalent,
    regularPatterns,
    scoreResult,
    scoringAudit,
    worldName,
  ])
  const promotionLifeDigests = useMemo(() => (
    compressedSummaries.summaries
      .slice()
      .sort((left, right) => left.sourceRound - right.sourceRound)
      .map((item) => ({ sourceRound: item.sourceRound, summary: item.content }))
  ), [compressedSummaries.summaries])
  const promotionLifeRecords = useMemo(() => narrativeHistory.map((entry, index) => (
    `${entry.displayTimeLabel ?? `第${index + 1}轮`}：${entry.text}`
  )), [narrativeHistory])

  return {
    activePromotionCandidate,
    activePromotionIndex,
    cloudLifeRecord,
    effectivePromotionIndex,
    promotionCandidates,
    promotionLifeDigests,
    promotionLifeRecords,
    promotedTalent,
    reincarnationStrength,
    setActivePromotionIndex,
    setPromotedTalent,
    shareCardData,
    shareFacts,
  }
}
