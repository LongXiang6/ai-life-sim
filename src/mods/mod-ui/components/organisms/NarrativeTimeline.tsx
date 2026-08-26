/**
 * Purpose: Coordinate the narrative window, scroll restoration, and story-tail advance control.
 * Owner: mod-ui/narrative-timeline
 * Responsibility: Timeline-level orchestration only; entry and branch rendering live in NarrativeTimelineEntryView.
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { clamp } from '@/core/shared'

import { NarrativeTimelineEntryView } from './NarrativeTimelineEntryView'
import styles from './NarrativeTimeline.module.css'

const WINDOW_SIZE = 30
const LOAD_MORE = 20

export interface NarrativeEntry {
  text: string
  timestamp?: number
  eraLabel?: string
  ageLabel?: string
  isDeath?: boolean
  isLifeEnd?: boolean
  isBranchPoint?: boolean
  branchTitle?: string
  resolvedChoice?: string
  destinyPatternGrowth?: NarrativeDestinyPatternGrowthEntry
}

export interface NarrativeDestinyPatternGrowthPatternEntry {
  name: string
  rarity: 'common' | 'fine' | 'rare' | 'epic' | 'legendary' | 'mythic'
  rarityLabel: string
  description: string
  effect: string
  attrBonus: Partial<Record<'physique' | 'mind' | 'talentAptitude' | 'charisma' | 'luck', number>>
}

export interface NarrativeDestinyPatternGrowthEntry {
  choiceId: string
  source: NarrativeDestinyPatternGrowthPatternEntry
  options: Array<NarrativeDestinyPatternGrowthPatternEntry & {
    optionId: string
    route: '深度强化' | '广度强化' | '转变强化'
  }>
  selectedOptionId?: string
  result?: NarrativeDestinyPatternGrowthPatternEntry
}

export interface NarrativeTimelineProps {
  entries: NarrativeEntry[]
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  turnCount?: number
  advanceText?: string
  advanceHint?: string
  showAdvance?: boolean
  advanceBlocked?: boolean
  advanceBlockedText?: string
  isGenerating?: boolean
  hasEndingEvent?: boolean
  onAdvance?: () => void
  onGoToGameOver?: () => void
  className?: string
  unresolvedBranchIndex?: number | null
  branchTitle?: string
  branchOptions?: string[]
  selectedBranchOptionId?: string | null
  branchCustomText?: string
  onBranchSelect?: (optionId: string | null) => void
  onBranchConfirm?: () => void
  onBranchCancel?: () => void
  onCustomInputChange?: (text: string) => void
  onDestinyPatternGrowthSelect?: (optionId: string) => void
}

export function NarrativeTimeline({
  entries,
  scrollContainerRef,
  turnCount = 0,
  advanceText = '轻触，让岁月流转',
  advanceHint = '下一段故事已经准备好',
  showAdvance = false,
  advanceBlocked = false,
  advanceBlockedText = '✔ 请先选择命运',
  isGenerating = false,
  hasEndingEvent = false,
  onAdvance,
  onGoToGameOver,
  className,
  unresolvedBranchIndex,
  branchTitle,
  branchOptions = [],
  selectedBranchOptionId,
  branchCustomText,
  onBranchSelect,
  onBranchConfirm,
  onBranchCancel,
  onCustomInputChange,
  onDestinyPatternGrowthSelect,
}: NarrativeTimelineProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? internalScrollRef
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRestoreRef = useRef(0)
  const prevTotalRef = useRef(entries.length)
  const [renderStart, setRenderStart] = useState(() => clamp(entries.length - WINDOW_SIZE, 0, Infinity))

  /* eslint-disable react-hooks/set-state-in-effect -- event-count changes reset the render window */
  useEffect(() => {
    const total = entries.length
    if (total === 0) {
      setRenderStart(0)
      return
    }
    if (total > prevTotalRef.current) {
      setRenderStart(clamp(total - WINDOW_SIZE, 0, Infinity))
    } else {
      setRenderStart((previous) => Math.min(previous, clamp(total - WINDOW_SIZE, 0, Infinity)))
    }
    prevTotalRef.current = total
  }, [entries.length])
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadMore = () => {
    if (renderStart <= 0) return
    const container = scrollRef.current
    if (container) scrollRestoreRef.current = container.scrollHeight
    setRenderStart((previous) => clamp(previous - LOAD_MORE, 0, Infinity))
  }
  const loadMoreRef = useRef(loadMore)

  useEffect(() => {
    loadMoreRef.current = loadMore
  })

  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = scrollRef.current
    if (!sentinel || !container || renderStart <= 0) return
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) loadMoreRef.current()
      },
      { root: container, rootMargin: '200px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [renderStart, scrollRef])

  useEffect(() => {
    const container = scrollRef.current
    if (container && scrollRestoreRef.current > 0) {
      const difference = container.scrollHeight - scrollRestoreRef.current
      if (difference > 0) container.scrollTop += difference
      scrollRestoreRef.current = 0
    }
  }, [renderStart, scrollRef])

  const eventElements = useMemo(() => {
    const nodes: React.ReactNode[] = []
    for (let index = renderStart; index < entries.length; index++) {
      const entry = entries[index]!
      if (index > renderStart || renderStart > 0) {
        nodes.push(<div data-separator-for={index} key={`divider-${index}`} className={styles.separator}><span aria-hidden="true" /></div>)
      }
      nodes.push(
        <NarrativeTimelineEntryView
          key={`entry-${index}`}
          entry={entry}
          entryIndex={index}
          showBranchEditor={entry.isBranchPoint === true && !entry.resolvedChoice && index === unresolvedBranchIndex}
          branchTitle={branchTitle}
          branchOptions={branchOptions}
          selectedBranchOptionId={selectedBranchOptionId}
          branchCustomText={branchCustomText}
          isGenerating={isGenerating}
          onBranchSelect={onBranchSelect}
          onBranchConfirm={onBranchConfirm}
          onBranchCancel={onBranchCancel}
          onCustomInputChange={onCustomInputChange}
          onDestinyPatternGrowthSelect={onDestinyPatternGrowthSelect}
        />,
      )
    }
    return nodes
  }, [
    branchCustomText, branchOptions, branchTitle, entries, isGenerating, onBranchCancel,
    onBranchConfirm, onBranchSelect, onCustomInputChange, onDestinyPatternGrowthSelect,
    renderStart, selectedBranchOptionId, unresolvedBranchIndex,
  ])

  const canTapAdvance = showAdvance && !advanceBlocked && !isGenerating
  const displayTurnCount = Math.max(turnCount, 1)
  // Loading only changes availability and tone; the control keeps the ready-state copy
  // so its two-line footprint remains stable while the story is being finalized.
  const advanceTitle = !isGenerating && advanceBlocked ? advanceBlockedText : advanceText
  const computedAdvanceHint = isGenerating
    ? advanceHint
    : advanceBlocked ? '当前故事仍在等待处理' : advanceHint

  return (
    <div className={[styles.timelineShell, className].filter(Boolean).join(' ')}>
      <div ref={scrollContainerRef ? undefined : internalScrollRef} className={styles.scrollMain}>
        <div className={styles.timelineInner}>
          <div data-narrative-header className={styles.timelineHeader}>
            <span className={styles.timelineHeaderLabel}>故事进程</span>
            <span className={styles.timelineHeaderRound}>第 {displayTurnCount} 轮 · 已走过 {displayTurnCount} 段岁月</span>
          </div>
          {entries.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>卷首</div>
              <p>这一生尚未落笔</p>
              <p className={styles.emptyHint}>轻触下方，让第一段岁月开始</p>
            </div>
          ) : null}
          {renderStart > 0 ? (
            <div ref={sentinelRef} className={styles.loadMore} onClick={loadMore} role="button" tabIndex={0}>
              向上回望更早的 {renderStart} 段人生
            </div>
          ) : null}
          {eventElements}
          {showAdvance ? (
            <div className={styles.advanceDock}>
              <div className={styles.advanceArea}>
                {hasEndingEvent ? (
                  <button type="button" className={styles.settleBtn} onClick={onGoToGameOver}>
                    <strong>前往人生结算</strong><small>这一生的轨迹已经写完</small>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={[styles.advanceTap, isGenerating ? styles.advanceGenerating : advanceBlocked ? styles.advanceBlocked : styles.advanceIdle].join(' ')}
                    disabled={!canTapAdvance}
                    onClick={onAdvance}
                  >
                    <span className={styles.advanceText}><strong>{advanceTitle}</strong><small>{computedAdvanceHint}</small></span>
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
