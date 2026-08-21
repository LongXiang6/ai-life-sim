/**
 * Purpose: Persist and publish a completed life while guarding invalid game-over entry.
 * Owner: mod-pages/game-over
 * Responsibility: Redirect, local record persistence, and eligible leaderboard sync only.
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { useAccountClientStore } from '@/core/account/account-client-store'
import { useLifeRecordStore } from '@/mods/mod-character'

import { syncAccountNow } from '../../helpers/account-cloud-sync'
import type { useGameOverActions } from './useGameOverActions'
import type { useGameOverArtifacts } from './useGameOverArtifacts'
import type { useGameOverSettlement } from './useGameOverSettlement'
import type { useGameOverSnapshot } from './useGameOverSnapshot'

type GameOverActions = ReturnType<typeof useGameOverActions>
type GameOverArtifacts = ReturnType<typeof useGameOverArtifacts>
type GameOverSettlement = ReturnType<typeof useGameOverSettlement>
type GameOverSnapshot = ReturnType<typeof useGameOverSnapshot>

interface UseGameOverLifecycleOptions {
  actions: GameOverActions
  artifacts: GameOverArtifacts
  settlement: GameOverSettlement
  snapshot: GameOverSnapshot
}

export function useGameOverLifecycle({
  actions,
  artifacts,
  settlement,
  snapshot,
}: UseGameOverLifecycleOptions) {
  const router = useRouter()
  const upsertLifeRecord = useLifeRecordStore((state) => state.upsertRecord)
  const publishedRecordRef = useRef('')
  const { leavingForNewLifeRef, setShareStatus } = actions
  const { cloudLifeRecord } = artifacts
  const {
    effectiveEndingReview,
    scoreResult,
    settlementReady,
  } = settlement
  const { canViewGameOver, narrativeHistory } = snapshot

  useEffect(() => {
    if (!canViewGameOver && !leavingForNewLifeRef.current) {
      router.replace(narrativeHistory.length > 0 ? '/game-story' : '/welcome')
    }
  }, [canViewGameOver, leavingForNewLifeRef, narrativeHistory.length, router])

  useEffect(() => {
    if (!canViewGameOver || !cloudLifeRecord) return
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
      || !settlementReady
      || !scoreResult
      || !cloudLifeRecord
      || narrativeHistory.length <= 100
      || !scoreResult.integrity.passed
      || useAccountClientStore.getState().status !== 'authenticated') return
    const publicationKey = `${cloudLifeRecord.recordId}:${effectiveEndingReview?.source}:${effectiveEndingReview?.review}:${effectiveEndingReview?.verse}`
    if (publishedRecordRef.current === publicationKey) return
    let active = true
    publishedRecordRef.current = publicationKey
    void (async () => {
      try {
        await syncAccountNow()
      } catch (error) {
        publishedRecordRef.current = ''
        if (active) setShareStatus(error instanceof Error ? error.message : '战绩同步失败')
      }
    })()
    return () => { active = false }
  }, [
    canViewGameOver,
    cloudLifeRecord,
    effectiveEndingReview?.review,
    effectiveEndingReview?.source,
    effectiveEndingReview?.verse,
    narrativeHistory.length,
    scoreResult,
    scoreResult?.integrity.passed,
    setShareStatus,
    settlementReady,
  ])
}
