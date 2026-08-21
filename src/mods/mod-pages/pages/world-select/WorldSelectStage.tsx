/** Purpose: Render the finalized focused-world stage. Owner: mod-pages. Responsibility: Selected-world and difficulty presentation only. */

import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

function getWorldEraLabel(world: WorldSelectLogic['selectedWorld']) {
  if (!world) return '—'

  const era = world.era.trim()
  const eraStartYear = world.config.eraStartYear
  if (
    world.id.startsWith('custom-')
    && typeof eraStartYear === 'number'
    && Number.isFinite(eraStartYear)
    && eraStartYear < 0
    && era.startsWith('公元')
    && !era.startsWith('公元前')
  ) {
    return `公元前${era.slice(2)}`
  }

  return era || '待确定'
}

export function WorldSelectStage({ logic }: { logic: WorldSelectLogic }) {
  const world = logic.selectedWorld
  const challengeLabel = logic.selectedDifficultyLabel
  const eraLabel = getWorldEraLabel(world)
  const difficultyEmoji = challengeLabel === '普通'
    ? '⚖️'
    : challengeLabel === '困难'
      ? '🔥'
      : challengeLabel === '噩梦'
        ? '🌑'
        : '👑'

  return (
    <section className={`${styles.stage} ${world ? styles.stageSelected : ''}`} aria-live="polite" aria-label="当前世界">
      <button
        type="button"
        className={styles.difficultyButton}
        onClick={logic.handleCycleDifficulty}
        aria-label={`切换人生基调，当前${challengeLabel}`}
        disabled={logic.isConfirming}
      >
        <span className={styles.difficultyEmoji} aria-hidden="true">{difficultyEmoji}</span>
        <span className={styles.difficultyLabel}>{challengeLabel}</span>
      </button>
      <span className={styles.stageIcon} data-semantic-emoji aria-hidden="true">{world?.icon ?? '✦'}</span>
      <h2 className={styles.stageTitle}>{world?.name ?? '尚未选择'}</h2>
      <span className={styles.stageQuote}>{world ? world.summary || world.description : '选择一方世界，写下此生命途。'}</span>
      <p className={styles.stageEra}>{world ? eraLabel : '等待选择'}</p>
    </section>
  )
}
