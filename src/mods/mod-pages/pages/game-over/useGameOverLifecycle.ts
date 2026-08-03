/**
 * Purpose: Persist and publish a completed life while guarding invalid game-over entry.
 * Owner: mod-pages/game-over
 * Responsibility: Redirect, local record persistence, account sync, and portrait-mail publication only.
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { useAccountClientStore } from '@/core/account/account-client-store'
import { requestPortraitMail } from '@/core/player-content/player-content-client'
import { useLifeRecordStore } from '@/mods/mod-character'

import { syncAccountNow } from '../../helpers/account-cloud-sync'
import type { useGameOverActions } from './useGameOverActions'
import type { useGameOverArtifacts } from './useGameOverArtifacts'
import type { useGameOverEndingReview } from './useGameOverEndingReview'
import type { useGameOverScore } from './useGameOverScore'

type GameOverActions = ReturnType<typeof useGameOverActions>
type GameOverArtifacts = ReturnType<typeof useGameOverArtifacts>
type GameOverEndingReview = ReturnType<typeof useGameOverEndingReview>
type GameOverScore = ReturnType<typeof useGameOverScore>

interface UseGameOverLifecycleOptions {
  actions: GameOverActions
  artifacts: GameOverArtifacts
  endingReview: GameOverEndingReview
  score: GameOverScore
}

export function useGameOverLifecycle({
  actions,
  artifacts,
  endingReview,
  score,
}: UseGameOverLifecycleOptions) {
  const router = useRouter()
  const upsertLifeRecord = useLifeRecordStore((state) => state.upsertRecord)
  const publishedRecordRef = useRef('')
  const { leavingForNewLifeRef, setShareStatus } = actions
  const { cloudLifeRecord } = artifacts
  const { effectiveEndingReview, endingReviewReady } = endingReview
  const { canViewGameOver, narrativeHistory, overallScore, scoreResult } = score

  useEffect(() => {
    if (!canViewGameOver && !leavingForNewLifeRef.current) {
      router.replace(narrativeHistory.length > 0 ? '/game-story' : '/welcome')
    }
  }, [canViewGameOver, leavingForNewLifeRef, narrativeHistory.length, router])

  useEffect(() => {
    if (!canViewGameOver) return
    queueMicrotask(() => {
      try {
        upsertLifeRecord(cloudLifeRecord)
      } catch (error) {
        setShareStatus(error instanceof Error ? error.message : '战绩保存失败')
      }
    })
  }, [canViewGameOver, cloudLifeRecord, setShareStatus, upsertLifeRecord])

  useEffect(() => {
    if (!canViewGameOver
      || !endingReviewReady
      || overallScore <= 97
      || !scoreResult.integrity.passed
      || useAccountClientStore.getState().status !== 'authenticated') return
    const publicationKey = `${cloudLifeRecord.recordId}:${effectiveEndingReview.source}:${effectiveEndingReview.review}`
    if (publishedRecordRef.current === publicationKey) return
    let active = true
    publishedRecordRef.current = publicationKey
    void (async () => {
      try {
        await syncAccountNow()
        if (active && overallScore === 100 && scoreResult.integrity.perfectGatePassed) {
          await requestPortraitMail(cloudLifeRecord.recordId, effectiveEndingReview.review)
        }
      } catch (error) {
        publishedRecordRef.current = ''
        if (active) setShareStatus(error instanceof Error ? error.message : '战绩同步失败')
      }
    })()
    return () => { active = false }
  }, [
    canViewGameOver,
    cloudLifeRecord.recordId,
    effectiveEndingReview.review,
    effectiveEndingReview.source,
    endingReviewReady,
    overallScore,
    scoreResult.integrity.passed,
    scoreResult.integrity.perfectGatePassed,
    setShareStatus,
  ])
}
