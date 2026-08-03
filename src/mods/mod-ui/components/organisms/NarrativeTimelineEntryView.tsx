/**
 * Purpose: Render one narrative entry, its attribute changes, and optional branch editor.
 * Owner: mod-ui/narrative-timeline
 * Responsibility: Entry-level presentation only; windowing and scroll restoration remain in NarrativeTimeline.
 */

'use client'

import { useCallback, useRef, useState } from 'react'

import type { NarrativeEntry } from './NarrativeTimeline'
import styles from './NarrativeTimeline.module.css'

interface BranchEditorProps {
  branchTitle?: string
  branchOptions: string[]
  selectedBranchOptionId?: string | null
  branchCustomText?: string
  isGenerating: boolean
  onBranchSelect?: (optionId: string | null) => void
  onBranchConfirm?: () => void
  onBranchCancel?: () => void
  onCustomInputChange?: (text: string) => void
}

interface NarrativeBranchEditorProps extends BranchEditorProps {
  entryIndex: number
}

function NarrativeBranchEditor({
  entryIndex,
  branchTitle,
  branchOptions,
  selectedBranchOptionId,
  branchCustomText,
  isGenerating,
  onBranchSelect,
  onBranchConfirm,
  onBranchCancel,
  onCustomInputChange,
}: NarrativeBranchEditorProps) {
  const branchTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [showCustomBranchInput, setShowCustomBranchInput] = useState(false)
  const handleBranchOptionSelect = useCallback((optionId: string) => {
    branchTextareaRef.current?.blur()
    onBranchSelect?.(optionId)
    onCustomInputChange?.('')
    setShowCustomBranchInput(false)
  }, [onBranchSelect, onCustomInputChange])
  const handleCustomInputChange = useCallback((text: string) => {
    onCustomInputChange?.(text)
    if (text.trim() && selectedBranchOptionId !== null && selectedBranchOptionId !== undefined) {
      onBranchSelect?.(null)
    }
  }, [onBranchSelect, onCustomInputChange, selectedBranchOptionId])
  const selectedBranchLabel = selectedBranchOptionId !== null && selectedBranchOptionId !== undefined
    ? branchOptions[Number(selectedBranchOptionId)]
    : undefined
  const branchConfirmLabel = selectedBranchLabel
    ? `确认「${selectedBranchLabel}」`
    : (branchCustomText ?? '').trim() ? '确认写下做法' : '请先选择'

  return (
    <div className={styles.branchPending}>
      <p className={styles.branchKicker}>命运分叉</p>
      <h3 className={styles.branchPendingTitle}>{branchTitle}</h3>
      {branchOptions.length > 0 ? (
        <div className={styles.branchOptionsList}>
          {branchOptions.map((option, optionIndex) => (
            <label key={optionIndex} className={styles.branchOption} onClick={() => handleBranchOptionSelect(String(optionIndex))}>
              <input
                type="radio"
                name={`branch-${entryIndex}`}
                className={styles.branchOptionRadio}
                checked={selectedBranchOptionId === String(optionIndex)}
                onChange={() => handleBranchOptionSelect(String(optionIndex))}
              />
              <span className={styles.branchNumber}>{String(optionIndex + 1).padStart(2, '0')}</span>
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}
      {showCustomBranchInput || Boolean((branchCustomText ?? '').trim()) ? (
        <textarea
          ref={branchTextareaRef}
          className={styles.branchCustomInput}
          placeholder="写下你的做法……"
          value={branchCustomText ?? ''}
          onChange={(event) => handleCustomInputChange(event.target.value)}
          rows={3}
        />
      ) : (
        <button type="button" className={styles.branchCustomToggle} onClick={() => setShowCustomBranchInput(true)}>
          写下自己的做法
        </button>
      )}
      <div className={styles.branchActions}>
        <button type="button" className={styles.branchCancelBtn} onClick={() => { setShowCustomBranchInput(false); onBranchCancel?.() }}>清空</button>
        <button
          type="button"
          className={styles.branchConfirmBtn}
          disabled={isGenerating || ((selectedBranchOptionId === null || selectedBranchOptionId === undefined) && !(branchCustomText ?? '').trim())}
          onClick={() => { branchTextareaRef.current?.blur(); onBranchConfirm?.() }}
        >
          {branchConfirmLabel}
        </button>
      </div>
    </div>
  )
}

interface NarrativeTimelineEntryViewProps extends BranchEditorProps {
  entry: NarrativeEntry
  entryIndex: number
  showBranchEditor: boolean
}

function splitNarrativeParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)
}

export function NarrativeTimelineEntryView({
  entry,
  entryIndex,
  showBranchEditor,
  ...branchProps
}: NarrativeTimelineEntryViewProps) {
  const isEnding = entry.isDeath || entry.isLifeEnd
  return (
    <div className={[styles.entry, isEnding ? styles.entryEnding : ''].filter(Boolean).join(' ')}>
      {entry.eraLabel || entry.ageLabel ? (
        <div className={styles.entryMeta}>
          <span>{entry.eraLabel ?? ''}</span>
          {entry.ageLabel ? <span className={styles.entryAge}>{entry.ageLabel}</span> : null}
        </div>
      ) : null}
      <div className={styles.entryBody}>
        {splitNarrativeParagraphs(entry.text).map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex} className={styles.entryParagraph}>{paragraph.trim()}</p>
        ))}
      </div>
      {entry.attrChanges && entry.attrChanges.length > 0 ? (
        <div className={styles.attrChanges}>
          {entry.attrChanges.map((change, changeIndex) => (
            <span
              key={`${change.label}-${changeIndex}`}
              className={[styles.attrChangeChip, change.change > 0 ? styles.attrChangePositive : styles.attrChangeNegative].join(' ')}
            >
              {change.icon} {change.label} {change.change > 0 ? '+' : ''}{Math.round(change.change * 10) / 10}
            </span>
          ))}
        </div>
      ) : null}
      {entry.isBranchPoint && !entry.resolvedChoice && showBranchEditor ? (
        <NarrativeBranchEditor key={entryIndex} entryIndex={entryIndex} {...branchProps} />
      ) : null}
      {entry.isBranchPoint && entry.resolvedChoice ? (
        <div className={styles.branchResolved}>
          <p className={styles.branchResolvedTitle}>命运分叉 · {entry.branchTitle ?? '你的抉择'}</p>
          <p className={styles.branchResolvedChoice}>你的选择：<span>{entry.resolvedChoice}</span></p>
        </div>
      ) : null}
    </div>
  )
}
