/**
 * Purpose: Render the finalized five-dimension score, review, verse, and retained achievements.
 * Owner: mod-pages/game-over
 * Responsibility: Read-only settlement presentation only.
 */

import type { RadarDimension } from '@/mods/mod-ui'

import { GAME_OVER_DIMENSION_ICONS, GameOverRadar } from './GameOverRadar'
import type { GameOverSettlementStatus } from './useGameOverSettlement'
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
  activeDimension?: RadarDimension
  activeDimensionIndex: number
  ageLabel: string
  dimensions: RadarDimension[]
  lifeSummary: string
  lifeVerse: string
  overallScore: number | null
  rounds: number
  settlementError: string
  settlementStatus: GameOverSettlementStatus
  storyRepetitionStats: RepetitionStatsView
  worldviewId: number | string | null
  onRetrySettlement: () => void
  onSelectDimension: (index: number) => void
}

function settlementStatusText(status: GameOverSettlementStatus): string {
  if (status === 'reviewing') return '五维评鉴已完成，正在整理此生评语与诗句…'
  if (status === 'finalizing') return '正在封存本局结算…'
  return '正在根据当前世界与完整人生生成五维评鉴…'
}

export function GameOverOverviewSections({
  activeDimension,
  activeDimensionIndex,
  ageLabel,
  dimensions,
  lifeSummary,
  lifeVerse,
  overallScore,
  rounds,
  settlementError,
  settlementStatus,
  storyRepetitionStats,
  worldviewId,
  onRetrySettlement,
  onSelectDimension,
}: GameOverOverviewSectionsProps) {
  const settlementReady = settlementStatus === 'succeeded'
  return (
    <>
      <h2 id="dimensions-title" className={styles.blockTitle}>世界五维</h2>
      {overallScore === null || dimensions.length !== 5 ? (
        <p className={styles.reviewStatus} aria-live="polite">{settlementStatusText(settlementStatus)}</p>
      ) : (
        <>
          <div className={styles.radarSection}>
            <GameOverRadar dimensions={dimensions} activeIndex={activeDimensionIndex} overallScore={overallScore} onSelect={onSelectDimension} />
          </div>
          {activeDimension ? (
            <p className={styles.metricComment} aria-live="polite">
              <span><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">{GAME_OVER_DIMENSION_ICONS[activeDimension.label] ?? '◇'}</span>{activeDimension.label}</span>
              <strong>{activeDimension.comment}</strong>
            </p>
          ) : null}
        </>
      )}

      <p className={styles.ritualDivider} aria-hidden="true">✦</p>
      <h2 className={styles.blockTitle}>此生评语</h2>
      {!settlementReady && !settlementError && overallScore !== null ? (
        <p className={styles.reviewStatus} aria-live="polite">{settlementStatusText(settlementStatus)}</p>
      ) : null}
      {settlementError ? (
        <div className={styles.reviewFailure} role="alert">
          <p className={styles.reviewError}>人生结算失败：{settlementError}</p>
          <button type="button" className={styles.retrySettlementButton} onClick={onRetrySettlement}>重新结算</button>
        </div>
      ) : null}
      {settlementReady ? (
        <>
          <p className={styles.summaryBody}>{lifeSummary}</p>
          <p className={styles.summaryVerse}>{lifeVerse}</p>
        </>
      ) : null}
      <p className={styles.summaryMeta}>
        <span>{rounds} 轮世事</span>
        <span>{ageLabel}</span>
        {worldviewId !== null && worldviewId !== undefined ? <span>世界编号 {worldviewId}</span> : null}
      </p>
      <p className={styles.repetitionSummary} aria-label="故事重复率统计">
        <span>故事重复观测</span>
        <strong>近五轮均值 {Math.round(storyRepetitionStats.recentAverageWordRepeatRate * 100)}%</strong>
        <span>整局峰值 {Math.round(storyRepetitionStats.maxWordRepeatRate * 100)}%</span>
        <span>高重复 {storyRepetitionStats.highRepeatRounds} 轮 · {storyRepetitionStats.trend === 'rising' ? '近期上升' : storyRepetitionStats.trend === 'falling' ? '近期下降' : '近期平稳'}</span>
      </p>
    </>
  )
}

export function GameOverAchievementSection({ achievements }: { achievements: AchievementView[] }) {
  return (
    <>
      <p className={styles.ritualDivider} aria-hidden="true">✦</p>
      <section className={styles.section} aria-labelledby="achievements-title">
        <div className={styles.sectionHeading}>
          <div><span className={styles.sectionIndex}>01</span><h2 id="achievements-title">此生大事</h2></div>
          <p>{achievements.length} 项真实里程碑</p>
        </div>
        {achievements.length > 0 ? (
          <div className={styles.achievementList}>
            {achievements.map((achievement) => (
              <article key={achievement.id} className={styles.achievement}>
                <span aria-hidden="true">择</span>
                <div>
                  <div className={styles.achievementMeta}>
                    <small>{achievement.timeLabel}</small>
                    <small>命运抉择</small>
                  </div>
                  <h3>{achievement.title}</h3><p>{achievement.detail}</p>
                </div>
              </article>
            ))}
          </div>
        ) : <p className={styles.emptyState}>此生没有已确认的分支选择记录。</p>}
      </section>
    </>
  )
}
