'use client'

/**
 * @module game-page
 * @description 游戏模拟页 —— 对齐废弃项目：顶栏信息+控制，下方叙事区，隐藏式推进
 * @mod mod-pages
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'

import { useRouter } from 'next/navigation'
import { clamp } from '@/core/shared'
import { ENGINE_VERSION } from '@/core/version'
import { useAccountClientStore } from '@/core/account/account-client-store'
import {
  fetchCloudManualSaveSummary,
  fetchLegendaryEncounter,
  putCloudManualSave,
} from '@/core/player-content/player-content-client'
import { CloudGameSavePayloadSchema, type CloudManualSaveSummary } from '@/core/player-content/player-content-contract'

import { useEngine, useNarrative, usePreGenQueueStatus, useSimulationAdvance } from '@/mods/mod-engine'
import {
  AVAILABLE_TIME_STEPS,
  encodeTimeStepKey,
  formatCurrentNarrativeTimeLabel,
  collectManualGameSavePayload,
  saveCurrentGameToSlot,
  setSimulationTimeStepByKey,
} from '@/mods/mod-engine/engine-api'
import { useEngineStore } from '@/mods/mod-engine'
import {
  useCharacterStore,
  ATTRIBUTE_NAMES,
  ATTR_KEYS,
  RACE_LIFESPAN,
} from '@/mods/mod-character'
import { resolveDestinyPatternWorldTags } from '@/mods/mod-character/destiny-pattern-access'
import { useWorldStore } from '@/mods/mod-world'
import {
  NarrativeTimeline,
  type NarrativeEntry,
  ToastContainer,
  useToastStore,
  SaveDialog,
} from '@/mods/mod-ui'

import styles from './GameStory.module.css'
import { resolveWorldDimensionLabels } from '../../helpers/world-dimension-labels'
import { getAutoNarrativeRetryDelay } from './narrative-retry-policy'

const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' }

function stripLeadingNarrativeProtocolMarker(text: string): string {
  return text.replace(/^⟦正文⟧(?:\r?\n)+/u, '')
}

import { useSimulationBranch } from './useSimulationBranch'

interface TagSection {
  name: string
  tags: { key: string; value: string }[]
}

function parseWorldTagsToSections(text: string): TagSection[] {
  const sections: TagSection[] = []
  const lines = text.split('\n')
  let currentSection: TagSection | null = null

  for (const line of lines) {
    const sectionMatch = /^【(.+)】/.exec(line.trim())
    if (sectionMatch) {
      if (currentSection && currentSection.tags.length > 0) sections.push(currentSection)
      currentSection = { name: sectionMatch[1], tags: [] }
      continue
    }
    if (currentSection) {
      const pairs = line.trim().split('|')
      for (const pair of pairs) {
        const kv = pair.split('：')
        if (kv.length >= 2) {
          const key = kv[0].trim()
          const value = kv.slice(1).join('：').trim()
          if (key && value) currentSection.tags.push({ key, value })
        }
      }
    }
  }
  if (currentSection && currentSection.tags.length > 0) sections.push(currentSection)
  return sections
}

export default function GamePage() {
  const router = useRouter()
  const { status, round, totalRounds, seasonName, stop } = useEngine()
  const {
    advanceRound,
    isAdvancing,
    isRuntimeReady,
    runtimeReadiness,
  } = useSimulationAdvance()
  const runtimeIncomplete = runtimeReadiness.loaderReady
    && runtimeReadiness.missingSubsystems.length > 0
  const runtimeBlockedText = runtimeIncomplete
    ? '核心系统加载不完整'
    : '核心系统初始化中'

  const {
    hasUnresolvedBranch,
    unresolvedBranchIndex,
    branchTitle,
    branchOptions,
    forceBranchNext,
    handleForceBranch,
    handleBranchConfirm,
    handleBranchCancel,
    branchCustomText,
    setBranchCustomText,
    selectedBranchOptionId,
    setSelectedBranchOptionId,
  } = useSimulationBranch({ advanceRound })

  const addToast = useToastStore((s) => s.addToast)

  const handleBranchConfirmWithFeedback = useCallback(async () => {
    const result = await handleBranchConfirm()
    if (!result.ok && result.error) {
      addToast('warning', result.error)
    }
  }, [handleBranchConfirm, addToast])

  const { narrativeHistory } = useNarrative()
  const storyRepetitionStats = useEngineStore((s) => s.storyRepetitionStats)
  const recentRepetitionMetrics = narrativeHistory
    .flatMap((entry) => entry.repetitionMetric ? [entry.repetitionMetric] : [])
    .slice(-5)
  const streamingNarrative = useEngineStore((s) => s.streamingNarrative)
  const narrativeError = useEngineStore((s) => s.narrativeError)
  const branchRepairPending = useEngineStore((s) => s.branchRepairPending)
  const lifeRunId = useEngineStore((s) => s.lifeRunId)
  const legendaryEncounterCheckedForLifeRunId = useEngineStore((s) => s.legendaryEncounterCheckedForLifeRunId)
  const setLegendaryEncounterSelection = useEngineStore((s) => s.setLegendaryEncounterSelection)
  const timeStep = useEngineStore((s) => s.timeStep)
  const preGenStatus = usePreGenQueueStatus()
  const activeTimeStepKey = encodeTimeStepKey(timeStep)
  const [autoRetryAttempt, setAutoRetryAttempt] = useState(0)
  const autoRetryGenerationRef = useRef(0)
  const [showStepMenu, setShowStepMenu] = useState(false)
  const stepMenuRef = useRef<HTMLDivElement>(null)
  const stepButtonRef = useRef<HTMLButtonElement>(null)
  const handleTimeStepChange = useCallback((key: string) => {
    setSimulationTimeStepByKey(key)
    setShowStepMenu(false)
  }, [])
  const timeStepOptions = useMemo(
    () => AVAILABLE_TIME_STEPS.map((s) => ({
      label: s.label,
      value: encodeTimeStepKey(s),
      icon: s.icon,
      experimental: s.experimental,
    })),
    [],
  )
  const health = useCharacterStore((s) => s.health)
  const characterName = useCharacterStore((s) => s.name)
  const characterAge = useCharacterStore((s) => s.age)
  const gender = useCharacterStore((s) => s.gender)
  const race = useCharacterStore((s) => s.race)
  const characterBase = useCharacterStore((s) => s.characterBase)
  const destinyPatterns = useCharacterStore((s) => s.destinyPatterns.patterns)
  const equippedMythicPatterns = useCharacterStore((s) => s.equippedMythicPatterns)
  const talents = useCharacterStore((s) => s.talents)
  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const worldTags = useWorldStore((s) => s.worldTags)
  const eraStartYear = useWorldStore((s) => s.eraStartYear)
  const worldEraName = useWorldStore((s) => s.eraName)

  const [showWorldPanel, setShowWorldPanel] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [cloudSave, setCloudSave] = useState<CloudManualSaveSummary | null>(null)
  const [cloudLoading, setCloudLoading] = useState(false)
  const accountStatus = useAccountClientStore((state) => state.status)
  const narrativeEndRef = useRef<HTMLDivElement>(null)
  const prevEventsLenRef = useRef(0)
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  useEffect(() => {
    let active = true
    if (accountStatus !== 'authenticated') {
      queueMicrotask(() => {
        if (!active) return
        setCloudSave(null)
        setCloudLoading(false)
      })
      return () => { active = false }
    }
    queueMicrotask(() => { if (active) setCloudLoading(true) })
    void fetchCloudManualSaveSummary()
      .then((summary) => { if (active) setCloudSave(summary) })
      .catch((error) => {
        if (active) addToast('warning', error instanceof Error ? error.message : '云端栏位读取失败')
      })
      .finally(() => { if (active) setCloudLoading(false) })
    return () => { active = false }
  }, [accountStatus, addToast])

  useEffect(() => {
    if (!lifeRunId || legendaryEncounterCheckedForLifeRunId === lifeRunId) return
    let active = true
    void fetchLegendaryEncounter(lifeRunId)
      .then((encounter) => {
        if (active) setLegendaryEncounterSelection(lifeRunId, encounter)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [legendaryEncounterCheckedForLifeRunId, lifeRunId, setLegendaryEncounterSelection])

  // 整个书页正文是唯一滚动根；新叙事只在这条连续阅读流内定位。
  useEffect(() => {
    const container = narrativeEndRef.current
    if (!container) return
    if (narrativeHistory.length > prevEventsLenRef.current) {
      const newEventIdx = narrativeHistory.length - 1
      const separatorEl = container.querySelector(`[data-separator-for="${newEventIdx}"]`)
      if (separatorEl) {
        const targetScroll = separatorEl.getBoundingClientRect().top
          - container.getBoundingClientRect().top
          + container.scrollTop
          - 12
        container.scrollTo({ top: clamp(targetScroll, 0, Infinity), behavior: 'smooth' })
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      }
    }
    prevEventsLenRef.current = narrativeHistory.length
  }, [narrativeHistory.length, streamingNarrative])

  const isComplete = status === 'complete'
  const isDead = health.isDead

  const genderLabel = GENDER_LABELS[gender] ?? gender
  const raceInfo = RACE_LIFESPAN[race] ?? { name: race, baseMaxAge: 100, decayMultiplier: 1 }

  const patternBonus = useMemo(() => {
    const bonus: Record<string, number> = {}
    for (const k of ATTR_KEYS) bonus[k] = 0
    for (const p of destinyPatterns ?? []) {
      if (!p.attrBonus) continue
      for (const [key, val] of Object.entries(p.attrBonus)) {
        if (typeof val === 'number' && key in bonus) bonus[key] += val
      }
    }
    for (const t of talents) {
      for (const [key, val] of Object.entries(t.attrBonus)) {
        if (typeof val === 'number' && key in bonus) bonus[key] += val
      }
    }
    return bonus
  }, [destinyPatterns, talents])

  const displayBaseAttrs = useMemo(() => {
    const base = characterBase?.current ?? characterBase?.base
    // 创建完成但尚未执行首轮时，Store.current 仍是玩家分配的基础值，
    // 因此需要临时叠加命格预览值。首轮同步后 current 已由
    // CharacterBaseSystem 聚合 modifiers，继续叠加会把命格计算两次。
    const includeCreationPatternBonus = totalRounds === 0
    const result: Record<string, number> = {}
    for (const k of ATTR_KEYS) {
      const v = (base as unknown as Record<string, number> | undefined)?.[k] ?? 0
      result[k] = v + (includeCreationPatternBonus ? (patternBonus[k] ?? 0) : 0)
    }
    return result
  }, [characterBase, patternBonus, totalRounds])

  const calculatedNarrativeTimeLabel = useMemo(
    () => formatCurrentNarrativeTimeLabel({ timeStep, round, eraStartYear, worldEraName }),
    [timeStep, round, eraStartYear, worldEraName],
  )
  const latestNarrativeTimeLabel = narrativeHistory.at(-1)?.displayTimeLabel?.trim()
  const narrativeTimeLabel = latestNarrativeTimeLabel || calculatedNarrativeTimeLabel

  const worldTagsText = useMemo(
    () => resolveDestinyPatternWorldTags(worldConfig, worldTags),
    [worldConfig, worldTags],
  )

  const worldTagSections = useMemo(
    () => parseWorldTagsToSections(worldTagsText),
    [worldTagsText],
  )

  const handleGoToGameOver = useCallback(() => {
    stop()
    router.push('/game-over')
  }, [router, stop])

  const runNarrativeAttempt = useCallback(async () => {
    if (!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch || branchRepairPending) return
    await advanceRound()
  }, [isRuntimeReady, isDead, isComplete, isAdvancing, hasUnresolvedBranch, branchRepairPending, advanceRound])

  const handleNarrativeAdvance = useCallback(async () => {
    if (narrativeError) {
      // A manual tap takes precedence over a delayed automatic retry.
      autoRetryGenerationRef.current += 1
      setAutoRetryAttempt(0)
    }
    await runNarrativeAttempt()
  }, [narrativeError, runNarrativeAttempt])

  useEffect(() => {
    if (!narrativeError) {
      // Keep the counter while an automatic request is in flight. A successful
      // completion clears the error after the request settles and resets it.
      if (!isAdvancing) {
        autoRetryGenerationRef.current += 1
        /* eslint-disable react-hooks/set-state-in-effect -- reset local retry budget after a completed request */
        setAutoRetryAttempt(0)
        /* eslint-enable react-hooks/set-state-in-effect */
      }
      return
    }

    if (!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch || branchRepairPending) return

    const attemptIndex = autoRetryAttempt
    const retryDelay = getAutoNarrativeRetryDelay(attemptIndex)
    if (retryDelay === null) return

    const generation = autoRetryGenerationRef.current
    const retryTimer = window.setTimeout(() => {
      if (generation !== autoRetryGenerationRef.current) return
      setAutoRetryAttempt(attemptIndex + 1)
      void runNarrativeAttempt()
    }, retryDelay)

    return () => window.clearTimeout(retryTimer)
  }, [narrativeError, isRuntimeReady, isDead, isComplete, isAdvancing, hasUnresolvedBranch, branchRepairPending, autoRetryAttempt, runNarrativeAttempt])

  const autoRetryPending = Boolean(
    narrativeError
      && isRuntimeReady
      && !isDead
      && !isComplete
      && !isAdvancing
      && !hasUnresolvedBranch
      && !branchRepairPending
      && getAutoNarrativeRetryDelay(autoRetryAttempt) !== null,
  )

  const narrativeAdvanceBlockedText = !isRuntimeReady
    ? runtimeBlockedText
    : branchRepairPending
      ? '命运分支正在后台整理'
      : '完成分支后继续'
  const narrativeAdvanceText = narrativeError && !hasUnresolvedBranch
    ? '立即重试，继续此段故事'
    : '轻触，让岁月流转'
  const narrativeAdvanceHint = narrativeError && !hasUnresolvedBranch
    ? autoRetryPending
      ? '正在自动重新尝试；轻触可立即重试'
      : '自动重试未恢复；轻触可再次尝试'
    : '下一段故事已经准备好'

  const activeTimeStepLabel = timeStepOptions.find((o) => o.value === activeTimeStepKey)?.label ?? '年'

  useEffect(() => {
    if (!showStepMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!stepMenuRef.current?.contains(event.target as Node)) setShowStepMenu(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setShowStepMenu(false)
      stepButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showStepMenu])

  const narrativeEntries: NarrativeEntry[] = useMemo(() =>
    narrativeHistory.map((chunk) => ({
      text: stripLeadingNarrativeProtocolMarker(chunk.text),
      timestamp: chunk.timestamp,
      eraLabel: chunk.displayTimeLabel ?? narrativeTimeLabel,
      ageLabel: chunk.displayAge !== undefined ? `${chunk.displayAge} 岁` : `${characterAge} 岁`,
      isBranchPoint: chunk.isBranchPoint,
      branchTitle: chunk.branchTitle,
      // 直接用 chunk 自带的 resolvedChoice：随条目移动，裁剪后不错位。
      // （历史 fallback `resolvedBranches[index]` 用数组下标，裁剪后会指向错误的分支选择）
      resolvedChoice: chunk.resolvedChoice,
      attrChanges: chunk.attrChanges,
    })),
    [narrativeHistory, narrativeTimeLabel, characterAge],
  )

  const streamingHeader = useMemo(() => ({
    eraLabel: narrativeTimeLabel,
    ageLabel: `${characterAge} 岁`,
  }), [narrativeTimeLabel, characterAge])

  // 构建世界信息面板数据
  const worldSurrounding = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    if (worldConfig) {
      const labels = resolveWorldDimensionLabels(worldConfig)
      if (worldConfig.name) items.push({ icon: '🌍', label: '世界', value: worldConfig.name })
      if (worldConfig.essenceTag) items.push({ icon: '🏷', label: '本质', value: labels.essence })
      if (worldConfig.powerSystemTag) items.push({ icon: '⚡', label: '体系', value: labels.powerSystem })
      if (worldConfig.spatialForm) items.push({ icon: '🌌', label: '空间', value: labels.spatialForm })
    }
    return items
  }, [worldConfig])

  const worldBasicStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    items.push({ icon: '📅', label: '纪元', value: narrativeTimeLabel })
    items.push({ icon: '🌤', label: '季节', value: seasonName || '?' })
    return items
  }, [narrativeTimeLabel, seasonName])

  const worldCharStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    items.push({ icon: '❤️', label: '生命', value: `${health.hp}/${health.maxHp}` })
    items.push({ icon: '💪', label: '体力', value: String(health.stamina) })
    items.push({ icon: '🧠', label: '精神', value: String(health.spirit) })
    if (health.diseases.length > 0) items.push({ icon: '🤒', label: '疾病', value: String(health.diseases.length) })
    if (health.injuries.length > 0) items.push({ icon: '🩹', label: '伤势', value: String(health.injuries.length) })
    return items
  }, [health])

  // 手动存档处理
  const handleManualSave = useCallback(async (slot: number, name: string) => {
    if (!isRuntimeReady) {
      throw new Error(runtimeIncomplete
        ? '核心模拟系统未完整加载，请刷新页面后重试。'
        : '核心模拟系统仍在初始化，请稍候重试。')
    }
    if (isAdvancing) {
      throw new Error('当前回合仍在生成，完成后才能保存。')
    }
    await saveCurrentGameToSlot(slot, name, worldConfig?.name ?? '', characterName)
    addToast('success', `已保存到槽位 ${slot}`)
  }, [addToast, characterName, isAdvancing, isRuntimeReady, runtimeIncomplete, worldConfig?.name])

  const handleCloudSave = useCallback(async (name: string) => {
    if (accountStatus !== 'authenticated') throw new Error('登录后才可使用云端栏位')
    if (!isRuntimeReady) {
      throw new Error(runtimeIncomplete ? '核心模拟系统未完整加载，请刷新页面后重试。' : '核心模拟系统仍在初始化，请稍候重试。')
    }
    if (isAdvancing) throw new Error('当前回合仍在生成，完成后才能保存。')
    const payload = CloudGameSavePayloadSchema.parse(await collectManualGameSavePayload())
    const summary = await putCloudManualSave({
      metadata: {
        schemaVersion: 1,
        slot: 1,
        name,
        worldName: worldConfig?.name ?? '',
        characterName,
        totalRounds,
        gameVersion: ENGINE_VERSION,
        savedAt: Date.now(),
      },
      payload,
    })
    setCloudSave(summary)
    addToast('success', '已保存到云端栏位')
  }, [accountStatus, addToast, characterName, isAdvancing, isRuntimeReady, runtimeIncomplete, totalRounds, worldConfig?.name])

  const flowGuard = useMemo(() => {
    if (!worldConfig || worldCode === 0) {
      return { title: '世界尚未建立', message: '请先完成世界选择与构建，再进入模拟。', action: '/new-game/world-select' }
    }
    if (!characterName.trim()) {
      return { title: '角色尚未创建', message: '请先完成角色创建、天赋和命运预览，再进入模拟。', action: '/new-game/character-create' }
    }
    return null
  }, [characterName, worldCode, worldConfig])

  if (flowGuard) {
    return (
      <div className="final-flow-frame">
        <div className="final-flow-design-fit final-flow-design-fit--390">
          <div className="final-flow-design-canvas">
            <div className={styles.root}>
              <div className={styles.guardShell}>
                <div className={styles.guardCard}>
                  <div className={styles.guardIcon}>⚠</div>
                  <h1 className={styles.guardTitle}>{flowGuard.title}</h1>
                  <p className={styles.guardMessage}>{flowGuard.message}</p>
                  <button type="button" className={styles.ctrlBtnPrimary} onClick={() => router.replace(flowGuard.action)}>
                    返回创建流程
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="final-flow-frame">
      <div className="final-flow-design-fit final-flow-design-fit--390">
        <div className="final-flow-design-canvas">
          <div className={styles.root}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <SaveDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleManualSave}
        onCloudSave={accountStatus === 'authenticated' ? handleCloudSave : undefined}
        cloudSave={cloudSave}
        cloudLoading={cloudLoading}
        defaultWorldName={worldConfig?.name}
        defaultCharacterName={characterName}
      />

      <section className={styles.bookShell} aria-label="故事进行中">
        <div className={styles.stickyShell}>
          <header className={`${styles.readerBar} ${styles.barStatus}`}>
            <div className={styles.barTop}>
              <span className={styles.identity}>
                <strong>{characterName || '未命名'} · {genderLabel}</strong>
                <small>{worldConfig?.name ?? '未知世界'} · {characterAge}岁 · {narrativeTimeLabel}</small>
              </span>
              <div ref={stepMenuRef} className={styles.barActions}>
                <div className={styles.stepMenu}>
                  <button
                    ref={stepButtonRef}
                    type="button"
                    className={styles.stepButton}
                    aria-expanded={showStepMenu}
                    aria-haspopup="listbox"
                    aria-controls="time-step-menu"
                    aria-label={`推进步长 ${activeTimeStepLabel}`}
                    onClick={() => {
                      setShowWorldPanel(false)
                      setShowStepMenu((value) => !value)
                    }}
                  >
                    <span>{activeTimeStepLabel}</span>
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3 4.5 6 8l3-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div
                    id="time-step-menu"
                    className={`${styles.stepMenuPanel} ${showStepMenu ? styles.stepMenuPanelOpen : ''}`}
                    role="listbox"
                    aria-label="选择推进步长"
                    aria-hidden={!showStepMenu}
                  >
                    {timeStepOptions.map((option) => {
                      const isActive = option.value === activeTimeStepKey
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={isActive ? styles.stepMenuOptionActive : ''}
                          onClick={() => handleTimeStepChange(option.value)}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.forceButton} ${forceBranchNext ? styles.forceButtonActive : ''}`}
                  aria-label={forceBranchNext ? '取消下一轮强制分支' : '强制下一轮分支'}
                  aria-pressed={forceBranchNext}
                  disabled={!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch || branchRepairPending}
                  onClick={handleForceBranch}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3v12M18 9a9 9 0 0 1-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="18" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                  <span className={styles.srOnly}>强制下一轮分支</span>
                </button>
              </div>
              <button
                type="button"
                className={styles.infoToggle}
                aria-label={showWorldPanel ? '收起当前信息' : '展开当前信息'}
                aria-expanded={showWorldPanel}
                aria-controls="current-information-panel"
                onClick={() => setShowWorldPanel((value) => !value)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M12 10.5v6M12 7.2v.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className={styles.barVitals}>
              <div className={styles.barAttrs} aria-label="四维属性">
                {ATTR_KEYS.map((key) => {
                  const value = displayBaseAttrs[key] ?? 0
                  const icon = key === 'physique' ? '💪' : key === 'mind' ? '🧠' : key === 'talentAptitude' ? '✨' : '💫'
                  return (
                    <span key={key}>
                      <em aria-hidden="true">{icon}</em>
                      <i>{ATTRIBUTE_NAMES[key]}</i>
                      <b className={value > 0 ? styles.rise : ''}>{value}</b>
                    </span>
                  )
                })}
              </div>
              <div className={styles.barTalents} aria-label="已选命格">
                {(destinyPatterns ?? []).slice(0, 3).map((pattern) => (
                  <span key={pattern.id} className={styles.barTalent} data-rarity={pattern.rarity}>
                    {pattern.name}
                  </span>
                ))}
                {(destinyPatterns?.length ?? 0) === 0 ? (
                  <span className={`${styles.barTalent} ${styles.barTalentEmpty}`}>尚未携带命格</span>
                ) : null}
              </div>
              <div className={styles.barRebirths} aria-label="轮回天赋">
                {equippedMythicPatterns.length > 0 ? (
                  equippedMythicPatterns.map((pattern) => (
                    <span key={pattern.id} className={`${styles.barTalent} ${styles.barTalentRebirth}`}>
                      {pattern.name}
                    </span>
                  ))
                ) : (
                  <span className={`${styles.barTalent} ${styles.barTalentEmpty}`}>未携带轮回</span>
                )}
              </div>
            </div>
          </header>
          <div className={styles.readerDivider} aria-hidden="true"><span /></div>

          {showWorldPanel && (
            <section id="current-information-panel" className={styles.infoPanel} aria-label="当前信息">
              <div className={styles.infoInner}>
                <div className={styles.panelHead}>
                  <strong>当前信息</strong>
                  <button
                    type="button"
                    className={styles.infoClose}
                    aria-label="关闭当前信息"
                    onClick={() => setShowWorldPanel(false)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

              <section className={styles.currentBlock}>
                <div className={styles.identityIndex}>
                  <span>{characterName} · {genderLabel} · {raceInfo.name}</span>
                  <small>{worldConfig?.name ?? '未知世界'} · {characterAge}岁 · {narrativeTimeLabel}</small>
                </div>
                <div className={styles.attributes}>
                  <span>生命 <b>{health.hp}/{health.maxHp}</b></span>
                </div>
              </section>

              <div className={styles.infoBody}>
                <details className={styles.ledgerDisclosure} open>
                  <summary>
                    <strong>世界与角色账簿</strong>
                    <small>{preGenStatus.isActive ? '下一段正在准备' : preGenStatus.queueLength > 0 ? '下一段已准备' : '实时生成'}</small>
                  </summary>
                  <div className={styles.ledgerContent}>
                    <p className={styles.ledgerLabel}>角色词条</p>
                    {(destinyPatterns ?? []).map((pattern, index) => (
                      <span key={pattern.id} className={styles.talent} data-index={String(index + 1).padStart(2, '0')}>
                        {pattern.name}
                      </span>
                    ))}
                    {talents.map((talent, index) => (
                      <span key={talent.id} className={styles.talent} data-index={String((destinyPatterns?.length ?? 0) + index + 1).padStart(2, '0')}>
                        {talent.name}
                      </span>
                    ))}
                    {(destinyPatterns?.length ?? 0) === 0 && talents.length === 0 && (
                      <span className={styles.mutedText}>暂无角色词条</span>
                    )}

                    <p className={styles.ledgerLabel}>轮回天赋 · 独立槽</p>
                    {equippedMythicPatterns.length > 0 ? (
                      equippedMythicPatterns.map((pattern) => (
                        <div key={pattern.id} className={styles.mythicRule}>
                          <strong>{pattern.name} · {pattern.concept}</strong>
                          <span>{pattern.effect}</span>
                        </div>
                      ))
                    ) : <span className={styles.mutedText}>本局未携带轮回天赋</span>}

                    <p className={styles.ledgerLabel}>世界与当前状态</p>
                    <div className={styles.stateList}>
                      {worldSurrounding.map((item) => <span key={item.label}>{item.label} {item.value}</span>)}
                      {worldBasicStatus.map((item) => <span key={item.label}>{item.label} {item.value}</span>)}
                      {worldCharStatus.map((item) => <span key={item.label}>{item.label} {item.value}</span>)}
                    </div>
                    <p className={styles.ledgerLabel}>叙事重复观测 · 近五轮</p>
                    <div className={styles.repetitionStats} aria-live="polite">
                      <span>本轮 {narrativeHistory[narrativeHistory.length - 1]?.repetitionMetric ? Math.round((narrativeHistory[narrativeHistory.length - 1].repetitionMetric?.wordRepeatRate ?? 0) * 100) + '%' : '待测'}</span>
                      <span>近五轮均值 {Math.round(storyRepetitionStats.recentAverageWordRepeatRate * 100)}%</span>
                      <span>峰值 {Math.round(storyRepetitionStats.maxWordRepeatRate * 100)}%</span>
                      <span>{storyRepetitionStats.trend === 'rising' ? '重复上升' : storyRepetitionStats.trend === 'falling' ? '重复下降' : '保持平稳'}</span>
                      <div className={styles.repetitionRounds} aria-label="近五轮词语重复率">
                        {recentRepetitionMetrics.length > 0
                          ? recentRepetitionMetrics.map((metric) => (
                              <span key={metric.round}>第{metric.round}轮 <b>{Math.round(metric.wordRepeatRate * 100)}%</b></span>
                            ))
                          : <span>暂无轮次数据</span>}
                      </div>
                    </div>
                    {worldTagSections.map((section) => (
                      <div key={section.name} className={styles.ruleGroup}>
                        <p className={styles.ledgerLabel}>{section.name}</p>
                        <div className={styles.stateList}>
                          {section.tags.map((tag) => <span key={`${section.name}-${tag.key}`}>{tag.key} {tag.value}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>

                <section className={styles.moreActions}>
                  <div className={styles.sectionLine}>
                    <strong>更多</strong>
                    <small>当前章节</small>
                  </div>
                  <div className={styles.moreActionRow}>
                    <button
                      type="button"
                      disabled={!isRuntimeReady || isAdvancing}
                      title={!isRuntimeReady ? `${runtimeBlockedText}，暂时不能保存` : isAdvancing ? '故事生成完成后才能保存' : undefined}
                      onClick={() => {
                        setShowWorldPanel(false)
                        setShowSaveDialog(true)
                      }}
                    >
                      手动存档
                    </button>
                    <button type="button" onClick={() => router.push('/feedback')}>反馈与建议</button>
                    <button type="button" onClick={() => router.push('/welcome')}>返回主界面</button>
                  </div>
                </section>
              </div>
            </section>
          )}
        </div>

        <div ref={narrativeEndRef} className={styles.reading} role="main">
          <header className={styles.chapterHead}>
            <small>第 {Math.max(totalRounds, 1)} 回 · 故事进程</small>
            <h1>故事进行中</h1>
            <div className={styles.chapterRule}>
              <span>{!isRuntimeReady ? runtimeBlockedText : isAdvancing ? '命书正在续写' : hasUnresolvedBranch ? '等待你的选择' : branchRepairPending ? '命运分支整理中' : forceBranchNext ? '已请求命运分叉' : '岁月流转'}</span>
            </div>
          </header>

          {runtimeIncomplete && (
            <div className={styles.errorNotice} role="alert">
              <strong>核心系统未完整加载</strong>
              <span>请刷新页面后再继续；当前进度不会被推进或覆盖。</span>
            </div>
          )}

          {narrativeError && (
            <div className={styles.errorNotice} role="alert">
              <strong>这一段未能写完</strong>
              <span>{autoRetryPending
                ? `${narrativeError} 正在自动重新尝试；也可在页面底部立即再试。`
                : hasUnresolvedBranch
                  ? `${narrativeError} 请先完成当前分支后继续。`
                  : isDead || isComplete
                    ? narrativeError
                    : `${narrativeError} 自动重试未恢复，可在页面底部再次尝试。`}</span>
            </div>
          )}

          <NarrativeTimeline
            entries={narrativeEntries}
            streamingText={streamingNarrative}
            scrollContainerRef={narrativeEndRef}
            streamingHeader={streamingHeader}
            turnCount={totalRounds}
            showAdvance={!isDead && !isComplete}
            advanceBlocked={!isRuntimeReady || hasUnresolvedBranch || branchRepairPending}
            advanceBlockedText={narrativeAdvanceBlockedText}
            advanceText={narrativeAdvanceText}
            advanceHint={narrativeAdvanceHint}
            isGenerating={isAdvancing}
            hasEndingEvent={isDead}
            onAdvance={handleNarrativeAdvance}
            onGoToGameOver={handleGoToGameOver}
            unresolvedBranchIndex={unresolvedBranchIndex}
            branchTitle={branchTitle}
            branchOptions={branchOptions}
            selectedBranchOptionId={selectedBranchOptionId}
            branchCustomText={branchCustomText}
            onBranchSelect={setSelectedBranchOptionId}
            onBranchConfirm={handleBranchConfirmWithFeedback}
            onBranchCancel={handleBranchCancel}
            onCustomInputChange={setBranchCustomText}
          />

          {(isDead || isComplete) && !streamingNarrative && (
            <section className={styles.statusBanner}>
              <h2>{isDead ? `${characterName} 的一生已落幕` : '本卷人生已经写完'}</h2>
              <p>{isDead ? `角色在第 ${round.year} 年 ${seasonName} 离世。` : `共走过 ${totalRounds} 轮，结算页将整理这一生的轨迹。`}</p>
              <button type="button" onClick={handleGoToGameOver}>前往人生结算</button>
            </section>
          )}
        </div>
      </section>
          </div>
        </div>
      </div>
    </div>
  )
}
