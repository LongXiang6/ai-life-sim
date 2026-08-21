/**
 * Purpose: Render the optional settlement reincarnation-promotion selection and result.
 * Owner: mod-pages/game-over
 * Responsibility: Promotion-result presentation only; promotion execution and persistence remain in the page.
 */

import {
  DESTINY_PATTERN_RARITY_CONFIG,
  getReincarnationPromotionTargetRarity,
  type DestinyPatternRarity,
} from '@/mods/mod-character'

import styles from './GameOver.module.css'
import type { PromotionCandidate } from './useGameOverArtifacts'

interface PromotedTalentView {
  name: string
  description: string
  effect: string
  rarity: DestinyPatternRarity
  strengthenLevel: number
}

function getPromotionLabel(candidate: PromotionCandidate): string {
  const currentLabel = DESTINY_PATTERN_RARITY_CONFIG[candidate.rarity].label
  if (candidate.rarity === 'mythic') {
    return `${currentLabel}强化 ${candidate.strengthenLevel} → ${candidate.strengthenLevel + 1}`
  }
  const targetRarity = getReincarnationPromotionTargetRarity(candidate.rarity)
  return `${currentLabel} → ${DESTINY_PATTERN_RARITY_CONFIG[targetRarity].label}`
}

interface GameOverMythicSectionProps {
  candidates: PromotionCandidate[]
  effectiveIndex: number
  error: string
  promoting: boolean
  promotedTalent?: PromotedTalentView | null
  strengthLabel: string
  onPromote: () => void
  onSelect: (index: number) => void
}

export function GameOverMythicSection(props: GameOverMythicSectionProps) {
  const { candidates, effectiveIndex, promotedTalent } = props
  const activeCandidate = candidates[effectiveIndex] ?? null
  const displayedTalent = promotedTalent ?? activeCandidate
  const promotionFailed = Boolean(
    promotedTalent
    && activeCandidate?.rarity === 'mythic'
    && promotedTalent.strengthenLevel < activeCandidate.strengthenLevel,
  )
  return (
    <section className={styles.mythicSection} aria-labelledby="mythic-title">
      <p className={styles.ritualDivider} aria-hidden="true">✦</p>
      <h2 id="mythic-title" className={styles.blockTitle}>轮回天赋</h2>
      <p className={styles.mythicIntro}>从本局最终携带的四项词条中选择一项升一级，写入跨世界轮回天赋库。神话词条会继续强化，升阶可选。</p>
      {candidates.length > 0 ? (
        <>
          <div className={styles.mythicSelectors} role="list" aria-label="可升阶词条">
            {candidates.map((candidate, index) => (
              <button
                type="button"
                key={candidate.id}
                className={`${styles.mythicSelector} ${!promotedTalent && effectiveIndex === index ? styles.mythicSelectorActive : ''}`}
                aria-pressed={!promotedTalent && effectiveIndex === index}
                onClick={() => { if (!promotedTalent && !props.promoting) props.onSelect(index) }}
                disabled={Boolean(promotedTalent || props.promoting)}
              >
                <span aria-hidden="true">{candidate.name.slice(0, 1)}</span>
                <strong>{candidate.name}</strong>
              </button>
            ))}
          </div>
          {displayedTalent && activeCandidate ? (
            <div className={styles.mythicFocus} aria-live="polite">
              <span className={styles.mythicGlyph} aria-hidden="true">{displayedTalent.name.slice(0, 1)}</span>
              <div>
                <small>{promotedTalent
                  ? `${DESTINY_PATTERN_RARITY_CONFIG[promotedTalent.rarity].label}${promotedTalent.rarity === 'mythic' ? ` · 强化 ${promotedTalent.strengthenLevel}` : ''}`
                  : getPromotionLabel(activeCandidate)} · {displayedTalent.description}</small>
                <h3>{displayedTalent.name}</h3>
                <p>{displayedTalent.effect}</p>
              </div>
            </div>
          ) : null}
          <div className={styles.mythicCurrent}>
            <span>{promotedTalent ? promotionFailed ? '强化失败并异变' : '已升阶' : '当前选择'}</span>
            <strong>{promotedTalent?.name ?? activeCandidate?.name ?? '尚未选择'}</strong>
          </div>
          <button
            type="button"
            className={styles.mythicStore}
            onClick={props.onPromote}
            disabled={!activeCandidate || Boolean(promotedTalent) || props.promoting}
            aria-busy={props.promoting}
          >
          <span>{promotedTalent ? promotionFailed ? '异变结果已写入轮回天赋库' : '已写入轮回天赋库' : props.promoting ? '正在升阶…' : '升阶为轮回天赋'}</span>
          <small>{promotedTalent ? promotionFailed ? `强化等级退至 +${promotedTalent.strengthenLevel}，异变不可逆` : '下一局可在携带槽中选用' : `按「${props.strengthLabel}」档位强化，写入跨世界轮回库`}</small>
          </button>
        </>
      ) : (
        <div className={styles.mythicLoadingCard} aria-live="polite">
          <span className={styles.mythicLoadingGlyph} aria-hidden="true">升</span>
          <div>
            <h3>{promotedTalent ? promotionFailed ? '强化失败并异变' : '已升阶' : '没有可升阶的词条'}</h3>
            <p>{promotedTalent ? '轮回天赋已写入跨世界总库。' : '本局没有可升阶的最终携带词条，可直接开启新人生。'}</p>
          </div>
        </div>
      )}
      {props.error ? <p className={styles.mythicError} role="alert">{props.error}</p> : null}
    </section>
  )
}
