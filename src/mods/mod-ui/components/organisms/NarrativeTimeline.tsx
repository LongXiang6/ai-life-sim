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
  attrChanges?: Array<{ icon: string; label: string; change: number }>
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
  showGenerationCursor?: boolean
  generatingText?: string
  generatingHint?: string
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
  showGenerationCursor = isGenerating,
  generatingText = '命书正在续写……',
  generatingHint = '下一段人生正在生成',
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
        nodes.push(
          <div data-separator-for={index} key={`divider-${index}`}>
            <div className={styles.separator}>
              <div className={styles.separatorLine} />
              <span className={styles.separatorMark} aria-hidden="true" />
              <div className={styles.separatorLine} />
            </div>
          </div>,
        )
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
        />,
      )
    }
    if (showGenerationCursor) {
      nodes.push(
        <div key="stream-divider">
          <div className={styles.separator}>
            <div className={styles.separatorLine} />
            <span className={styles.separatorMark} aria-hidden="true" />
            <div className={styles.separatorLine} />
          </div>
        </div>,
        <div key="stream-entry" className={styles.streamEntry}>
          <div className={styles.entryBody}><p className={styles.entryParagraph}><span className={styles.cursor} /></p></div>
        </div>,
      )
    }
    return nodes
  }, [
    branchCustomText, branchOptions, branchTitle, entries, isGenerating, onBranchCancel,
    onBranchConfirm, onBranchSelect, onCustomInputChange, renderStart, selectedBranchOptionId,
    showGenerationCursor, unresolvedBranchIndex,
  ])

  const canTapAdvance = showAdvance && !advanceBlocked && !isGenerating
  const advanceTitle = isGenerating ? generatingText : advanceBlocked ? advanceBlockedText : advanceText
  const computedAdvanceHint = isGenerating
    ? generatingHint
    : advanceBlocked ? '当前故事仍在等待处理' : advanceHint

  return (
    <div className={[styles.timelineShell, className].filter(Boolean).join(' ')}>
      <div ref={scrollContainerRef ? undefined : internalScrollRef} className={styles.scrollMain}>
        <div className={styles.timelineInner}>
          <div data-narrative-header className={styles.timelineHeader}>
            <span className={styles.timelineHeaderLabel}>故事进程</span>
            <span className={styles.timelineHeaderRound}>第 {turnCount} 轮</span>
          </div>
          {entries.length === 0 && !showGenerationCursor ? (
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
