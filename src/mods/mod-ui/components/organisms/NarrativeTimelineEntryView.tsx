/**
 * Purpose: Render one narrative entry, its attribute changes, and optional branch editor.
 * Owner: mod-ui/narrative-timeline
 * Responsibility: Entry-level presentation only; windowing and scroll restoration remain in NarrativeTimeline.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
    setShowCustomBranchInput(false)
  }, [onBranchSelect])
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
  const handleShowCustomBranchInput = useCallback(() => {
    onBranchSelect?.(null)
    setShowCustomBranchInput(true)
  }, [onBranchSelect])

  return (
    <div className={styles.branchPending}>
      <h3 className={styles.branchPendingTitle}>🎲 {branchTitle || '命运分叉点'} 🎲</h3>
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
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}
      {showCustomBranchInput ? (
        <textarea
          ref={branchTextareaRef}
          className={styles.branchCustomInput}
          placeholder="写下你的做法……"
          value={branchCustomText ?? ''}
          onChange={(event) => {
            handleCustomInputChange(event.target.value)
            event.currentTarget.style.height = 'auto'
            event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`
          }}
          rows={3}
        />
      ) : (
        <button type="button" className={styles.branchCustomToggle} onClick={handleShowCustomBranchInput}>
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
  onDestinyPatternGrowthSelect?: (optionId: string) => void
}

function splitNarrativeParagraphs(text: string): string[] {
  // 只按模型已经给出的换行保留段落边界，不按句数或字数重排正文。
  return text.split(/\r?\n+/u).map((paragraph) => paragraph.trim()).filter(Boolean)
}

const ATTRIBUTE_PRESENTATION: Readonly<Record<string, { label: string; icon: string }>> = {
  physique: { label: '体魄', icon: '💪' },
  mind: { label: '心智', icon: '🧠' },
  talentAptitude: { label: '悟性', icon: '✨' },
  charisma: { label: '魅力', icon: '💫' },
  luck: { label: '气运', icon: '🍀' },
}

function formatAttributeBonus(
  attrBonus: Record<string, number> | undefined,
): Array<{ key: string; label: string; icon: string; value: number }> {
  return Object.entries(attrBonus ?? {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value !== 0)
    .map(([key, value]) => ({
      key,
      label: ATTRIBUTE_PRESENTATION[key]?.label ?? key,
      icon: ATTRIBUTE_PRESENTATION[key]?.icon ?? '•',
      value,
    }))
}

function AttributeBonusChips({ attrBonus }: { attrBonus: Record<string, number> | undefined }) {
  const bonuses = formatAttributeBonus(attrBonus)
  if (bonuses.length === 0) return null
  return (
    <span className={styles.growthAttributeChips} aria-label="属性变化">
      {bonuses.map(({ key, label, icon, value }) => (
        <span key={key} className={styles.growthAttributeChip}>
          <span aria-hidden="true">{icon}</span>
          <span>{label}</span>
          <strong>{value > 0 ? '+' : ''}{value}</strong>
        </span>
      ))}
    </span>
  )
}

export function NarrativeTimelineEntryView({
  entry,
  entryIndex,
  showBranchEditor,
  onDestinyPatternGrowthSelect,
  ...branchProps
}: NarrativeTimelineEntryViewProps) {
  const isEnding = entry.isDeath || entry.isLifeEnd
  const growthChoiceId = entry.destinyPatternGrowth?.choiceId
  const [pendingGrowthOptionId, setPendingGrowthOptionId] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- restore the persisted choice when a timeline entry is replaced. */
  useEffect(() => {
    setPendingGrowthOptionId(entry.destinyPatternGrowth?.selectedOptionId ?? null)
  }, [growthChoiceId, entry.destinyPatternGrowth?.selectedOptionId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedGrowthOption = entry.destinyPatternGrowth?.options.find(
    (option) => option.optionId === pendingGrowthOptionId,
  )

  return (
    <div className={[styles.entry, isEnding ? styles.entryEnding : ''].filter(Boolean).join(' ')}>
      {entry.ageLabel || entry.eraLabel ? (
        <div className={styles.entryMeta}>
          <span>{entry.ageLabel ?? entry.eraLabel}</span>
        </div>
      ) : null}
      <div className={styles.entryBody}>
        {splitNarrativeParagraphs(entry.text).map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex} className={styles.entryParagraph}>{paragraph.trim()}</p>
        ))}
      </div>
      {entry.destinyPatternGrowth ? (
        <section className={styles.growthPanel} aria-label="天赋成长">
          <header className={styles.growthHeader}>
            <div>
              <small>天赋成长</small>
              <h3>{entry.destinyPatternGrowth.result ? '此途已定' : '选择下一阶走向'}</h3>
            </div>
            <span>{entry.destinyPatternGrowth.result ? '已完成' : '三选一'}</span>
          </header>

          {entry.destinyPatternGrowth.result ? (
            <div className={styles.growthResolved}>
              <article className={styles.growthPatternSummary} data-rarity={entry.destinyPatternGrowth.source.rarity}>
                <div className={styles.growthPatternTitle}>
                  <span>{entry.destinyPatternGrowth.source.rarityLabel}</span>
                  <strong>{entry.destinyPatternGrowth.source.name}</strong>
                </div>
                <p>{entry.destinyPatternGrowth.source.description}</p>
                <small>{entry.destinyPatternGrowth.source.effect}</small>
                <AttributeBonusChips attrBonus={entry.destinyPatternGrowth.source.attrBonus} />
              </article>
              <div className={styles.growthArrow} aria-hidden="true">至</div>
              <article className={`${styles.growthPatternSummary} ${styles.growthPatternResult}`} data-rarity={entry.destinyPatternGrowth.result.rarity}>
                <div className={styles.growthPatternTitle}>
                  <span>{entry.destinyPatternGrowth.result.rarityLabel}</span>
                  <strong>{entry.destinyPatternGrowth.result.name}</strong>
                </div>
                <p>{entry.destinyPatternGrowth.result.description}</p>
                <small>{entry.destinyPatternGrowth.result.effect}</small>
                <AttributeBonusChips attrBonus={entry.destinyPatternGrowth.result.attrBonus} />
              </article>
            </div>
          ) : (
            <>
              <article className={styles.growthSource} data-rarity={entry.destinyPatternGrowth.source.rarity}>
                <div className={styles.growthPatternTitle}>
                  <span>{entry.destinyPatternGrowth.source.rarityLabel}</span>
                  <strong>{entry.destinyPatternGrowth.source.name}</strong>
                </div>
                <p>{entry.destinyPatternGrowth.source.description}</p>
                <small>{entry.destinyPatternGrowth.source.effect}</small>
                <AttributeBonusChips attrBonus={entry.destinyPatternGrowth.source.attrBonus} />
              </article>
              <div className={styles.growthOptions}>
                {entry.destinyPatternGrowth.options.map((option, optionIndex) => (
                  <button
                    key={option.optionId}
                    type="button"
                    className={`${styles.growthOption} ${pendingGrowthOptionId === option.optionId ? styles.growthOptionSelected : ''}`}
                    data-rarity={option.rarity}
                    disabled={branchProps.isGenerating}
                    aria-pressed={pendingGrowthOptionId === option.optionId}
                    onClick={() => setPendingGrowthOptionId(option.optionId)}
                  >
                    <span className={styles.growthOptionIndex}>方向 {String(optionIndex + 1).padStart(2, '0')}</span>
                    <span className={styles.growthPatternTitle}>
                      <span>{option.route} · {option.rarityLabel}</span>
                      <strong>{option.name}</strong>
                    </span>
                      <span className={styles.growthOptionDescription}>{option.description}</span>
                    <span className={styles.growthOptionEffect}>{option.effect}</span>
                    <AttributeBonusChips attrBonus={option.attrBonus} />
                  </button>
                ))}
              </div>
              <div className={styles.growthConfirmRow}>
                <span>{selectedGrowthOption ? `已暂选：${selectedGrowthOption.name}` : '请先暂选一条成长路线'}</span>
                <button
                  type="button"
                  className={styles.growthConfirmButton}
                  disabled={branchProps.isGenerating || !pendingGrowthOptionId}
                  onClick={() => {
                    if (pendingGrowthOptionId) onDestinyPatternGrowthSelect?.(pendingGrowthOptionId)
                  }}
                >
                  确认选择
                </button>
              </div>
            </>
          )}
        </section>
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
