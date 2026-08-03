/**
 * Purpose: Render the identity, dimension, record, review, and achievement sections of game over.
 * Owner: mod-pages/game-over
 * Responsibility: Read-only overview presentation only; scoring and selection state remain in the page.
 */

import type { RadarDimension } from '@/mods/mod-ui'

import type { LifeRecord } from './game-over-life-records'
import { GAME_OVER_DIMENSION_ICONS, GameOverRadar } from './GameOverRadar'
import styles from './GameOver.module.css'

interface AchievementView {
  id: string
  kind: string
  title: string
  detail: string
  timeLabel: string
}

interface RepetitionStatsView {
  recentAverageWordRepeatRate: number
  maxWordRepeatRate: number
  highRepeatRounds: number
  trend: string
}

interface GameOverOverviewSectionsProps {
  achievements: AchievementView[]
  activeDimension: RadarDimension
  activeDimensionIndex: number
  ageLabel: string
  characterName: string
  dimensions: RadarDimension[]
  lifeRecords: LifeRecord[]
  lifeSummary: string
  moralityLabel: string
  overallScore: number
  rounds: number
  sealCharacter: string
  storyRepetitionStats: RepetitionStatsView
  worldviewId: number | string | null
  worldName: string
  onSelectDimension: (index: number) => void
}

export function GameOverOverviewSections({
  achievements,
  activeDimension,
  activeDimensionIndex,
  ageLabel,
  characterName,
  dimensions,
  lifeRecords,
  lifeSummary,
  moralityLabel,
  overallScore,
  rounds,
  sealCharacter,
  storyRepetitionStats,
  worldviewId,
  worldName,
  onSelectDimension,
}: GameOverOverviewSectionsProps) {
  return (
    <>
      <section className={styles.identity} aria-label="角色人生概览">
        <div className={styles.identitySeal} aria-hidden="true">{sealCharacter}</div>
        <div className={styles.identityCopy}>
          <h2>{characterName || '无名之辈'}</h2>
          <p>{worldName} · {ageLabel} · {rounds} 轮世事</p>
        </div>
        <div className={styles.score}><strong>{overallScore}</strong><span>人生评分</span></div>
      </section>

      <section className={styles.section} aria-labelledby="dimensions-title">
        <div className={styles.sectionHeading}>
          <div><span className={styles.sectionIndex}>01</span><h2 id="dimensions-title">世界维度</h2></div>
          <p>点击维度查看本地评分依据</p>
        </div>
        <div className={styles.radarSection}>
          <GameOverRadar dimensions={dimensions} activeIndex={activeDimensionIndex} overallScore={overallScore} onSelect={onSelectDimension} />
        </div>
        <p className={styles.metricComment} aria-live="polite">
          <span><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">{GAME_OVER_DIMENSION_ICONS[activeDimension.label] ?? '◇'}</span>{activeDimension.label}</span>
          <strong>{activeDimension.comment}</strong>
        </p>
      </section>

      <section className={styles.section} aria-labelledby="records-title">
        <div className={styles.sectionHeading}>
          <div><span className={styles.sectionIndex}>02</span><h2 id="records-title">人生三记</h2></div>
          <p>从现有叙事历史取样，不新增剧情判断</p>
        </div>
        {lifeRecords.length > 0 ? (
          <div className={styles.recordList}>
            {lifeRecords.map((record) => (
              <article key={record.id} className={styles.record}>
                <div className={styles.recordMeta}>
                  <strong>{record.stage}</strong>
                  <span>{record.timeLabel}{record.ageLabel ? ` · ${record.ageLabel}` : ''}</span>
                </div>
                <p title={record.text}>{record.text}</p>
              </article>
            ))}
          </div>
        ) : <p className={styles.emptyState}>此生尚无可展示的叙事记录。</p>}
        <div className={styles.summaryBlock}>
          <span>此生评语</span>
          <p>{lifeSummary}</p>
          <div className={styles.summaryMeta}>
            <span>{moralityLabel}</span><span>{rounds} 轮世事</span><span>{ageLabel}</span>
            {worldviewId !== null && worldviewId !== undefined ? <span>世界编号 {worldviewId}</span> : null}
          </div>
          <div className={styles.repetitionSummary} aria-label="故事重复率统计">
            <span>故事重复观测</span>
            <strong>近五轮均值 {Math.round(storyRepetitionStats.recentAverageWordRepeatRate * 100)}%</strong>
            <span>整局峰值 {Math.round(storyRepetitionStats.maxWordRepeatRate * 100)}%</span>
            <span>高重复 {storyRepetitionStats.highRepeatRounds} 轮 · {storyRepetitionStats.trend === 'rising' ? '近期上升' : storyRepetitionStats.trend === 'falling' ? '近期下降' : '近期平稳'}</span>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="achievements-title">
        <div className={styles.sectionHeading}>
          <div><span className={styles.sectionIndex}>03</span><h2 id="achievements-title">此生大事</h2></div>
          <p>{achievements.length} 项真实里程碑</p>
        </div>
        {achievements.length > 0 ? (
          <div className={styles.achievementList}>
            {achievements.map((achievement) => (
              <article key={achievement.id} className={styles.achievement}>
                <span aria-hidden="true">{achievement.kind === 'lifespan-adjustment' ? '寿' : '择'}</span>
                <div>
                  <div className={styles.achievementMeta}>
                    <small>{achievement.timeLabel}</small>
                    <small>{achievement.kind === 'lifespan-adjustment' ? '寿命调整' : '命运抉择'}</small>
                  </div>
                  <h3>{achievement.title}</h3><p>{achievement.detail}</p>
                </div>
              </article>
            ))}
          </div>
        ) : <p className={styles.emptyState}>此生没有已确认的分支选择或生命突破记录。</p>}
      </section>
    </>
  )
}
