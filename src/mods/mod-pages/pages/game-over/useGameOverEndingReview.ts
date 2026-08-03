/**
 * Purpose: Resolve the committed or generated ending review for a completed life.
 * Owner: mod-pages/game-over
 * Responsibility: Ending-review request state and effective review selection only.
 */

import { useEffect, useRef, useState } from 'react'

import { generateEndingReview, type EndingReview } from './game-over-review'
import type { useGameOverScore } from './useGameOverScore'

type GameOverScore = ReturnType<typeof useGameOverScore>

export function useGameOverEndingReview(score: GameOverScore) {
  const [endingReview, setEndingReview] = useState<EndingReview | null>(null)
  const [endingReviewReady, setEndingReviewReady] = useState(false)
  const endingReviewRequestedRef = useRef('')
  const {
    achievements,
    canViewGameOver,
    characterAge,
    characterName,
    committedEpilogueReview,
    isDead,
    lifeRunId,
    localEndingReview,
    narrativeHistory,
    overallScore,
    scoreResult,
    worldName,
  } = score

  useEffect(() => {
    const requestKey = `${lifeRunId}:${committedEpilogueReview ? 'committed-epilogue' : 'score-review'}`
    if (!canViewGameOver || endingReviewRequestedRef.current === requestKey) return
    endingReviewRequestedRef.current = requestKey
    let active = true
    queueMicrotask(() => {
      if (!active) return
      if (committedEpilogueReview) {
        setEndingReviewReady(true)
        return
      }
      setEndingReview(localEndingReview)
      setEndingReviewReady(false)
      void generateEndingReview({
        lifeRunId,
        round: narrativeHistory.length,
        characterName: characterName || '无名之辈',
        worldName,
        finalAge: characterAge,
        died: isDead,
        score: overallScore,
        dimensions: scoreResult.dimensions,
        achievements,
      }).then((review) => {
        if (!active) return
        setEndingReview(review)
        setEndingReviewReady(true)
      })
    })
    return () => { active = false }
  }, [
    achievements,
    canViewGameOver,
    characterAge,
    characterName,
    committedEpilogueReview,
    isDead,
    lifeRunId,
    localEndingReview,
    narrativeHistory.length,
    overallScore,
    scoreResult.dimensions,
    worldName,
  ])

  const effectiveEndingReview = committedEpilogueReview ?? endingReview ?? localEndingReview
  return {
    effectiveEndingReview,
    endingReviewReady,
    lifeSummary: effectiveEndingReview.review,
  }
}
