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
  const isSaved = Boolean(world?.id.startsWith('custom-'))
  const sourceLabel = world ? (isSaved ? '已保存' : '预设世界') : '待选择'
  const challengeLabel = logic.selectedDifficultyLabel
  const eraLabel = getWorldEraLabel(world)
  return (
    <section className={`${styles.stage} ${world ? styles.stageSelected : ''}`} aria-live="polite" aria-label="当前世界规则摘要">
      <section className={styles.difficultySection} aria-label="人生难度">
        <button
          type="button"
          className={styles.difficultyOptions}
          onClick={logic.handleCycleDifficulty}
          aria-label={`切换人生难度，当前${challengeLabel}`}
          disabled={logic.isConfirming}
        >
          <span>难度</span>
          <strong className={styles.difficultyActive}>{challengeLabel}</strong>
          <svg className={styles.difficultyArrow} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>
      </section>
      <div className={styles.stageCopy}>
        <div className={styles.focusTop}>
          <span className={styles.stageSource}>{sourceLabel === '已保存' ? '保存世界' : sourceLabel === '预设世界' ? '预设世界' : sourceLabel}</span>
          <span className={styles.focusIndex}>当前选择</span>
        </div>
        <h2 className={styles.stageTitle}>{world?.name ?? '尚未选择'}</h2>
        <p className={styles.stageEra}>
          {world ? eraLabel : '等待选择'}
        </p>
      </div>
      <div className={styles.ruleSummary}>
        <span>规则摘要</span>
        <p>{world ? world.summary || world.description : '选择或写下一方世界，作为这段人生的开端。'}</p>
      </div>
      <div className={styles.ruleGrid} aria-label="世界概览">
        <div className={styles.ruleItem}>
          <span>来源</span>
          <strong>{sourceLabel}</strong>
        </div>
        <div className={styles.ruleItem}>
          <span>年代</span>
          <strong>{eraLabel.split('·')[0]}</strong>
        </div>
        <div className={styles.ruleItem}>
          <span>难度</span>
          <strong>{challengeLabel}</strong>
        </div>
      </div>
    </section>
  )
}
