/**
 * Purpose: Execute mythic generation, sealing, sharing, and new-life commands from game over.
 * Owner: mod-pages/game-over
 * Responsibility: User command state and side effects only; scoring and publication live elsewhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { callAI } from '@/core'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import {
  useCharacterStore,
  useMythicLibraryStore,
} from '@/mods/mod-character'
import { generateMythicPatternCandidates } from '@/mods/mod-character/mythic-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings'
import type { AIModelConfig } from '@/foundation'

import { resetForNewLife } from '../../helpers/new-life-reset'
import {
  saveGameOverShareCard,
  shareGameOverLife,
} from './game-over-share-card'
import type { useGameOverArtifacts } from './useGameOverArtifacts'
import type { useGameOverScore } from './useGameOverScore'

type GameOverArtifacts = ReturnType<typeof useGameOverArtifacts>
type GameOverScore = ReturnType<typeof useGameOverScore>

interface UseGameOverActionsOptions {
  artifacts: GameOverArtifacts
  lifeSummary: string
  preGenerationActive: boolean
  score: GameOverScore
}

export function useGameOverActions({
  artifacts,
  lifeSummary,
  preGenerationActive,
  score,
}: UseGameOverActionsOptions) {
  const router = useRouter()
  const setMythicCandidates = useCharacterStore((state) => state.setMythicCandidates)
  const setSealedMythicPatternId = useCharacterStore((state) => state.setSealedMythicPatternId)
  const addMythicPattern = useMythicLibraryStore((state) => state.addPattern)
  const [confirmingNewLife, setConfirmingNewLife] = useState(false)
  const [mythicGenerating, setMythicGenerating] = useState(false)
  const [mythicError, setMythicError] = useState('')
  const [shareBusy, setShareBusy] = useState<'share' | 'save' | null>(null)
  const [shareStatus, setShareStatus] = useState('')
  const [startingNewLife, setStartingNewLife] = useState(false)
  const leavingForNewLifeRef = useRef(false)
  const startingNewLifeRef = useRef(false)
  const mythicAbortRef = useRef<AbortController | null>(null)
  const {
    activeMythicCandidate,
    mythicCandidates,
    mythicFinalState,
    mythicLibrary,
    mythicLifeDigests,
    mythicLifeRecords,
    sealedMythicPatternId,
    setActiveMythicIndex,
    shareCardData,
  } = artifacts
  const {
    canViewGameOver,
    characterAge,
    characterName,
    lifeRunId,
    overallScore,
    regularPatterns,
    reincarnationStrength,
    worldConfig,
    worldName,
  } = score

  const handleGenerateMythics = useCallback(async () => {
    if (mythicCandidates.length === 3 || mythicAbortRef.current) return
    const controller = new AbortController()
    mythicAbortRef.current = controller
    setMythicGenerating(true)
    setMythicError('')
    try {
      const { provider, customKey, customUrl, customModel } = useSettingsStore.getState()
      const model = customModel || DEFAULT_AI_MODEL
      const candidates = await generateMythicPatternCandidates({
        worldName,
        worldDescription: worldConfig?.description,
        characterName: characterName || '无名之辈',
        finalAge: characterAge,
        lifeSummary: `${lifeSummary} 普通命格：${regularPatterns.map((pattern) => `${pattern.name}：${pattern.effect}`).join('；') || '无'}。`,
        finalState: mythicFinalState,
        lifeDigests: mythicLifeDigests,
        lifeRecords: mythicLifeRecords,
        existingPatterns: mythicLibrary,
        endingScore: overallScore,
        strengthTier: reincarnationStrength,
      }, {
        signal: controller.signal,
        callAI: async (systemPrompt, userPrompt, rawOptions) => {
          const options = rawOptions as {
            pool?: 'lowFrequency'
            jsonMode?: boolean
            signal?: AbortSignal
            maxTokensOverride?: number
            outputSchema?: Parameters<typeof callAI>[2]['outputSchema']
          }
          const config: AIModelConfig = {
            model,
            temperature: 0.62,
            maxTokens: options.maxTokensOverride ?? 1800,
            stream: false,
            reasoningEffort: 'disabled',
          }
          return callAI(systemPrompt, userPrompt, {
            config,
            pool: options.pool ?? 'lowFrequency',
            jsonMode: options.jsonMode ?? true,
            signal: options.signal,
            outputSchema: options.outputSchema,
            strictSchema: true,
            providerId: provider,
            apiKey: customKey || undefined,
            customBaseUrl: customUrl || undefined,
            customModel: model,
            reasoningEffort: 'disabled',
            overrideMaxTokens: options.maxTokensOverride ?? 1800,
            logContext: { callKind: 'mythic-pattern-generate', pool: 'lowFrequency', model },
          })
        },
      })
      setMythicCandidates(candidates)
      setActiveMythicIndex(0)
    } catch (error) {
      if (!controller.signal.aborted) {
        setMythicError(error instanceof Error ? error.message : '轮回天赋生成失败，请重试')
      }
    } finally {
      if (mythicAbortRef.current === controller) mythicAbortRef.current = null
      if (!controller.signal.aborted) setMythicGenerating(false)
    }
  }, [
    characterAge,
    characterName,
    lifeSummary,
    mythicCandidates.length,
    mythicFinalState,
    mythicLibrary,
    mythicLifeDigests,
    mythicLifeRecords,
    overallScore,
    reincarnationStrength,
    regularPatterns,
    setActiveMythicIndex,
    setMythicCandidates,
    worldConfig,
    worldName,
  ])

  const handleSealMythic = useCallback(() => {
    if (!activeMythicCandidate || sealedMythicPatternId) return
    try {
      const sealed = addMythicPattern(activeMythicCandidate, {
        worldName,
        characterName: characterName || '无名之辈',
        finalAge: characterAge,
        runId: lifeRunId,
      })
      setSealedMythicPatternId(sealed.id)
      setMythicError('')
    } catch (error) {
      setMythicError(error instanceof Error ? error.message : '轮回天赋封存失败')
    }
  }, [
    activeMythicCandidate,
    addMythicPattern,
    characterAge,
    characterName,
    lifeRunId,
    sealedMythicPatternId,
    setSealedMythicPatternId,
    worldName,
  ])

  const handleShareLife = useCallback(async () => {
    if (shareBusy) return
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
  }, [shareBusy, shareCardData])

  const handleSaveShareCard = useCallback(async () => {
    if (shareBusy) return
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
  }, [shareBusy, shareCardData])

  const handleStartNewLife = useCallback(async () => {
    if (preGenerationActive || startingNewLifeRef.current) return
    if (!sealedMythicPatternId) {
      setMythicError(mythicCandidates.length === 3
        ? '请先从三个轮回天赋中选择一项并封存。'
        : '请先完成轮回天赋的生成与封存。')
      return
    }
    if (!confirmingNewLife) {
      setConfirmingNewLife(true)
      return
    }
    startingNewLifeRef.current = true
    setStartingNewLife(true)
    leavingForNewLifeRef.current = true
    setMythicError('')
    try {
      await resetForNewLife()
      router.push('/new-game/world-select')
    } catch (error) {
      leavingForNewLifeRef.current = false
      startingNewLifeRef.current = false
      setStartingNewLife(false)
      setMythicError(error instanceof Error ? error.message : '开启新人生失败，请稍后重试')
    }
  }, [confirmingNewLife, mythicCandidates.length, preGenerationActive, router, sealedMythicPatternId])

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

  useEffect(() => {
    if (!canViewGameOver || mythicCandidates.length === 3 || sealedMythicPatternId) return
    const timer = window.setTimeout(() => { void handleGenerateMythics() }, 0)
    return () => {
      window.clearTimeout(timer)
      mythicAbortRef.current?.abort()
    }
  }, [canViewGameOver, handleGenerateMythics, mythicCandidates.length, sealedMythicPatternId])

  return {
    confirmingNewLife,
    handleFooterBack,
    handleGenerateMythics,
    handleSaveShareCard,
    handleSealMythic,
    handleShareLife,
    handleStartNewLife,
    handleViewSimulationData,
    leavingForNewLifeRef,
    mythicError,
    mythicGenerating,
    setShareStatus,
    shareBusy,
    shareStatus,
    startingNewLife,
  }
}
