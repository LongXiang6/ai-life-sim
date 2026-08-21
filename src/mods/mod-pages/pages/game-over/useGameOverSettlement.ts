/**
 * Purpose: Expose the single life-settlement execution and its player-visible terminal state.
 * Owner: mod-pages/game-over
 * Responsibility: React request ownership and presentation status only.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { LifeScoringResult } from '@/foundation'

import type { EndingReview } from './game-over-review'
import {
  runGameOverSettlement,
  type GameOverSettlementStage,
} from './game-over-settlement'
import type { useGameOverSnapshot } from './useGameOverSnapshot'

type GameOverSnapshot = ReturnType<typeof useGameOverSnapshot>

export type GameOverSettlementStatus =
  | 'idle'
  | GameOverSettlementStage
  | 'succeeded'
  | 'failed'

export function useGameOverSettlement(snapshot: GameOverSnapshot) {
  const [completedAt, setCompletedAt] = useState<number | null>(null)
  const [scoreResult, setScoreResult] = useState<LifeScoringResult | null>(null)
  const [endingReview, setEndingReview] = useState<EndingReview | null>(null)
  const [settlementError, setSettlementError] = useState('')
  const [settlementStatus, setSettlementStatus] = useState<GameOverSettlementStatus>('idle')
  const startedRequestKeyRef = useRef('')
  const activeExecutionRef = useRef('')

  const executeSettlement = useCallback(() => {
    if (!snapshot.canViewGameOver) return
    const executionKey = `${snapshot.requestKey}:${Date.now()}`
    activeExecutionRef.current = executionKey
    setCompletedAt(null)
    setScoreResult(null)
    setEndingReview(null)
    setSettlementError('')
    setSettlementStatus('preparing')
    void runGameOverSettlement(snapshot.settlementSnapshot, {
      onStage: (stage) => {
        if (activeExecutionRef.current === executionKey) setSettlementStatus(stage)
      },
      onScore: (score) => {
        if (activeExecutionRef.current === executionKey) setScoreResult(score)
      },
    }).then((result) => {
      if (activeExecutionRef.current !== executionKey) return
      setCompletedAt(result.completedAt)
      setScoreResult(result.score)
      setEndingReview(result.review)
      setSettlementStatus('succeeded')
    }).catch((error) => {
      if (activeExecutionRef.current !== executionKey) return
      setSettlementError(error instanceof Error ? error.message : '人生结算生成失败')
      setSettlementStatus('failed')
    })
  }, [snapshot.canViewGameOver, snapshot.requestKey, snapshot.settlementSnapshot])

  useEffect(() => {
    if (!snapshot.canViewGameOver || startedRequestKeyRef.current === snapshot.requestKey) return
    startedRequestKeyRef.current = snapshot.requestKey
    queueMicrotask(executeSettlement)
  }, [executeSettlement, snapshot.canViewGameOver, snapshot.requestKey])

  const retrySettlement = useCallback(() => {
    if (settlementStatus !== 'failed') return
    executeSettlement()
  }, [executeSettlement, settlementStatus])

  return {
    completedAt,
    effectiveEndingReview: endingReview,
    endingReviewReady: settlementStatus === 'succeeded',
    lifeSummary: endingReview?.review ?? '',
    lifeVerse: endingReview?.verse ?? '',
    scoreResult,
    settlementError,
    settlementReady: settlementStatus === 'succeeded',
    settlementStatus,
    retrySettlement,
  }
}
