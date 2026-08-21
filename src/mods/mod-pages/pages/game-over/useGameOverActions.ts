/**
 * Purpose: Execute optional reincarnation promotion, sharing, and new-life commands from game over.
 * Owner: mod-pages/game-over
 * Responsibility: User command state and side effects only; scoring and publication live elsewhere.
 */

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { callAI } from '@/core'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import { useReincarnationLibraryStore } from '@/mods/mod-character'
import {
  createPromotedReincarnationTalent,
  decideReincarnationPromotion,
  promoteReincarnationTalent,
} from '@/mods/mod-character/reincarnation-talent-access'
import { useSettingsStore } from '@/mods/mod-settings'
import type { AIModelConfig, LifeScoringResult } from '@/foundation'

import { resetForNewLife } from '../../helpers/new-life-reset'
import {
  saveGameOverShareCard,
  shareGameOverLife,
} from './game-over-share-card'
import type { useGameOverArtifacts } from './useGameOverArtifacts'
import type { useGameOverSnapshot } from './useGameOverSnapshot'

type GameOverArtifacts = ReturnType<typeof useGameOverArtifacts>
type GameOverSnapshot = ReturnType<typeof useGameOverSnapshot>

interface UseGameOverActionsOptions {
  artifacts: GameOverArtifacts
  lifeSummary: string
  scoreResult: LifeScoringResult | null
  settlementReady: boolean
  snapshot: GameOverSnapshot
}

export function useGameOverActions({
  artifacts,
  lifeSummary,
  scoreResult,
  settlementReady,
  snapshot,
}: UseGameOverActionsOptions) {
  const router = useRouter()
  const [confirmingNewLife, setConfirmingNewLife] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [promotionError, setPromotionError] = useState('')
  const [shareBusy, setShareBusy] = useState<'share' | 'save' | null>(null)
  const [shareStatus, setShareStatus] = useState('')
  const [startingNewLife, setStartingNewLife] = useState(false)
  const leavingForNewLifeRef = useRef(false)
  const startingNewLifeRef = useRef(false)
  const promotingRef = useRef(false)
  const {
    activePromotionCandidate,
    promotionLifeDigests,
    promotionLifeRecords,
    promotedTalent,
    reincarnationStrength,
    setPromotedTalent,
    shareCardData,
  } = artifacts
  const {
    characterAge,
    characterName,
    lifeRunId,
    worldConfig,
    worldName,
  } = snapshot
  const overallScore = scoreResult?.score ?? 0

  const handlePromote = useCallback(async () => {
    const candidate = activePromotionCandidate
    if (!candidate || !settlementReady || !scoreResult || promotingRef.current || promotedTalent) return
    promotingRef.current = true
    setPromoting(true)
    setPromotionError('')
    try {
      const { provider, customKey, customUrl, customModel } = useSettingsStore.getState()
      const model = customModel || DEFAULT_AI_MODEL
      const promotionDecision = decideReincarnationPromotion(candidate)
      const result = await promoteReincarnationTalent({
        worldName,
        worldDescription: worldConfig?.description,
        characterName: characterName || '无名之辈',
        finalAge: characterAge,
        lifeSummary,
        lifeDigests: promotionLifeDigests,
        lifeRecords: promotionLifeRecords,
        selectedPattern: candidate,
        endingScore: overallScore,
        strengthTier: reincarnationStrength,
        promotionDecision,
      }, {
        callAI: async (systemPrompt, userPrompt, rawOptions) => {
          const options = rawOptions as {
            pool?: 'lowFrequency'
            jsonMode?: boolean
            signal?: AbortSignal
            outputSchema?: Parameters<typeof callAI>[2]['outputSchema']
            logContext?: { callKind: string }
          }
          const config: AIModelConfig = {
            model,
            temperature: 0.62,
            stream: false,
            reasoningEffort: 'disabled',
          }
          return callAI(systemPrompt, userPrompt, {
            config,
            pool: options.pool ?? 'lowFrequency',
            jsonMode: options.jsonMode ?? true,
            signal: options.signal,
            outputSchema: options.outputSchema,
            providerId: provider,
            apiKey: customKey || undefined,
            customBaseUrl: customUrl || undefined,
            customModel: model,
            reasoningEffort: 'disabled',
            logContext: options.logContext ?? { callKind: 'reincarnation-promotion', pool: 'lowFrequency', model },
          })
        },
      })
      const talent = createPromotedReincarnationTalent(candidate, result, promotionDecision, {
        worldName,
        characterName: characterName || '无名之辈',
        finalAge: characterAge,
        runId: lifeRunId,
      })
      useReincarnationLibraryStore.getState().addReincarnationTalent(talent)
      setPromotedTalent(talent)
    } catch (error) {
      setPromotionError(error instanceof Error ? error.message : '轮回天赋升阶失败，请重试')
    } finally {
      promotingRef.current = false
      setPromoting(false)
    }
  }, [
    activePromotionCandidate,
    characterAge,
    characterName,
    lifeRunId,
    lifeSummary,
    overallScore,
    promotedTalent,
    promotionLifeDigests,
    promotionLifeRecords,
    reincarnationStrength,
    scoreResult,
    setPromotedTalent,
    settlementReady,
    worldConfig,
    worldName,
  ])

  const handleShareLife = useCallback(async () => {
    if (!settlementReady || shareBusy) return
    setShareBusy('share')
    setShareStatus('正在生成此生分享卡…')
    try {
      const outcome = await shareGameOverLife({ ...shareCardData, shareUrl: window.location.origin })
      setShareStatus(outcome === 'shared'
        ? '系统分享已完成。'
        : outcome === 'downloaded'
          ? '当前浏览器未提供图片分享，已改为保存 PNG。'
          : '已取消分享，结算内容没有改变。')
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : '分享卡生成失败，请稍后重试。')
    } finally {
      setShareBusy(null)
    }
  }, [settlementReady, shareBusy, shareCardData])

  const handleSaveShareCard = useCallback(async () => {
    if (!settlementReady || shareBusy) return
    setShareBusy('save')
    setShareStatus('正在生成 PNG…')
    try {
      await saveGameOverShareCard({ ...shareCardData, shareUrl: window.location.origin })
      setShareStatus('人生分享卡已保存为 PNG。')
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : '分享卡保存失败，请稍后重试。')
    } finally {
      setShareBusy(null)
    }
  }, [settlementReady, shareBusy, shareCardData])

  const handleStartNewLife = useCallback(async () => {
    if (!settlementReady || startingNewLifeRef.current) return
    if (!confirmingNewLife) {
      setConfirmingNewLife(true)
      return
    }
    startingNewLifeRef.current = true
    setStartingNewLife(true)
    leavingForNewLifeRef.current = true
    setPromotionError('')
    try {
      await resetForNewLife()
      router.push('/new-game/world-select')
    } catch (error) {
      leavingForNewLifeRef.current = false
      startingNewLifeRef.current = false
      setStartingNewLife(false)
      setPromotionError(error instanceof Error ? error.message : '开启新人生失败，请稍后重试')
    }
  }, [confirmingNewLife, router, settlementReady])

  const handleFooterBack = useCallback(() => {
    if (confirmingNewLife) {
      setConfirmingNewLife(false)
      return
    }
    router.push('/welcome')
  }, [confirmingNewLife, router])

  const handleViewSimulationData = useCallback(() => {
    document.getElementById('dimensions-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return {
    confirmingNewLife,
    handleFooterBack,
    handlePromote,
    handleSaveShareCard,
    handleShareLife,
    handleStartNewLife,
    handleViewSimulationData,
    leavingForNewLifeRef,
    promoting,
    promotionError,
    setShareStatus,
    shareBusy,
    shareStatus,
    startingNewLife,
  }
}
