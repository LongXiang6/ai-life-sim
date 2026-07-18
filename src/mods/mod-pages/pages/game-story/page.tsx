'use client'

/**
 * @module game-page
 * @description 游戏模拟页 —— 对齐废弃项目：顶栏信息+控制，下方叙事区，隐藏式推进
 * @mod mod-pages
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'

import { useRouter } from 'next/navigation'
import { clamp } from '@/core/shared'

import { useEngine, useNarrative, usePreGenQueueStatus, useSimulationAdvance } from '@/mods/mod-engine'
import {
  AVAILABLE_TIME_STEPS,
  encodeTimeStepKey,
  formatCurrentNarrativeTimeLabel,
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

const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' }

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

  const { narrativeHistory } = useNarrative()
  const streamingNarrative = useEngineStore((s) => s.streamingNarrative)
  const narrativeError = useEngineStore((s) => s.narrativeError)
  const timeStep = useEngineStore((s) => s.timeStep)
  const preGenStatus = usePreGenQueueStatus()
  const activeTimeStepKey = encodeTimeStepKey(timeStep)
  const handleTimeStepChange = useCallback((key: string) => {
    setSimulationTimeStepByKey(key)
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
  const equippedMythicPattern = useCharacterStore((s) => s.equippedMythicPattern)
  const talents = useCharacterStore((s) => s.talents)
  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const worldTags = useWorldStore((s) => s.worldTags)
  const eraStartYear = useWorldStore((s) => s.eraStartYear)
  const worldEraName = useWorldStore((s) => s.eraName)

  const [showWorldPanel, setShowWorldPanel] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const narrativeEndRef = useRef<HTMLDivElement>(null)
  const prevEventsLenRef = useRef(0)
  const toasts = useToastStore((s) => s.toasts)
  const addToast = useToastStore((s) => s.addToast)
  const dismissToast = useToastStore((s) => s.dismissToast)

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

  const narrativeTimeLabel = useMemo(
    () => formatCurrentNarrativeTimeLabel({ timeStep, round, eraStartYear, worldEraName }),
    [timeStep, round, eraStartYear, worldEraName],
  )

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

  const handleNarrativeAdvance = useCallback(async () => {
    if (narrativeError || !isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch) return
    await advanceRound()
  }, [narrativeError, isRuntimeReady, isDead, isComplete, isAdvancing, hasUnresolvedBranch, advanceRound])

  const handleNarrativeRetry = useCallback(async () => {
    if (!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch) return
    await advanceRound()
  }, [isRuntimeReady, isDead, isComplete, isAdvancing, hasUnresolvedBranch, advanceRound])

  const narrativeAdvanceBlockedText = !isRuntimeReady
    ? runtimeBlockedText
    : narrativeError
      ? hasUnresolvedBranch
        ? '完成分支后再重新尝试'
        : '请使用上方“重新尝试”恢复本段故事'
      : '完成分支后继续'

  const activeTimeStepLabel = timeStepOptions.find((o) => o.value === activeTimeStepKey)?.label ?? '按年'

  const narrativeEntries: NarrativeEntry[] = useMemo(() =>
    narrativeHistory.map((chunk) => ({
      text: chunk.text,
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
    if (preGenStatus.isActive || isAdvancing) {
      throw new Error('当前回合或下一段故事仍在生成，完成后才能保存。')
    }
    await saveCurrentGameToSlot(slot, name, worldConfig?.name ?? '', characterName)
    addToast('success', `已保存到槽位 ${slot}`)
  }, [addToast, characterName, isAdvancing, isRuntimeReady, preGenStatus.isActive, runtimeIncomplete, worldConfig?.name])

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
    )
  }

  return (
    <div className={styles.root}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <SaveDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleManualSave}
        defaultWorldName={worldConfig?.name}
        defaultCharacterName={characterName}
      />

      <section className={styles.bookShell} aria-label="故事进行中">
        <div className={styles.stickyShell}>
          <header className={styles.readerBar}>
            <span className={styles.identity}>
              <strong>{characterName || '未命名'}</strong>
              <small>{worldConfig?.name ?? '未知世界'} · {raceInfo.name} · {characterAge}岁 · {narrativeTimeLabel}</small>
            </span>
            <button
              type="button"
              className={`${styles.forceButton} ${forceBranchNext ? styles.forceButtonActive : ''}`}
              aria-label={forceBranchNext ? '取消下一轮强制分支' : '强制下一轮分支'}
              aria-pressed={forceBranchNext}
              disabled={!isRuntimeReady || isDead || isComplete || isAdvancing || hasUnresolvedBranch}
              onClick={handleForceBranch}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3v12M18 9a9 9 0 0 1-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="18" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span className={styles.srOnly}>强制下一轮分支</span>
            </button>
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
                  <small>{worldConfig?.name} · {narrativeTimeLabel}</small>
                </div>
                <div className={styles.attributes}>
                  {ATTR_KEYS.map((key) => {
                    const value = displayBaseAttrs[key] ?? 0
                    return (
                      <span key={key}>
                        {ATTRIBUTE_NAMES[key]} <b className={value > 0 ? styles.rise : value < 0 ? styles.fall : ''}>
                          {value > 0 ? '+' : ''}{value}
                        </b>
                      </span>
                    )
                  })}
                  <span>生命 <b>{health.hp}/{health.maxHp}</b></span>
                </div>
              </section>

              <div className={styles.infoBody}>
                <section className={styles.infoBlock}>
                  <div className={styles.sectionLine}>
                    <strong>推进步长</strong>
                    <small>{activeTimeStepLabel} · 下一轮生效</small>
                  </div>
                  <div className={styles.stepGrid}>
                    {timeStepOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={option.value === activeTimeStepKey ? styles.stepActive : ''}
                        aria-pressed={option.value === activeTimeStepKey}
                        onClick={() => handleTimeStepChange(option.value)}
                      >
                        {option.label.replace(/^按/, '')}
                      </button>
                    ))}
                  </div>
                </section>

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

                    <p className={styles.ledgerLabel}>神话传承 · 独立槽</p>
                    {equippedMythicPattern ? (
                      <div className={styles.mythicRule}>
                        <strong>{equippedMythicPattern.name} · {equippedMythicPattern.concept}</strong>
                        <span>{equippedMythicPattern.effect}</span>
                      </div>
                    ) : <span className={styles.mutedText}>本局未携带神话传承</span>}

                    <p className={styles.ledgerLabel}>世界与当前状态</p>
                    <div className={styles.stateList}>
                      {worldSurrounding.map((item) => <span key={item.label}>{item.label} {item.value}</span>)}
                      {worldBasicStatus.map((item) => <span key={item.label}>{item.label} {item.value}</span>)}
                      {worldCharStatus.map((item) => <span key={item.label}>{item.label} {item.value}</span>)}
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
                      disabled={!isRuntimeReady || isAdvancing || preGenStatus.isActive}
                      title={!isRuntimeReady ? `${runtimeBlockedText}，暂时不能保存` : isAdvancing || preGenStatus.isActive ? '故事生成完成后才能保存' : undefined}
                      onClick={() => {
                        setShowWorldPanel(false)
                        setShowSaveDialog(true)
                      }}
                    >
                      手动存档
                    </button>
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
              <span>{!isRuntimeReady ? runtimeBlockedText : isAdvancing ? '命书正在续写' : hasUnresolvedBranch ? '等待你的选择' : forceBranchNext ? '已请求命运分叉' : '岁月流转'}</span>
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
              <span>{narrativeError}</span>
              {!hasUnresolvedBranch && !isDead && !isComplete && (
                <button type="button" disabled={!isRuntimeReady || isAdvancing} onClick={handleNarrativeRetry}>重新尝试</button>
              )}
            </div>
          )}

          <NarrativeTimeline
            entries={narrativeEntries}
            streamingText={streamingNarrative}
            scrollContainerRef={narrativeEndRef}
            streamingHeader={streamingHeader}
            turnCount={totalRounds}
            showAdvance={!isDead && !isComplete}
            advanceBlocked={!isRuntimeReady || hasUnresolvedBranch || Boolean(narrativeError)}
            advanceBlockedText={narrativeAdvanceBlockedText}
            isGenerating={isAdvancing}
            hasEndingEvent={isDead}
            advanceText="轻触，让岁月流转"
            onAdvance={handleNarrativeAdvance}
            onGoToGameOver={handleGoToGameOver}
            unresolvedBranchIndex={unresolvedBranchIndex}
            branchTitle={branchTitle}
            branchOptions={branchOptions}
            selectedBranchOptionId={selectedBranchOptionId}
            branchCustomText={branchCustomText}
            onBranchSelect={setSelectedBranchOptionId}
            onBranchConfirm={handleBranchConfirm}
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
  )
}
