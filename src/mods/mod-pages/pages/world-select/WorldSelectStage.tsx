import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

function getWorldMark(name: string | undefined) {
  return Array.from(name?.trim() ?? '').find((character) => /[\p{L}\p{N}]/u.test(character)) ?? '界'
}

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
  const sourceLabel = world ? (isSaved ? '已保存' : '预设') : '待选择'
  const challengeLabel = logic.selectedDifficultyLabel
  const eraLabel = getWorldEraLabel(world)

  return (
    <section className={`${styles.stage} ${world ? styles.stageSelected : ''}`} aria-live="polite">
      <span className={styles.stageIcon} aria-hidden="true">{getWorldMark(world?.name)}</span>
      <div className={styles.stageCopy}>
        <h2 className={styles.stageTitle}>{world?.name ?? '尚未选择世界'}</h2>
        <p className={styles.stageEra}>
          {world ? `${eraLabel} · ${sourceLabel}世界` : '从已保存、预设或自定义世界中选择'}
        </p>
      </div>
      <div className={styles.ruleGrid}>
        <div className={styles.ruleItem}>
          <span>来源</span>
          <strong>{sourceLabel}</strong>
        </div>
        <div className={styles.ruleItem}>
          <span>年代</span>
          <strong>{eraLabel}</strong>
        </div>
        <div className={styles.ruleItem}>
          <span>难度</span>
          <strong>{challengeLabel}</strong>
        </div>
      </div>
      <div className={styles.ruleSummary}>
        <span>世界规则摘要</span>
        <p>{world ? world.summary || world.description : '选择世界后，这里会展示决定人生可能性的核心规则。'}</p>
      </div>
    </section>
  )
}
