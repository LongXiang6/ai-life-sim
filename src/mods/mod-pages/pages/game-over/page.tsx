/**
 * @file page.tsx
 * @description 游戏结束页面 —— 人生评分、人生总结、轮回天赋封存与本机分享卡
 * @mod mod-pages
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  useCharacterStore,
  useLifeRecordStore,
  useMythicLibraryStore,
} from '@/mods/mod-character'
import { generateMythicPatternCandidates } from '@/mods/mod-character/mythic-pattern-access'
import {
  buildFallbackWorldScoringProfile,
  isCompleteWorldScoringProfile,
  useWorldStore,
} from '@/mods/mod-world'
import { useEngineStore, usePreGenQueueStatus } from '@/mods/mod-engine'
import { useSettingsStore } from '@/mods/mod-settings'

import { calculateLifeScore, callAI, useGlobalStore } from '@/core'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import { useAccountClientStore } from '@/core/account/account-client-store'
import { requestPortraitMail } from '@/core/player-content/player-content-client'
import { ENGINE_VERSION } from '@/core/version'

import { PageScroll } from '@/mods/mod-ui'

import type { RadarDimension } from '@/mods/mod-ui'
import type {
  AIModelConfig,
  LifeScoringAuditSnapshot,
  NarrativeTransitionAuditSnapshot,
} from '@/foundation'

import styles from './GameOver.module.css'
import { GAME_OVER_DIMENSION_ICONS, GameOverRadar } from './GameOverRadar'
import {
  buildGameOverShareFacts,
  saveGameOverShareCard,
  shareGameOverLife,
} from './game-over-share-card'
import {
  buildGameOverAchievements,
  getReincarnationStrengthTier,
  selectFeaturedAchievement,
} from './game-over-scoring'
import {
  buildLocalEndingReview,
  generateEndingReview,
  type EndingReview,
} from './game-over-review'
import { resetForNewLife } from '../../helpers/new-life-reset'
import { syncAccountNow } from '../../helpers/account-cloud-sync'

const MORALITY_LABELS: Record<string, string> = {
  supremeGood: '至善',
  greatGood: '大善',
  good: '善良',
  balanced: '中庸',
  evilLeaning: '偏恶',
  greatEvil: '大恶',
  supremeEvil: '极恶',
}

function formatMorality(level: string): string {
  return MORALITY_LABELS[level] ?? '中庸'
}

interface LifeRecordSource {
  text: string
  displayTimeLabel?: string
  displayAge?: number
}

interface LifeRecord {
  id: string
  stage: string
  timeLabel: string
  ageLabel: string
  text: string
}

function missingTransitionAudit(
  round: number,
  narrativeId: string,
): NarrativeTransitionAuditSnapshot {
  return {
    schemaVersion: 1,
    round,
    narrativeId,
    validatedWritePath: false,
    interceptorPassed: false,
    intentValidationPassed: false,
    historicalCommitPassed: false,
    structuredDataPresent: false,
    structuredDataAccepted: false,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    trusted: false,
    validationClean: false,
    reasons: ['missing-transition-audit'],
  }
}

/** 从真实叙事历史中选择早、中、末三处记录，不推断新的剧情语义。 */
function selectLifeRecords(history: LifeRecordSource[]): LifeRecord[] {
  if (history.length === 0) return []

  const lastIndex = history.length - 1
  const indexes = Array.from(new Set([0, Math.floor(lastIndex / 2), lastIndex]))

  return indexes.map((index) => {
    const entry = history[index]
    const stage = history.length === 1
      ? '人生记录'
      : index === 0
        ? '早期记录'
        : index === lastIndex
          ? '最终记录'
          : '中期记录'

    return {
      id: `${index}-${entry.displayTimeLabel ?? ''}-${entry.displayAge ?? ''}`,
      stage,
      timeLabel: entry.displayTimeLabel ?? `第 ${index + 1} 轮`,
      ageLabel: entry.displayAge === undefined ? '' : `${entry.displayAge} 岁`,
      text: entry.text,
    }
  })
}

// ============================================================
// 组件
// ============================================================

export default function GameOverPage() {
  const router = useRouter()
  const characterName = useCharacterStore((s) => s.name)
  const characterAge = useCharacterStore((s) => s.age)
  const physique = useCharacterStore((s) => s.characterBase.current.physique)
  const mind = useCharacterStore((s) => s.characterBase.current.mind)
  const talentAptitude = useCharacterStore((s) => s.characterBase.current.talentAptitude)
  const charisma = useCharacterStore((s) => s.characterBase.current.charisma)
  const morality = useCharacterStore((s) => s.morality)
  const lifespanBreakthroughs = useCharacterStore((s) => s.lifespan.breakthroughs)
  const regularPatterns = useCharacterStore((s) => s.destinyPatterns.patterns)
  const mythicCandidates = useCharacterStore((s) => s.mythicCandidates)
  const sealedMythicPatternId = useCharacterStore((s) => s.sealedMythicPatternId)
  const setMythicCandidates = useCharacterStore((s) => s.setMythicCandidates)
  const setSealedMythicPatternId = useCharacterStore((s) => s.setSealedMythicPatternId)
  const mythicLibrary = useMythicLibraryStore((s) => s.patterns)
  const addMythicPattern = useMythicLibraryStore((s) => s.addPattern)
  const upsertLifeRecord = useLifeRecordStore((s) => s.upsertRecord)
  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const currentContextId = useWorldStore((s) => s.currentContextId)
  const worldviewId = useGlobalStore((s) => s.worldviewId)
  const narrativeHistory = useEngineStore((s) => s.narrativeHistory)
  const storyRepetitionStats = useEngineStore((s) => s.storyRepetitionStats)
  const compressedSummaries = useEngineStore((s) => s.compressedSummaries)
  const lifeRunId = useEngineStore((s) => s.lifeRunId)
  const totalRounds = useEngineStore((s) => s.totalRounds)
  const narrativeError = useEngineStore((s) => s.narrativeError)
  const status = useEngineStore((s) => s.status)
  const preGenStatus = usePreGenQueueStatus()
  const isDead = useCharacterStore((s) => s.health.isDead)
  const [activeDimensionIndex, setActiveDimensionIndex] = useState(0)
  const [confirmingNewLife, setConfirmingNewLife] = useState(false)
  const [activeMythicIndex, setActiveMythicIndex] = useState(0)
  const [mythicGenerating, setMythicGenerating] = useState(false)
  const [mythicError, setMythicError] = useState('')
  const [shareBusy, setShareBusy] = useState<'share' | 'save' | null>(null)
  const [shareStatus, setShareStatus] = useState('')
  const [startingNewLife, setStartingNewLife] = useState(false)
  const leavingForNewLifeRef = useRef(false)
  const startingNewLifeRef = useRef(false)
  const mythicAbortRef = useRef<AbortController | null>(null)
  const endingReviewRequestedRef = useRef('')
  const publishedRecordRef = useRef('')
  const [endingReview, setEndingReview] = useState<EndingReview | null>(null)
  const [endingReviewReady, setEndingReviewReady] = useState(false)

  const canViewGameOver = status === 'complete' || isDead

  const allNarratives = useMemo(
    () => narrativeHistory.map((narrative) => narrative.text),
    [narrativeHistory],
  )

  const achievements = useMemo(
    () => buildGameOverAchievements(narrativeHistory, lifespanBreakthroughs),
    [lifespanBreakthroughs, narrativeHistory],
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
      breakthroughCount: lifespanBreakthroughs.length,
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
  }, [achievements, canViewGameOver, lifeRunId, lifespanBreakthroughs.length, narrativeError, narrativeHistory.length, scoringNarrativeIds, totalRounds, transitionAudits])
  const scoreResult = useMemo(() => calculateLifeScore({
    profile: scoringProfile,
    lifeRunId: scoringAudit.lifeRunId,
    attributeValues: [physique, mind, talentAptitude, charisma],
    rounds: narrativeHistory.length,
    committedRounds: scoringAudit.committedRounds,
    narrativeIds: scoringAudit.narrativeIds,
    resolvedChoiceCount: scoringAudit.resolvedChoiceCount,
    breakthroughCount: scoringAudit.breakthroughCount,
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
  }), [achievements, characterAge, characterName, isDead, lifeRunId, narrativeHistory.length, overallScore, scoreResult.dimensions, worldName])
  const effectiveEndingReview = endingReview ?? localEndingReview
  const lifeSummary = effectiveEndingReview.review
  const lifeRecords = useMemo(() => selectLifeRecords(narrativeHistory), [narrativeHistory])
  const firstRecordedAge = useMemo(
    () => narrativeHistory.find((entry) => entry.displayAge !== undefined)?.displayAge,
    [narrativeHistory],
  )
  const ageLabel = firstRecordedAge !== undefined && firstRecordedAge < characterAge
    ? `${firstRecordedAge}—${characterAge} 岁`
    : `${characterAge} 岁`
  const moralityLabel = formatMorality(morality.level)
  const activeDimension = dimensions[activeDimensionIndex] ?? dimensions[0]
  const sealCharacter = characterName.trim().slice(0, 1) || '终'
  const roundLabel = String(allNarratives.length).padStart(3, '0')
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
    attributes: { physique, mind, talentAptitude, charisma },
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
  }), [achievements.length, activeMythicCandidate, ageLabel, allNarratives.length, characterName, charisma, dimensions, featuredAchievement, lifeRunId, mind, moralityLabel, overallScore, physique, talentAptitude, worldName])
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
  }), [achievements, characterAge, characterName, effectiveEndingReview, isDead, lifeRunId, moralityLabel, narrativeHistory, overallScore, regularPatterns, scoreResult, scoringAudit, scoringProfile, sealedMythicPattern, worldName])

  const mythicLifeDigests = useMemo(() => (
    compressedSummaries.summaries
      .slice()
      .sort((a, b) => a.startRound - b.startRound)
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
    attributes: { physique, mind, talentAptitude, charisma },
    morality: {
      value: morality.value,
      level: morality.level,
      label: moralityLabel,
    },
    endingScore: scoreResult,
    achievements,
    regularPatterns: regularPatterns.map((pattern) => ({ name: pattern.name, effect: pattern.effect })),
  }), [achievements, characterAge, charisma, isDead, mind, morality.level, morality.value, moralityLabel, narrativeHistory.length, physique, regularPatterns, scoreResult, talentAptitude])

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
  }, [characterAge, characterName, lifeSummary, mythicCandidates.length, mythicFinalState, mythicLibrary, mythicLifeDigests, mythicLifeRecords, overallScore, reincarnationStrength, regularPatterns, setMythicCandidates, worldConfig, worldName])

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
  }, [activeMythicCandidate, addMythicPattern, characterAge, characterName, lifeRunId, sealedMythicPatternId, setSealedMythicPatternId, worldName])

  const handleShareLife = useCallback(async () => {
    if (shareBusy) return
    setShareBusy('share')
    setShareStatus('正在生成此生分享卡…')
    try {
      const outcome = await shareGameOverLife({
        ...shareCardData,
        shareUrl: window.location.origin,
      })
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
      await saveGameOverShareCard({
        ...shareCardData,
        shareUrl: window.location.origin,
      })
      setShareStatus('人生分享卡已保存为 PNG。')
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : '分享卡保存失败，请稍后重试。')
    } finally {
      setShareBusy(null)
    }
  }, [shareBusy, shareCardData])

  const handleStartNewLife = useCallback(async () => {
    if (preGenStatus.isActive || startingNewLifeRef.current) return
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
  }, [confirmingNewLife, mythicCandidates.length, preGenStatus.isActive, router, sealedMythicPatternId])

  const handleFooterBack = useCallback(() => {
    if (confirmingNewLife) {
      setConfirmingNewLife(false)
      return
    }
    router.push('/welcome')
  }, [confirmingNewLife, router])

  const handleViewSimulationData = useCallback(() => {
    const target = document.getElementById('dimensions-title')
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (!canViewGameOver && !leavingForNewLifeRef.current) {
      router.replace(narrativeHistory.length > 0 ? '/game-story' : '/welcome')
    }
  }, [canViewGameOver, narrativeHistory.length, router])

  useEffect(() => {
    if (!canViewGameOver || endingReviewRequestedRef.current === lifeRunId) return
    endingReviewRequestedRef.current = lifeRunId
    let active = true
    queueMicrotask(() => {
      if (!active) return
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
  }, [achievements, canViewGameOver, characterAge, characterName, isDead, lifeRunId, localEndingReview, narrativeHistory.length, overallScore, scoreResult.dimensions, worldName])

  useEffect(() => {
    if (!canViewGameOver || mythicCandidates.length === 3 || sealedMythicPatternId) return
    const timer = window.setTimeout(() => { void handleGenerateMythics() }, 0)
    return () => {
      window.clearTimeout(timer)
      mythicAbortRef.current?.abort()
    }
  }, [canViewGameOver, handleGenerateMythics, mythicCandidates.length, sealedMythicPatternId])

  useEffect(() => {
    if (!canViewGameOver) return
    queueMicrotask(() => {
      try {
        upsertLifeRecord(cloudLifeRecord)
      } catch (error) {
        setShareStatus(error instanceof Error ? error.message : '战绩保存失败')
      }
    })
  }, [canViewGameOver, cloudLifeRecord, upsertLifeRecord])

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
  }, [canViewGameOver, cloudLifeRecord.recordId, effectiveEndingReview.review, effectiveEndingReview.source, endingReviewReady, overallScore, scoreResult.integrity.passed, scoreResult.integrity.perfectGatePassed])

  if (!canViewGameOver) {
    return null
  }

  return (
    <div className="final-flow-frame">
      <div className="final-flow-design-fit final-flow-design-fit--330">
        <div className="final-flow-design-canvas">
          <PageScroll maxWidth={330} className={`${styles.page} final-flow-page-surface`}>
          <div className={styles.wrapper}>
        <article className={styles.book} aria-labelledby="game-over-title">
          <div className={styles.ornament} aria-hidden="true" />

          <header className={styles.header}>
            <div className={styles.metaRow}>
              <span>AI LIFE SIM · 命书</span>
              <span>终章 · {roundLabel}</span>
            </div>
            <div className={styles.titleRow}>
              <div>
                <h1 id="game-over-title" className={styles.headerTitle}>一生回望</h1>
                <p className={styles.headerCopy}>看清这一生留下的力量、选择与回声。</p>
              </div>
              <div className={styles.titleSeal} aria-hidden="true"><span>终</span></div>
            </div>
            <div className={styles.divider} aria-hidden="true"><span /></div>
          </header>

          <section className={styles.identity} aria-label="角色人生概览">
            <div className={styles.identitySeal} aria-hidden="true">{sealCharacter}</div>
            <div className={styles.identityCopy}>
              <h2>{characterName || '无名之辈'}</h2>
              <p>{worldName} · {ageLabel} · {allNarratives.length} 轮世事</p>
            </div>
            <div className={styles.score}>
              <strong>{overallScore}</strong>
              <span>人生评分</span>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="dimensions-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionIndex}>01</span>
                <h2 id="dimensions-title">世界维度</h2>
              </div>
              <p>点击维度查看本地评分依据</p>
            </div>
            <div className={styles.radarSection}>
              <GameOverRadar
                dimensions={dimensions}
                activeIndex={activeDimensionIndex}
                overallScore={overallScore}
                onSelect={setActiveDimensionIndex}
              />
            </div>
            <p className={styles.metricComment} aria-live="polite">
              <span><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">{GAME_OVER_DIMENSION_ICONS[activeDimension.label] ?? '◇'}</span>{activeDimension.label}</span>
              <strong>{activeDimension.comment}</strong>
            </p>
          </section>

          <section className={styles.section} aria-labelledby="records-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionIndex}>02</span>
                <h2 id="records-title">人生三记</h2>
              </div>
              <p>从现有叙事历史取样，不新增剧情判断</p>
            </div>
            {lifeRecords.length > 0 ? (
              <div className={styles.recordList}>
                {lifeRecords.map((record) => (
                  <article key={record.id} className={styles.record}>
                    <div className={styles.recordMeta}>
                      <strong>{record.stage}</strong>
                      <span>{record.timeLabel}{record.ageLabel ? ` · ${record.ageLabel}` : ''}</span>
                    </div>
                    <p title={record.text}>{record.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>此生尚无可展示的叙事记录。</p>
            )}

            <div className={styles.summaryBlock}>
              <span>此生评语</span>
              <p>{lifeSummary}</p>
              <div className={styles.summaryMeta}>
                <span>{moralityLabel}</span>
                <span>{allNarratives.length} 轮世事</span>
                <span>{ageLabel}</span>
                {worldviewId !== null && worldviewId !== undefined ? <span>世界编号 {worldviewId}</span> : null}
              </div>
              <div className={styles.repetitionSummary} aria-label="故事重复率统计">
                <span>故事重复观测</span>
                <strong>近五轮均值 {Math.round(storyRepetitionStats.recentAverageWordRepeatRate * 100)}%</strong>
                <span>整局峰值 {Math.round(storyRepetitionStats.maxWordRepeatRate * 100)}%</span>
                <span>高重复 {storyRepetitionStats.highRepeatRounds} 轮 · {storyRepetitionStats.trend === 'rising' ? '近期上升' : storyRepetitionStats.trend === 'falling' ? '近期下降' : '近期平稳'}</span>
              </div>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="achievements-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionIndex}>03</span>
                <h2 id="achievements-title">此生大事</h2>
              </div>
              <p>{achievements.length} 项真实里程碑</p>
            </div>
            {achievements.length > 0 ? (
              <div className={styles.achievementList}>
                {achievements.map((achievement) => (
                  <article key={achievement.id} className={styles.achievement}>
                    <span aria-hidden="true">{achievement.kind === 'breakthrough' ? '破' : '择'}</span>
                    <div>
                      <div className={styles.achievementMeta}>
                        <small>{achievement.timeLabel}</small>
                        <small>{achievement.kind === 'breakthrough' ? '生命突破' : '命运抉择'}</small>
                      </div>
                      <h3>{achievement.title}</h3>
                      <p>{achievement.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className={styles.emptyState}>此生没有已确认的分支选择或生命突破记录。</p>}
          </section>

          <section className={`${styles.section} ${styles.mythicSection}`} aria-labelledby="mythic-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionIndex}>04</span>
                <h2 id="mythic-title">轮回天赋</h2>
              </div>
              <span className={styles.mythicBadge}>{overallScore} 分 · {reincarnationStrength.label}</span>
            </div>
            <p className={styles.mythicIntro}>系统先按完整人生评分，再由 AI 凝结三项匹配强度的跨世界概念规则。选择一项封存，供后来的人生携带。</p>

            {mythicCandidates.length === 3 ? (
              <>
                <div className={styles.mythicSelectors} role="list" aria-label="轮回天赋候选">
                  {mythicCandidates.map((candidate, index) => (
                    <button
                      type="button"
                      key={`${candidate.name}-${candidate.concept}`}
                      className={`${styles.mythicSelector} ${!sealedOutsideCurrentCandidates && effectiveMythicIndex === index ? styles.mythicSelectorActive : ''}`}
                      aria-pressed={!sealedOutsideCurrentCandidates && effectiveMythicIndex === index}
                      onClick={() => { if (!sealedMythicPatternId) setActiveMythicIndex(index) }}
                      disabled={Boolean(sealedOutsideCurrentCandidates || (sealedMythicPatternId && effectiveMythicIndex !== index))}
                    >
                      <span aria-hidden="true">{candidate.concept.slice(0, 1)}</span>
                      <strong>{candidate.name}</strong>
                    </button>
                  ))}
                </div>

                {activeMythicCandidate ? (
                  <div className={styles.mythicFocus} aria-live="polite">
                    <span className={styles.mythicGlyph} aria-hidden="true">{activeMythicCandidate.concept.slice(0, 1)}</span>
                    <div>
                      <small>{activeMythicCandidate.concept} · 纯概念</small>
                      <h3>{activeMythicCandidate.name}</h3>
                      <p>{activeMythicCandidate.effect}</p>
                    </div>
                  </div>
                ) : null}

                <div className={styles.mythicCurrent}>
                  <span>{sealedMythicPattern ? '已封存' : '当前选择'}</span>
                  <strong>{sealedMythicPattern?.name ?? activeMythicCandidate?.name ?? '尚未选择'}</strong>
                </div>
                <button
                  type="button"
                  className={styles.mythicStore}
                  onClick={handleSealMythic}
                  disabled={!activeMythicCandidate || Boolean(sealedMythicPatternId)}
                >
                  <span>{sealedMythicPattern ? '已封存至轮回天赋库' : '封存至轮回天赋库'}</span>
                  <small>{sealedMythicPattern ? '下一局可在独立轮回槽携带' : '封存后不可在本局改选'}</small>
                </button>
              </>
            ) : (
              <div className={styles.mythicLoadingCard} aria-live="polite">
                <span className={styles.mythicLoadingGlyph} aria-hidden="true">转</span>
                <div>
                  <h3>{mythicGenerating ? '正在凝结轮回天赋' : '尚未生成轮回天赋'}</h3>
                  <p>{mythicGenerating ? '正在读取整局摘要与关键人生记录，请稍候。' : '生成失败时不会使用本地词条冒充 AI 结果。'}</p>
                </div>
              </div>
            )}

            {mythicError ? <p className={styles.mythicError} role="alert">{mythicError}</p> : null}
            {mythicCandidates.length !== 3 && !mythicGenerating ? (
              <button type="button" className={styles.mythicRetry} onClick={() => void handleGenerateMythics()}>
                重新生成三项轮回天赋
              </button>
            ) : null}
          </section>

          <section className={`${styles.section} ${styles.shareSection}`} aria-labelledby="share-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionIndex}>05</span>
                <h2 id="share-title">留下此生</h2>
              </div>
              <span className={styles.shareBadge}>仅使用真实结算事实</span>
            </div>
            <p className={styles.shareIntro}>把这一生的年岁、轮数、大事、四维与轮回天赋生成分享卡。图片只在当前设备绘制，不上传故事正文或模型配置。</p>

            <div className={styles.sharePreview} aria-label="人生分享卡预览">
              <div className={styles.sharePreviewMeta}>
                <span>AI LIFE SIM · 人生档案</span>
                <span>终章 · {roundLabel}</span>
              </div>
              <div className={styles.sharePreviewHero}>
                <div>
                  <small>{worldName}</small>
                  <h3>{characterName || '无名之辈'}</h3>
                  <p>{ageLabel} · {allNarratives.length} 轮世事 · {moralityLabel}</p>
                </div>
                <div className={styles.sharePreviewScore}>
                  <strong>{overallScore}</strong>
                  <span>人生评分</span>
                </div>
              </div>

              <div className={styles.shareFactGrid}>
                {shareFacts.map((fact) => (
                  <div key={fact.label} className={styles.shareFact}>
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                  </div>
                ))}
              </div>

              <div className={styles.sharePreviewMythic}>
                <span>{activeMythicCandidate ? `${activeMythicCandidate.concept} · 轮回天赋` : '人生回声'}</span>
                <strong>{activeMythicCandidate?.name ?? '此生已经留下回声'}</strong>
                <p>{activeMythicCandidate?.effect ?? '轮回天赋尚未凝结时，分享卡仍会忠实记录当前结算事实。'}</p>
              </div>
            </div>

            <div className={styles.shareActions}>
              <button
                type="button"
                className={styles.sharePrimary}
                onClick={() => void handleShareLife()}
                disabled={shareBusy !== null}
                aria-busy={shareBusy === 'share'}
              >
                <span>{shareBusy === 'share' ? '正在生成分享卡' : '一键分享人生卡'}</span>
                <small>支持时唤起系统分享，否则自动保存 PNG</small>
              </button>
              <button
                type="button"
                className={styles.shareSecondary}
                onClick={() => void handleSaveShareCard()}
                disabled={shareBusy !== null}
                aria-busy={shareBusy === 'save'}
              >
                {shareBusy === 'save' ? '生成中…' : '保存 PNG'}
              </button>
            </div>
            <p className={styles.shareStatus} role="status" aria-live="polite">
              {shareStatus || '分享卡内容会随当前轮回天赋选择即时更新。'}
            </p>
          </section>
        </article>
          </div>
          </PageScroll>

          <footer className={styles.footer} aria-live="polite" data-flow-bottom-bar>
            <div className={styles.footerBar}>
              <button
                type="button"
                className={styles.barTool}
                onClick={handleFooterBack}
                aria-label={confirmingNewLife ? '取消开启新人生' : '返回首页'}
                title={confirmingNewLife ? '取消开启新人生' : '返回首页'}
              >
                {confirmingNewLife ? (
                  <span aria-hidden="true">×</span>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m4 11 8-7 8 7" />
                    <path d="M6 10v10h12V10M10 20v-6h4v6" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className={styles.barTool}
                onClick={handleViewSimulationData}
                aria-label="查看模拟数据"
                title="查看模拟数据"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 20V10M12 20V4M19 20v-7" />
                  <path d="M3 20h18" />
                </svg>
              </button>
              <button
                type="button"
                className={`${styles.newLifeButton} ${confirmingNewLife ? styles.newLifeButtonConfirm : ''}`}
                disabled={preGenStatus.isActive || startingNewLife || !sealedMythicPatternId}
                onClick={handleStartNewLife}
                aria-describedby={confirmingNewLife ? 'new-life-confirmation-copy' : undefined}
              >
                <span className={styles.newLifeMark}>{confirmingNewLife ? '警' : '新'}</span>
                <span className={styles.newLifeCopy}>
                  <strong>{confirmingNewLife ? '确认开启新人生' : '开始新人生'}</strong>
                  <small id={confirmingNewLife ? 'new-life-confirmation-copy' : undefined}>
                    {preGenStatus.isActive
                      ? '正在收束后台故事状态，请稍候'
                      : startingNewLife
                      ? '正在清理当前人生并返回世界选择'
                      : !sealedMythicPatternId
                      ? '先封存一项轮回天赋'
                      : confirmingNewLife
                      ? '将清理当前人生状态，此操作不可撤销'
                      : '完成回望 · 重新选择世界'}
                  </small>
                </span>
                <span className={styles.newLifeArrow} aria-hidden="true">{confirmingNewLife ? '✓' : '→'}</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
