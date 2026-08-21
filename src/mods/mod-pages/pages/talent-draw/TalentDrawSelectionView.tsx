/**
 * Purpose: Render the five-tab pattern browser and shared four-slot loadout.
 * Owner: mod-pages/talent-draw
 * Responsibility: Selection-stage presentation and command forwarding only.
 */

import { useMemo, useState } from 'react'

import {
  DESTINY_PATTERN_RARITY_CONFIG,
  PATTERN_LOADOUT_SLOT_COUNT,
} from '@/mods/mod-character'
import { cn } from '@/foundation/utils'

import type { DestinyPattern, ReincarnationTalent } from '@/mods/mod-character'
import type {
  ResolvedTalentLoadoutEntry,
  TalentDrawTab,
} from './talent-draw.types'
import { formatPatternAttrSummary } from './talent-draw-patterns'
import { FlowIcon } from './TalentFlowArt'
import styles from './TalentDraw.module.css'

const TABS: ReadonlyArray<{ id: TalentDrawTab; label: string }> = [
  { id: 'battle', label: '战斗' },
  { id: 'exploration', label: '探索' },
  { id: 'social', label: '社交' },
  { id: 'production', label: '生产' },
  { id: 'mythic', label: '轮回天赋' },
]

interface TalentDrawSelectionViewProps {
  errorMsg: string
  isRegenerating: boolean
  mythicLibrary: ReincarnationTalent[]
  onCandidateClick: (patternId: string) => void
  onDeselect: (index: number) => void
  onMythicClick: (pattern: ReincarnationTalent) => void
  onRedraw: () => void
  reDrawDisabled: boolean
  resolvedLoadoutSlots: Array<ResolvedTalentLoadoutEntry | null>
  selectedDataCount: number
  selectedDestinyIds: Set<string>
  selectedMythicIds: Set<string>
  candidatePool: DestinyPattern[]
}

export function TalentDrawSelectionView({
  errorMsg,
  isRegenerating,
  mythicLibrary,
  onCandidateClick,
  onDeselect,
  onMythicClick,
  onRedraw,
  reDrawDisabled,
  resolvedLoadoutSlots,
  selectedDataCount,
  selectedDestinyIds,
  selectedMythicIds,
  candidatePool,
}: TalentDrawSelectionViewProps) {
  const [activeTab, setActiveTab] = useState<TalentDrawTab>('battle')
  const ordinaryCandidates = useMemo(() => candidatePool.flatMap((pattern) => (
    pattern.category === activeTab ? [{ pattern }] : []
  )), [activeTab, candidatePool])
  const activeLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? ''

  return (
    <section className={styles.selectionView} aria-label="命格选择">
      <section className={styles.progressBar} aria-label="命格携带槽">
        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>
            携带命格 <b>{selectedDataCount} / {PATTERN_LOADOUT_SLOT_COUNT}</b>
          </span>
          {resolvedLoadoutSlots.map((entry, slotIndex) => {
            const rarityLabel = entry?.kind === 'destiny'
              ? DESTINY_PATTERN_RARITY_CONFIG[entry.pattern.rarity].label
              : undefined
            return (
              <button
                type="button"
                key={`loadout-slot-${slotIndex}`}
                className={cn(
                  styles.selectedSlot,
                  entry && styles.selectedSlotFilled,
                  entry?.kind === 'mythic' && styles.selectedSlotMythic,
                )}
                data-kind={entry?.kind}
                data-rarity={rarityLabel}
                onClick={() => onDeselect(slotIndex)}
                aria-label={entry ? `移除${entry.kind === 'mythic' ? '轮回天赋' : '普通命格'}：${entry.pattern.name}` : `命格携带槽${slotIndex + 1}，空`}
              >
                <strong>{entry?.pattern.name ?? '+'}</strong>
              </button>
            )
          })}
        </div>
      </section>

      <div className={styles.categoryTabs} role="tablist" aria-label="命格类别">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={cn(styles.categoryTab, activeTab === tab.id && styles.categoryTabActive)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="talent-category-panel"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        id="talent-category-panel"
        className={styles.candidateBand}
        role="tabpanel"
        aria-label={`${activeLabel}候选`}
      >
        <div className={styles.candidateHead}>
          <strong>
            {activeLabel}
            <small>{activeTab === 'mythic' ? `${mythicLibrary.length} 项` : `${ordinaryCandidates.length} 条`}</small>
          </strong>
          {activeTab !== 'mythic' ? (
            <button type="button" className={styles.reroll} onClick={onRedraw} disabled={reDrawDisabled} aria-label="重新生成四类普通命格">
              <FlowIcon name="shuffle" /><span>{isRegenerating ? '生成中…' : '重新抽取'}</span>
            </button>
          ) : null}
        </div>

        <div className={styles.candidateList} aria-label={`${activeLabel}候选列表`}>
          {activeTab === 'mythic' ? mythicLibrary.map((pattern) => {
            const selected = selectedMythicIds.has(pattern.id)
            return (
              <button
                type="button"
                key={pattern.id}
                className={cn(styles.candidateCard, styles.candidateCardMythic, selected && styles.candidateCardSelected)}
                data-kind="mythic"
                onClick={() => onMythicClick(pattern)}
                aria-pressed={selected}
                aria-label={`${pattern.name}${selected ? '，已携带' : '，选择轮回天赋'}`}
              >
                <span className={styles.candidateCopy}>
                  <strong>{pattern.name}</strong>
                  <span>{pattern.description}</span>
                  <i>{pattern.effect}</i>
                </span>
              </button>
            )
          }) : ordinaryCandidates.map(({ pattern }) => {
            const selected = selectedDestinyIds.has(pattern.id)
            const rarity = DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label
            const attributeSummary = formatPatternAttrSummary(pattern)
            return (
              <button
                type="button"
                key={pattern.id}
                className={cn(styles.candidateCard, selected && styles.candidateCardSelected)}
                data-rarity={rarity}
                onClick={() => onCandidateClick(pattern.id)}
                aria-pressed={selected}
                aria-label={`${pattern.name}${selected ? '，已携带' : '，选择普通命格'}`}
              >
                <span className={styles.candidateCopy}>
                  <strong>{pattern.name}</strong>
                  <span>{pattern.description}</span>
                  {pattern.effect ? <i>{pattern.effect}</i> : null}
                </span>
                {attributeSummary !== '无属性加成' ? (
                  <span className={styles.candidateEffects}><i>{attributeSummary}</i></span>
                ) : null}
              </button>
            )
          })}
          {activeTab === 'mythic' && mythicLibrary.length === 0 ? (
            <p className={styles.candidateEmpty}>尚未在人生结算中升阶轮回天赋。</p>
          ) : null}
        </div>
      </section>
      {errorMsg ? <p className={styles.validationMsg} role="alert">{errorMsg}</p> : null}
    </section>
  )
}
