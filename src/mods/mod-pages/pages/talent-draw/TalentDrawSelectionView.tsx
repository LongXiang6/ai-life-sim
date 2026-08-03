/**
 * Purpose: Render mythic slots, selected slots, and ordinary destiny-pattern candidates.
 * Owner: mod-pages/talent-draw
 * Responsibility: Selection-stage presentation and command forwarding only.
 */

import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  DESTINY_PATTERN_RARITY_CONFIG,
  DESTINY_PATTERN_SELECT_COUNT,
  MYTHIC_PATTERN_SELECT_COUNT,
  formatPatternSystemModifiersForDisplay,
} from '@/mods/mod-character'
import { cn } from '@/foundation/utils'

import type { RefObject } from 'react'
import type { MythicPattern } from '@/mods/mod-character'
import type { TalentDrawSlots } from './talent-draw.types'
import { formatPatternAttrSummary } from './talent-draw-patterns'
import { FlowIcon } from './TalentFlowArt'
import styles from './TalentDraw.module.css'

interface TalentDrawSelectionViewProps {
  activeMythicSlot: number
  equippedMythicPatterns: MythicPattern[]
  errorMsg: string
  isRegenerating: boolean
  libraryTriggerRef: RefObject<HTMLButtonElement | null>
  onCandidateClick: (index: number) => void
  onDeselect: (index: number) => void
  onOpenMythicSlot: (index: number) => void
  onRedraw: () => void
  onToggleMythic: (pattern: MythicPattern) => void
  reDrawDisabled: boolean
  selectedDataCount: number
  selectedSlotIndices: number[]
  selectedUiSlots: Array<number | null>
  slots: TalentDrawSlots
}

export function TalentDrawSelectionView({
  activeMythicSlot,
  equippedMythicPatterns,
  errorMsg,
  isRegenerating,
  libraryTriggerRef,
  onCandidateClick,
  onDeselect,
  onOpenMythicSlot,
  onRedraw,
  onToggleMythic,
  reDrawDisabled,
  selectedDataCount,
  selectedSlotIndices,
  selectedUiSlots,
  slots,
}: TalentDrawSelectionViewProps) {
  return (
    <section className={styles.selectionView} aria-label="命格选择">
      <div className={styles.rebirthHeading}>
        <span>轮回 · 可选</span>
        <span>{equippedMythicPatterns.length} / {MYTHIC_PATTERN_SELECT_COUNT}</span>
      </div>
      <div className={styles.rebirthSlots} aria-label="已选择的轮回天赋">
        {Array.from({ length: MYTHIC_PATTERN_SELECT_COUNT }, (_, slotIndex) => {
          const pattern = equippedMythicPatterns[slotIndex]
          return (
            <button
              type="button"
              key={`rebirth-slot-${slotIndex}`}
              ref={slotIndex === activeMythicSlot ? libraryTriggerRef : undefined}
              className={cn(styles.rebirthSlot, pattern && styles.rebirthSlotFilled)}
              onClick={() => pattern ? onToggleMythic(pattern) : onOpenMythicSlot(slotIndex)}
              aria-label={pattern ? `移除轮回天赋：${pattern.name}` : `轮回天赋槽${slotIndex + 1}，打开天赋库`}
            >
              <strong>{pattern?.name ?? '+'}</strong>
            </button>
          )
        })}
      </div>
      <div className={styles.slotHeading}>
        <span>普通命格</span>
        <span>{selectedDataCount} / {DESTINY_PATTERN_SELECT_COUNT}</span>
      </div>
      <div className={styles.selectedSlots} aria-label="已选普通命格">
        {selectedUiSlots.map((patternIndex, uiSlotIndex) => {
          const pattern = patternIndex === null ? null : slots[patternIndex]
          const rarityLabel = pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : undefined
          return (
            <button
              type="button"
              key={`selected-ui-slot-${uiSlotIndex}`}
              className={cn(styles.selectedSlot, pattern && styles.selectedSlotFilled)}
              data-rarity={rarityLabel}
              onClick={() => onDeselect(uiSlotIndex)}
              aria-label={pattern ? `移除普通命格：${pattern.name}` : `普通命格槽${uiSlotIndex + 1}，空`}
            >
              <strong>{pattern?.name ?? '+'}</strong>
            </button>
          )
        })}
      </div>
      <div className={styles.candidateHead}>
        <strong>普通命格候选 <small>{slots.filter(Boolean).length} / {DESTINY_PATTERN_DISPLAY_COUNT} 条</small></strong>
        <button type="button" className={styles.reroll} onClick={onRedraw} disabled={reDrawDisabled} aria-label="重新抽取未选择的普通命格">
          <FlowIcon name="shuffle" /><span>{isRegenerating ? '刷新中…' : '重抽未选'}</span>
        </button>
      </div>
      <div className={styles.candidateList} aria-label="普通命格候选">
        {slots.map((pattern, index) => {
          const selected = selectedSlotIndices.includes(index)
          const rarity = pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : undefined
          const attributeSummary = pattern ? formatPatternAttrSummary(pattern) : '无属性加成'
          const systemEffects = pattern
            ? formatPatternSystemModifiersForDisplay(pattern.systemModifiers).map((item) => item.display)
            : []
          return (
            <button
              type="button"
              key={pattern?.id ?? `candidate-pending-${index}`}
              className={cn(styles.candidateCard, selected && styles.candidateCardSelected, !pattern && styles.candidateCardPending)}
              data-rarity={rarity}
              disabled={!pattern}
              onClick={() => onCandidateClick(index)}
              aria-pressed={selected}
              aria-label={pattern ? `${pattern.name}${selected ? '，已选择' : '，选择普通命格'}` : `普通命格候选 ${index + 1} 正在生成`}
            >
              {pattern ? (
                <>
                  <span className={styles.candidateCopy}>
                    <strong>{pattern.name}</strong>
                    <span>{pattern.description}</span>
                    {pattern.effect ? <i>{pattern.effect}</i> : null}
                  </span>
                  <small className={styles.candidateRarity}>{rarity}</small>
                  <span className={styles.candidateEffects}>
                    {attributeSummary !== '无属性加成' ? <i>{attributeSummary}</i> : null}
                    {systemEffects.map((effect) => <i key={effect} className={styles.systemEffect}>{effect}</i>)}
                  </span>
                </>
              ) : <span className={styles.candidatePendingCopy}>候选 {String(index + 1).padStart(2, '0')} · 后台生成中</span>}
            </button>
          )
        })}
      </div>
      {errorMsg ? <p className={styles.validationMsg} role="alert">{errorMsg}</p> : null}
    </section>
  )
}
