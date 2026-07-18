/**
 * @file page.tsx
 * @description 游戏结束页面 —— 四维评分雷达图 + 人生总结 + 神话词条封存
 * @mod mod-pages
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  useCharacterStore,
  useMythicLibraryStore,
} from '@/mods/mod-character'
import { generateMythicPatternCandidates } from '@/mods/mod-character/mythic-pattern-access'
import { useWorldStore } from '@/mods/mod-world'
import { useEngineStore, usePreGenQueueStatus } from '@/mods/mod-engine'
import { useSettingsStore } from '@/mods/mod-settings'

import { callAI, useGlobalStore } from '@/core'
// 统一使用 shared/ 的 clamp 替代内联 Math.max/Math.min
import { clamp } from '@/core/shared'

import { PageScroll } from '@/mods/mod-ui'

import type { RadarDimension } from '@/mods/mod-ui'
import type { AIModelConfig } from '@/foundation'

import styles from './GameOver.module.css'
import { GameOverRadar } from './GameOverRadar'
import { resetForNewLife } from './reset-new-life'

// ============================================================
// 人生总结生成
// ============================================================

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

/** 只基于结构化状态与记录数量生成摘要，不从自由叙事猜测成就、境界或死因。 */
function generateLifeSummary(
  name: string,
  age: number,
  worldName: string,
  moralityLevel: string,
  narrativeCount: number,
  isDead: boolean,
): string {
  const moralityText = formatMorality(moralityLevel)
  const ending = isDead
    ? `生命记录在 ${age} 岁结束；死因与尾声仅以结构化结算数据为准。`
    : `本卷在 ${age} 岁结束，未对未记录的结局作额外推断。`
  return `${name || '无名之辈'}在${worldName}留下了 ${narrativeCount} 段人生记录，当前品性档位为${moralityText}。${ending}`
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

function buildLifeRunId(parts: readonly (string | number)[]): string {
  const value = parts.join('\u0000')
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `life-${(hash >>> 0).toString(36)}`
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
  const regularPatterns = useCharacterStore((s) => s.destinyPatterns.patterns)
  const mythicCandidates = useCharacterStore((s) => s.mythicCandidates)
  const sealedMythicPatternId = useCharacterStore((s) => s.sealedMythicPatternId)
  const setMythicCandidates = useCharacterStore((s) => s.setMythicCandidates)
  const setSealedMythicPatternId = useCharacterStore((s) => s.setSealedMythicPatternId)
  const mythicLibrary = useMythicLibraryStore((s) => s.patterns)
  const addMythicPattern = useMythicLibraryStore((s) => s.addPattern)
  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const worldviewId = useGlobalStore((s) => s.worldviewId)
  const narrativeHistory = useEngineStore((s) => s.narrativeHistory)
  const compressedSummaries = useEngineStore((s) => s.compressedSummaries)
  const status = useEngineStore((s) => s.status)
  const preGenStatus = usePreGenQueueStatus()
  const isDead = useCharacterStore((s) => s.health.isDead)
  const [activeDimensionIndex, setActiveDimensionIndex] = useState(0)
  const [confirmingNewLife, setConfirmingNewLife] = useState(false)
  const [activeMythicIndex, setActiveMythicIndex] = useState(0)
  const [mythicGenerating, setMythicGenerating] = useState(false)
  const [mythicError, setMythicError] = useState('')
  const [startingNewLife, setStartingNewLife] = useState(false)
  const leavingForNewLifeRef = useRef(false)
  const startingNewLifeRef = useRef(false)
  const mythicAbortRef = useRef<AbortController | null>(null)

  const canViewGameOver = status === 'complete' || isDead

  const allNarratives = useMemo(
    () => narrativeHistory.map((narrative) => narrative.text),
    [narrativeHistory],
  )

  const dimensions = useMemo<RadarDimension[]>(() => {
    const toScore = (value: number) => clamp(Math.round((value / 20) * 100), 0, 100)
    const comment = (score: number) => score >= 80 ? '卓越' : score >= 60 ? '出众' : score >= 40 ? '稳健' : score >= 20 ? '尚待成长' : '起点微弱'

    const physiqueScore = toScore(physique)
    const mindScore = toScore(mind)
    const talentScore = toScore(talentAptitude)
    const charismaScore = toScore(charisma)
    return [
      {
        label: '体魄',
        value: physiqueScore,
        comment: comment(physiqueScore),
      },
      {
        label: '心智',
        value: mindScore,
        comment: comment(mindScore),
      },
      {
        label: '悟性',
        value: talentScore,
        comment: comment(talentScore),
      },
      {
        label: '魅力',
        value: charismaScore,
        comment: comment(charismaScore),
      },
    ]
  }, [
    charisma,
    mind,
    physique,
    talentAptitude,
  ])

  const overallScore = useMemo(
    () => Math.round(dimensions.reduce((sum, dimension) => sum + dimension.value, 0) / dimensions.length),
    [dimensions],
  )
  const lifeSummary = useMemo(
    () => generateLifeSummary(
      characterName,
      characterAge,
      worldConfig?.name ?? '未知世界',
      morality.level,
      allNarratives.length,
      isDead,
    ),
    [allNarratives.length, characterAge, characterName, isDead, morality.level, worldConfig?.name],
  )
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
  const worldName = worldConfig?.name ?? '未知世界'
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
  const lifeRunId = useMemo(() => buildLifeRunId([
    worldCode,
    worldName,
    characterName,
    characterAge,
    narrativeHistory.length,
    narrativeHistory[0]?.timestamp ?? 0,
    narrativeHistory[narrativeHistory.length - 1]?.timestamp ?? 0,
  ]), [characterAge, characterName, narrativeHistory, worldCode, worldName])

  const mythicLifeDigests = useMemo(() => (
    compressedSummaries.summaries
      .slice()
      .sort((a, b) => a.startRound - b.startRound)
      .map((item) => ({ startRound: item.startRound, endRound: item.endRound, summary: item.content }))
  ), [compressedSummaries.summaries])

  const mythicLifeRecords = useMemo(() => {
    if (narrativeHistory.length <= 18) {
      return narrativeHistory.map((entry, index) => (
        `${entry.displayTimeLabel ?? `第${index + 1}轮`}：${entry.text}`
      ))
    }
    const sampleIndexes = Array.from({ length: 12 }, (_, index) => (
      Math.round(index * (narrativeHistory.length - 1) / 11)
    ))
    const sampled = Array.from(new Set(sampleIndexes)).map((index) => {
      const entry = narrativeHistory[index]
      return `${entry.displayTimeLabel ?? `第${index + 1}轮`}：${entry.text}`
    })
    return sampled
  }, [narrativeHistory])

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
    regularPatterns: regularPatterns.map((pattern) => ({ name: pattern.name, effect: pattern.effect })),
  }), [characterAge, charisma, isDead, mind, morality.level, morality.value, moralityLabel, narrativeHistory.length, physique, regularPatterns, talentAptitude])

  const handleGenerateMythics = useCallback(async () => {
    if (mythicCandidates.length === 3 || mythicAbortRef.current) return
    const controller = new AbortController()
    mythicAbortRef.current = controller
    setMythicGenerating(true)
    setMythicError('')

    try {
      const { provider, customKey, customUrl, customModel } = useSettingsStore.getState()
      const model = customModel || 'deepseek-v4-flash'
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
        setMythicError(error instanceof Error ? error.message : '神话词条生成失败，请重试')
      }
    } finally {
      if (mythicAbortRef.current === controller) mythicAbortRef.current = null
      if (!controller.signal.aborted) setMythicGenerating(false)
    }
  }, [characterAge, characterName, lifeSummary, mythicCandidates.length, mythicFinalState, mythicLibrary, mythicLifeDigests, mythicLifeRecords, regularPatterns, setMythicCandidates, worldConfig, worldName])

  const handleSealMythic = useCallback(() => {
    if (!activeMythicCandidate || sealedMythicPatternId) return
    const sealed = addMythicPattern(activeMythicCandidate, {
      worldName,
      characterName: characterName || '无名之辈',
      finalAge: characterAge,
      runId: lifeRunId,
    })
    setSealedMythicPatternId(sealed.id)
    setMythicError('')
  }, [activeMythicCandidate, addMythicPattern, characterAge, characterName, lifeRunId, sealedMythicPatternId, setSealedMythicPatternId, worldName])

  const handleStartNewLife = useCallback(async () => {
    if (preGenStatus.isActive || startingNewLifeRef.current) return
    if (!sealedMythicPatternId) {
      setMythicError(mythicCandidates.length === 3
        ? '请先从三个神话词条中选择一项并封存。'
        : '请先完成人生神话词条的生成与封存。')
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
    router.push('/game-story')
  }, [confirmingNewLife, router])

  useEffect(() => {
    if (!canViewGameOver && !leavingForNewLifeRef.current) {
      router.replace(narrativeHistory.length > 0 ? '/game-story' : '/welcome')
    }
  }, [canViewGameOver, narrativeHistory.length, router])

  useEffect(() => {
    if (!canViewGameOver || mythicCandidates.length === 3 || sealedMythicPatternId) return
    const timer = window.setTimeout(() => { void handleGenerateMythics() }, 0)
    return () => {
      window.clearTimeout(timer)
      mythicAbortRef.current?.abort()
    }
  }, [canViewGameOver, handleGenerateMythics, mythicCandidates.length, sealedMythicPatternId])

  if (!canViewGameOver) {
    return null
  }

  return (
    <PageScroll maxWidth={672} className={styles.page}>
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
              <span>四维均分</span>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="dimensions-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionIndex}>01</span>
                <h2 id="dimensions-title">真实四维</h2>
              </div>
              <p>点击属性查看此生评语</p>
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
              <span>{activeDimension.label}</span>
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
              <span>此生摘要</span>
              <p>{lifeSummary}</p>
              <div className={styles.summaryMeta}>
                <span>{moralityLabel}</span>
                <span>{allNarratives.length} 轮世事</span>
                <span>{ageLabel}</span>
                {worldviewId !== null && worldviewId !== undefined ? <span>世界编号 {worldviewId}</span> : null}
              </div>
            </div>
          </section>

          <section className={`${styles.section} ${styles.mythicSection}`} aria-labelledby="mythic-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionIndex}>03</span>
                <h2 id="mythic-title">命格余响</h2>
              </div>
              <span className={styles.mythicBadge}>三选一 · 此生唯一封印</span>
            </div>
            <p className={styles.mythicIntro}>AI 从完整人生档案中凝结三项纯概念规则。选择一项封存到跨局总库，供后来的人生携带。</p>

            {mythicCandidates.length === 3 ? (
              <>
                <div className={styles.mythicSelectors} role="list" aria-label="神话词条候选">
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
                  <span>{sealedMythicPattern ? '已封存至神话总库' : '封存至神话总库'}</span>
                  <small>{sealedMythicPattern ? '下一局可在独立神话槽携带' : '封存后不可在本局改选'}</small>
                </button>
              </>
            ) : (
              <div className={styles.mythicLoadingCard} aria-live="polite">
                <span className={styles.mythicLoadingGlyph} aria-hidden="true">神</span>
                <div>
                  <h3>{mythicGenerating ? '正在凝结此生神话' : '尚未生成神话词条'}</h3>
                  <p>{mythicGenerating ? '正在读取整局摘要与关键人生记录，请稍候。' : '生成失败时不会使用本地词条冒充 AI 结果。'}</p>
                </div>
              </div>
            )}

            {mythicError ? <p className={styles.mythicError} role="alert">{mythicError}</p> : null}
            {mythicCandidates.length !== 3 && !mythicGenerating ? (
              <button type="button" className={styles.mythicRetry} onClick={() => void handleGenerateMythics()}>
                重新生成三项神话词条
              </button>
            ) : null}
          </section>

          <footer className={styles.footer} aria-live="polite">
            <button
              type="button"
              className={styles.backButton}
              onClick={handleFooterBack}
              aria-label={confirmingNewLife ? '取消开启新人生' : '返回故事记录'}
              title={confirmingNewLife ? '取消开启新人生' : '返回故事记录'}
            >
              {confirmingNewLife ? '×' : '←'}
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
                <strong>{confirmingNewLife ? '确认开启新人生' : '开启新人生'}</strong>
                <small id={confirmingNewLife ? 'new-life-confirmation-copy' : undefined}>
                  {preGenStatus.isActive
                    ? '正在收束后台故事状态，请稍候'
                    : startingNewLife
                    ? '正在清理当前人生并返回世界选择'
                    : !sealedMythicPatternId
                    ? '先在命格余响中封存一项神话词条'
                    : confirmingNewLife
                    ? '将清理当前人生状态，此操作不可撤销'
                    : '清理当前人生状态 · 返回世界选择'}
                </small>
              </span>
              <span className={styles.newLifeArrow} aria-hidden="true">{confirmingNewLife ? '✓' : '→'}</span>
            </button>
          </footer>
        </article>
      </div>
    </PageScroll>
  )
}
