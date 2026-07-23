'use client'

/**
 * @module NarrativeTimeline
 * @description 叙事时间线 —— 对齐废弃项目：虚拟窗口、分隔线、流式段落、故事尾部推进区
 * @mod mod-ui
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { clamp } from '@/core/shared'

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
  streamingText?: string
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  streamingHeader?: { eraLabel?: string; ageLabel?: string }
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
  // 分支选择相关
  unresolvedBranchIndex?: number | null
  branchTitle?: string
  branchOptions?: string[]
  selectedBranchOptionId?: string | null
  branchCustomText?: string
  onBranchSelect?: (optionId: string) => void
  onBranchConfirm?: () => void
  onBranchCancel?: () => void
  onCustomInputChange?: (text: string) => void
}

/** 正文契约以空行分段；保留段内单换行，避免归一化合并后再次被拆成额外段落。 */
function splitNarrativeParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)
}

export function NarrativeTimeline({
  entries,
  streamingText,
  scrollContainerRef,
  streamingHeader,
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
}: NarrativeTimelineProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? internalScrollRef
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRestoreRef = useRef(0)
  const prevTotalRef = useRef(entries.length)

  const [renderStart, setRenderStart] = useState(() => clamp(entries.length - WINDOW_SIZE, 0, Infinity))

  /* eslint-disable react-hooks/set-state-in-effect -- 事件总数变化时重置渲染窗口起点 */
  useEffect(() => {
    const total = entries.length
    if (total === 0) {
      setRenderStart(0)
      return
    }
    if (total > prevTotalRef.current) {
      setRenderStart(clamp(total - WINDOW_SIZE, 0, Infinity))
    } else {
      setRenderStart((prev) => Math.min(prev, clamp(total - WINDOW_SIZE, 0, Infinity)))
    }
    prevTotalRef.current = total
  }, [entries.length])
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadMore = () => {
    if (renderStart <= 0) return
    const container = scrollRef.current
    if (container) scrollRestoreRef.current = container.scrollHeight
    setRenderStart((prev) => clamp(prev - LOAD_MORE, 0, Infinity))
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
      const diff = container.scrollHeight - scrollRestoreRef.current
      if (diff > 0) container.scrollTop += diff
      scrollRestoreRef.current = 0
    }
  }, [renderStart, scrollRef])

  const eventElements = useMemo(() => {
    const nodes: React.ReactNode[] = []

    for (let i = renderStart; i < entries.length; i++) {
      const entry = entries[i]
      const isEnding = entry.isDeath || entry.isLifeEnd

      if (i > renderStart || renderStart > 0) {
        nodes.push(
          <div data-separator-for={i} key={`divider-${i}`}>
            <div className={styles.separator}>
              <div className={styles.separatorLine} />
              <span className={styles.separatorMark} aria-hidden="true" />
              <div className={styles.separatorLine} />
            </div>
          </div>,
        )
      }

      nodes.push(
        <div
          key={`entry-${i}`}
          className={[
            styles.entry,
            isEnding ? styles.entryEnding : '',
          ].filter(Boolean).join(' ')}
        >
          {(entry.eraLabel || entry.ageLabel) && (
            <div className={styles.entryMeta}>
              <span>{entry.eraLabel ?? ''}</span>
              {entry.ageLabel && <span className={styles.entryAge}>{entry.ageLabel}</span>}
            </div>
          )}
          <div className={styles.entryBody}>
            {splitNarrativeParagraphs(entry.text).map((paragraph, pIdx) => (
              <p key={pIdx} className={styles.entryParagraph}>{paragraph.trim()}</p>
            ))}
          </div>
          {entry.attrChanges && entry.attrChanges.length > 0 && (
            <div className={styles.attrChanges}>
              {entry.attrChanges.map((change, changeIdx) => (
                <span
                  key={`${change.label}-${changeIdx}`}
                  className={[
                    styles.attrChangeChip,
                    change.change > 0 ? styles.attrChangePositive : styles.attrChangeNegative,
                  ].join(' ')}
                >
                  {change.icon} {change.label} {change.change > 0 ? '+' : ''}{Math.round(change.change * 10) / 10}
                </span>
              ))}
            </div>
          )}
          {entry.isBranchPoint && !entry.resolvedChoice && i === unresolvedBranchIndex && (
            <div className={styles.branchPending}>
              <p className={styles.branchKicker}>命运分叉</p>
              <h3 className={styles.branchPendingTitle}>{branchTitle}</h3>
              {branchOptions.length > 0 && (
                <div className={styles.branchOptionsList}>
                  {branchOptions.map((option, optIdx) => (
                    <label key={optIdx} className={styles.branchOption}>
                      <input
                        type="radio"
                        name={`branch-${i}`}
                        className={styles.branchOptionRadio}
                        checked={selectedBranchOptionId === String(optIdx)}
                        onChange={() => onBranchSelect?.(String(optIdx))}
                      />
                      <span className={styles.branchNumber}>{String(optIdx + 1).padStart(2, '0')}</span>
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}
              <textarea
                className={styles.branchCustomInput}
                placeholder="也可以写下你的做法……"
                value={branchCustomText ?? ''}
                onChange={(e) => onCustomInputChange?.(e.target.value)}
                rows={3}
              />
              <div className={styles.branchActions}>
                <button
                  type="button"
                  className={styles.branchCancelBtn}
                  onClick={() => onBranchCancel?.()}
                >
                  清空
                </button>
                <button
                  type="button"
                  className={styles.branchConfirmBtn}
                  disabled={(selectedBranchOptionId === null || selectedBranchOptionId === undefined) && !(branchCustomText ?? '').trim()}
                  onClick={() => onBranchConfirm?.()}
                >
                  确认选择
                </button>
              </div>
            </div>
          )}
          {entry.isBranchPoint && entry.resolvedChoice && (
            <div className={styles.branchResolved}>
              <p className={styles.branchResolvedTitle}>
                命运分叉 · {entry.branchTitle ?? '你的抉择'}
              </p>
              <p className={styles.branchResolvedChoice}>
                你的选择：<span>{entry.resolvedChoice}</span>
              </p>
            </div>
          )}
        </div>,
      )
    }

    if (isGenerating) {
      nodes.push(
        <div key="stream-divider">
          <div className={styles.separator}>
            <div className={styles.separatorLine} />
            <span className={styles.separatorMark} aria-hidden="true" />
            <div className={styles.separatorLine} />
          </div>
        </div>,
      )
      nodes.push(
        <div key="stream-entry" className={styles.streamEntry}>
          {(streamingHeader?.eraLabel || streamingHeader?.ageLabel) && (
            <div className={styles.entryMeta}>
              <span>{streamingHeader?.eraLabel ?? ''}</span>
              {streamingHeader?.ageLabel && (
                <span className={styles.entryAge}>{streamingHeader.ageLabel}</span>
              )}
            </div>
          )}
          <div className={styles.entryBody}>
            {streamingText ? (
              splitNarrativeParagraphs(streamingText).map((paragraph, idx, arr) => (
                <p key={idx} className={styles.entryParagraph}>
                  {paragraph.trim()}
                  {idx === arr.length - 1 && <span className={styles.cursor} />}
                </p>
              ))
            ) : (
              <p className={styles.entryParagraph}>
                <span className={styles.cursor} />
              </p>
            )}
          </div>
        </div>,
      )
    }

    return nodes
  }, [renderStart, entries, isGenerating, streamingText, streamingHeader, unresolvedBranchIndex, branchTitle, branchOptions, selectedBranchOptionId, branchCustomText, onBranchSelect, onBranchConfirm, onBranchCancel, onCustomInputChange])

  const canTapAdvance = showAdvance && !advanceBlocked && !isGenerating
  const advanceTitle = isGenerating
    ? '命书正在续写……'
    : advanceBlocked
      ? advanceBlockedText
      : advanceText
  const computedAdvanceHint = isGenerating
    ? '下一段人生正在生成'
    : advanceBlocked
      ? '当前故事仍在等待处理'
      : advanceHint

  const advanceControl = showAdvance ? (
    <div className={styles.advanceDock}>
      <div className={styles.advanceArea}>
        {hasEndingEvent ? (
          <button type="button" className={styles.settleBtn} onClick={onGoToGameOver}>
            <strong>前往人生结算</strong>
            <small>这一生的轨迹已经写完</small>
          </button>
        ) : (
          <button
            type="button"
            className={[
              styles.advanceTap,
              isGenerating
                ? styles.advanceGenerating
                : advanceBlocked
                  ? styles.advanceBlocked
                  : styles.advanceIdle,
            ].join(' ')}
            disabled={!canTapAdvance}
            onClick={onAdvance}
          >
            <span className={styles.advanceText}>
              <strong>{advanceTitle}</strong>
              <small>{computedAdvanceHint}</small>
            </span>
          </button>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className={[styles.timelineShell, className].filter(Boolean).join(' ')}>
      <div ref={scrollContainerRef ? undefined : internalScrollRef} className={styles.scrollMain}>
        <div className={styles.timelineInner}>
          <div data-narrative-header className={styles.timelineHeader}>
            <span className={styles.timelineHeaderLabel}>故事进程</span>
            <span className={styles.timelineHeaderRound}>第 {turnCount} 轮</span>
          </div>

          {entries.length === 0 && !isGenerating && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>卷首</div>
              <p>这一生尚未落笔</p>
              <p className={styles.emptyHint}>轻触下方，让第一段岁月开始</p>
            </div>
          )}

          {renderStart > 0 && (
            <div ref={sentinelRef} className={styles.loadMore} onClick={loadMore} role="button" tabIndex={0}>
              向上回望更早的 {renderStart} 段人生
            </div>
          )}

          {eventElements}
          {advanceControl}
        </div>
      </div>
    </div>
  )
}
