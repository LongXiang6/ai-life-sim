'use client'

/**
 * @module game-page
 * @description 游戏模拟页 —— 对齐废弃项目：顶栏信息+控制，下方叙事区，隐藏式推进
 * @mod mod-pages
 */

import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

import { useRouter } from 'next/navigation'
import { clamp } from '@/core/shared'

import { useEngine, useNarrative, useSimulationAdvance, usePreGenQueueStatus } from '@/mods/mod-engine'
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
  ATTRIBUTE_ICONS,
  ATTR_KEYS,
  RACE_LIFESPAN,
  DESTINY_PATTERN_RARITY_CONFIG,
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

const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' }

import { cn } from '@/foundation/utils'

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

function AutoSaveIndicator({ lastAutoSaveRound }: { lastAutoSaveRound: number }) {
  const hasAutoSave = lastAutoSaveRound > 0

  return (
    <div className={styles.autoSave}>
      <span className={styles.autoSaveLabel}>
        <span className={styles.autoSaveDot} data-saved={hasAutoSave ? 'true' : 'false'} />
        实时保存
      </span>
      {hasAutoSave
        ? <span className={styles.autoSaveRound}>已保存至第 {lastAutoSaveRound} 轮</span>
        : <span className={styles.autoSaveRound}>未保存</span>}
    </div>
  )
}

export default function GamePage() {
  const router = useRouter()
  const { status, round, totalRounds, lastAutoSaveRound, seasonName, stop } = useEngine()
  const { advanceRound, isAdvancing } = useSimulationAdvance()

  const {
    hasUnresolvedBranch,
    unresolvedBranchIndex,
    branchTitle,
    branchOptions,
    handleBranchConfirm,
    handleBranchCancel,
    branchCustomText,
    setBranchCustomText,
    selectedBranchOptionId,
    setSelectedBranchOptionId,
  } = useSimulationBranch({ advanceRound })

  const { narrativeHistory } = useNarrative()
  const preGenStatus = usePreGenQueueStatus()
  const streamingNarrative = useEngineStore((s) => s.streamingNarrative)
  const timeStep = useEngineStore((s) => s.timeStep)
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
  const talents = useCharacterStore((s) => s.talents)
  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const worldTags = useWorldStore((s) => s.worldTags)
  const eraStartYear = useWorldStore((s) => s.eraStartYear)
  const worldEraName = useWorldStore((s) => s.eraName)

  const [showWorldPanel, setShowWorldPanel] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [timeStepOpen, setTimeStepOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const timeStepBtnRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLDivElement>(null)
  const [timeStepMenuRect, setTimeStepMenuRect] = useState<DOMRect | null>(null)
  const [moreMenuRect, setMoreMenuRect] = useState<DOMRect | null>(null)
  const narrativeEndRef = useRef<HTMLDivElement>(null)
  const prevEventsLenRef = useRef(0)
  const toasts = useToastStore((s) => s.toasts)
  const addToast = useToastStore((s) => s.addToast)
  const dismissToast = useToastStore((s) => s.dismissToast)

  // 自动滚动到最新叙事（对齐废弃项目）
  useEffect(() => {
    const container = narrativeEndRef.current
    if (!container) return
    if (narrativeHistory.length > prevEventsLenRef.current) {
      const newEventIdx = narrativeHistory.length - 1
      const separatorEl = container.querySelector(`[data-separator-for="${newEventIdx}"]`)
      const headerEl = container.querySelector('[data-narrative-header]')
      const headerHeight = headerEl ? (headerEl as HTMLElement).offsetHeight + 12 : 48
      if (separatorEl) {
        const targetScroll = separatorEl.getBoundingClientRect().top
          - container.getBoundingClientRect().top
          + container.scrollTop
          - headerHeight
          - 8
        container.scrollTo({ top: clamp(targetScroll, 0, Infinity), behavior: 'smooth' })
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      }
    }
    prevEventsLenRef.current = narrativeHistory.length
  }, [narrativeHistory.length, streamingNarrative])

  useLayoutEffect(() => {
    if (timeStepOpen) {
      const rect = timeStepBtnRef.current?.getBoundingClientRect()
      setTimeStepMenuRect(rect ?? null)
    }
  }, [timeStepOpen])

  useLayoutEffect(() => {
    if (moreOpen) {
      const rect = moreBtnRef.current?.getBoundingClientRect()
      setMoreMenuRect(rect ?? null)
    }
  }, [moreOpen])

  // 点击外部关闭顶部弹出菜单
  useEffect(() => {
    if (!timeStepOpen && !moreOpen) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (timeStepOpen && timeStepBtnRef.current && !timeStepBtnRef.current.contains(target)) {
        setTimeStepOpen(false)
      }
      if (moreOpen && moreBtnRef.current && !moreBtnRef.current.contains(target)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [timeStepOpen, moreOpen])

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
    const result: Record<string, number> = {}
    for (const k of ATTR_KEYS) {
      const v = (base as unknown as Record<string, number> | undefined)?.[k] ?? 0
      result[k] = v + (patternBonus[k] ?? 0)
    }
    return result
  }, [characterBase, patternBonus])

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
    if (isDead || isComplete || isAdvancing || hasUnresolvedBranch) return
    await advanceRound()
  }, [isDead, isComplete, isAdvancing, hasUnresolvedBranch, advanceRound])

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
      if (worldConfig.name) items.push({ icon: '🌍', label: '世界', value: worldConfig.name })
      if (worldConfig.essenceTag) items.push({ icon: '🏷', label: '本质', value: worldConfig.essenceTag })
      if (worldConfig.powerSystemTag) items.push({ icon: '⚡', label: '体系', value: worldConfig.powerSystemTag })
      if (worldConfig.spatialForm) items.push({ icon: '🌌', label: '空间', value: worldConfig.spatialForm })
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
    await saveCurrentGameToSlot(slot, name, worldConfig?.name ?? '', characterName)
    addToast('success', `已保存到槽位 ${slot}`)
  }, [addToast, characterName, worldConfig?.name])

  const preGenHint = useMemo(() => {
    if (preGenStatus.maxRounds <= 0) return null
    if (preGenStatus.isActive) return '预生成中…'
    if (preGenStatus.queueLength > 0) return `缓存 ${preGenStatus.queueLength} 轮`
    return null
  }, [preGenStatus])

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
      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* 手动存档弹窗 */}
      <SaveDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleManualSave}
        defaultWorldName={worldConfig?.name}
        defaultCharacterName={characterName}
      />

      {/* 顶部状态栏（对齐废弃项目 GameSimulationDesktop） */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTopRow}>
              <span className={styles.worldName}>{worldConfig?.name ?? '未知世界'}</span>
              <span className={styles.raceTag}>{raceInfo.name}</span>
              {isDead && <span className={styles.endingTag}>🏁 人生落幕</span>}
            </div>
            <div className={styles.charRow}>
              <span className={styles.charName}>{characterName || '未命名'}</span>
              <span className={styles.charGender}>· {genderLabel}</span>
              {(destinyPatterns ?? []).slice(0, 3).map((p) => {
                const rc = DESTINY_PATTERN_RARITY_CONFIG[p.rarity]
                return (
                  <span
                    key={p.id}
                    className={styles.talentTag}
                    style={{ background: `${rc.color}10`, color: rc.color, border: `1px solid ${rc.color}20` }}
                  >
                    {p.name}
                  </span>
                )
              })}
            </div>
            <div className={styles.attrRow}>
              {ATTR_KEYS.map((k) => {
                const v = displayBaseAttrs[k] ?? 0
                return (
                  <span key={k} className={styles.attrItem}>
                    <span className={styles.attrIcon}>{ATTRIBUTE_ICONS[k]}</span>
                    <span className={styles.attrKey}>{ATTRIBUTE_NAMES[k]}</span>
                    <span className={`${styles.attrVal} ${v > 0 ? styles.attrValPos : v < 0 ? styles.attrValNeg : styles.attrValZero}`}>
                      {v > 0 ? '+' : ''}{v}
                    </span>
                  </span>
                )
              })}
            </div>
            <div className={styles.dynAttrRow}>
              <span className={`${styles.dynAttrItem} ${health.hp > 0 ? styles.dynAttrPos : styles.dynAttrZero}`}>
                生命 {health.hp}
              </span>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.eraDisplay}>{narrativeTimeLabel}</span>
            <span className={styles.ageDisplay}>{characterAge}岁</span>
            {preGenHint && (
              <span className={styles.preGenHint}>{preGenHint}</span>
            )}
            <div className={styles.controlRow}>
              <div ref={moreBtnRef} className={styles.menuAnchor}>
                <button
                  type="button"
                  className={styles.ctrlBtn}
                  aria-label="更多操作"
                  aria-expanded={moreOpen}
                  onClick={() => {
                    setMoreOpen((v) => !v)
                    setTimeStepOpen(false)
                  }}
                >
                  更多
                </button>
              </div>
              <div ref={timeStepBtnRef} className={styles.menuAnchor}>
                <button
                  type="button"
                  className={styles.ctrlBtn}
                  aria-label="时间推进长度切换"
                  aria-expanded={timeStepOpen}
                  onClick={() => {
                    setTimeStepOpen((v) => !v)
                    setMoreOpen(false)
                  }}
                >
                  {activeTimeStepLabel}
                </button>
              </div>
              <button
                type="button"
                className={`${styles.ctrlBtn} ${showWorldPanel ? styles.ctrlBtnWorldActive : ''}`}
                aria-label="世界信息"
                aria-expanded={showWorldPanel}
                onClick={() => {
                  setShowWorldPanel(!showWorldPanel)
                  setTimeStepOpen(false)
                  setMoreOpen(false)
                }}
              >
                世界
              </button>
            </div>
            <AutoSaveIndicator lastAutoSaveRound={lastAutoSaveRound} />
          </div>
        </div>
      </header>

      {/* 世界信息面板（可折叠，对齐废弃项目标签布局） */}
      {showWorldPanel && (
        <div className={styles.panel}>
          <div className={styles.panelInner}>
            {worldTagSections.length > 0 && (
              <>
                <h4 className={styles.panelSectionTitle}>📄 世界规则</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {worldTagSections.map((section) => (
                    <div key={section.name}>
                      <div className={styles.panelSectionTitleSm}>{section.name}</div>
                      <div className={styles.tagGrid}>
                        {section.tags.map((tag) => (
                          <span key={`${section.name}-${tag.key}`} className={styles.tagChip}>
                            {tag.key}：{tag.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {(worldSurrounding.length > 0 || worldBasicStatus.length > 0 || worldCharStatus.length > 0) && (
              <>
                {worldSurrounding.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className={styles.panelSectionTitleSm}>📍 你的周边</div>
                    <div className={styles.tagGrid}>
                      {worldSurrounding.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipEnv}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldBasicStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>🔔 基础状态</div>
                    <div className={styles.tagGrid}>
                      {worldBasicStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipEnv}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldCharStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>👁 角色状态</div>
                    <div className={styles.tagGrid}>
                      {worldCharStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipChar}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {worldTagSections.length === 0 && worldSurrounding.length === 0 && worldBasicStatus.length === 0 && worldCharStatus.length === 0 && (
              <div className={styles.panelEmpty}>
                <div className={styles.panelEmptyIcon}>🔔</div>
                <p className={styles.panelEmptyText}>正在等待模拟数据，推进第一年后自动加载...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {moreOpen && moreMenuRect && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.moreMenu}
          style={{
            position: 'fixed',
            zIndex: 10000,
            top: moreMenuRect.bottom + 4,
            right: document.documentElement.clientWidth - moreMenuRect.right,
            background: 'var(--color-bg-card)',
            opacity: 1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.moreMenuItem}
            onClick={() => {
              setShowSaveDialog(true)
              setMoreOpen(false)
            }}
          >
            存档
          </button>
          <button
            type="button"
            className={styles.moreMenuItem}
            onClick={() => {
              setMoreOpen(false)
              router.push('/')
            }}
          >
            主界面
          </button>
        </div>,
        document.body,
      )}

      {timeStepOpen && timeStepMenuRect && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.timeStepMenu}
          style={{
            position: 'fixed',
            zIndex: 10000,
            top: timeStepMenuRect.bottom + 4,
            right: document.documentElement.clientWidth - timeStepMenuRect.right,
            background: 'var(--color-bg-card)',
            opacity: 1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {timeStepOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(styles.timeStepItem, opt.value === activeTimeStepKey && styles.timeStepItemActive)}
              onClick={() => {
                handleTimeStepChange(opt.value)
                setTimeStepOpen(false)
              }}
            >
              {opt.label}
            </button>
          ))}
          <p className={styles.timeStepMenuHint}>
            从年/季/月切到更细粒度时，下一轮会先进入未叙事周期，避免重写已经覆盖的时间。
          </p>
        </div>,
        document.body,
      )}
      {/* 主内容区：叙事 + 隐藏式推进 */}
      <div className={styles.mainArea}>
        <NarrativeTimeline
          entries={narrativeEntries}
          streamingText={streamingNarrative}
          scrollContainerRef={narrativeEndRef}
          streamingHeader={streamingHeader}
          turnCount={totalRounds}
          showAdvance={!isDead && !isComplete}
          advanceBlocked={hasUnresolvedBranch}
          advanceBlockedText="✔ 请先选择命运"
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

        {isDead && !streamingNarrative && (
          <div className={styles.statusBanner}>
            <h2 className={styles.statusTitle}>{characterName} 的一生已落幕</h2>
            <p className={styles.statusDesc}>
              模拟已完成。角色在第 {round.year} 年 {seasonName} 离世。
            </p>
          </div>
        )}

        {isComplete && !isDead && !streamingNarrative && narrativeHistory.length === 0 && (
          <div className={styles.statusBanner}>
            <p className={styles.statusDesc}>模拟已结束</p>
          </div>
        )}
      </div>
    </div>
  )
}
