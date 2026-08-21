/**
 * Purpose: Coordinate the finalized game-over view from one ordered settlement result.
 * Owner: mod-pages/game-over
 * Responsibility: Page composition and active five-dimension selection only.
 */

'use client'

import { useState } from 'react'

import { FlowRunningHead, PageScroll } from '@/mods/mod-ui'

import styles from './GameOver.module.css'
import { GameOverFooter } from './GameOverFooter'
import { GameOverMythicSection } from './GameOverMythicSection'
import { GameOverAchievementSection, GameOverOverviewSections } from './GameOverOverviewSections'
import { GameOverShareSection } from './GameOverShareSection'
import { useGameOverActions } from './useGameOverActions'
import { useGameOverArtifacts } from './useGameOverArtifacts'
import { useGameOverLifecycle } from './useGameOverLifecycle'
import { useGameOverSettlement } from './useGameOverSettlement'
import { useGameOverSnapshot } from './useGameOverSnapshot'

export default function GameOverPage() {
  const snapshot = useGameOverSnapshot()
  const settlement = useGameOverSettlement(snapshot)
  const artifacts = useGameOverArtifacts(
    snapshot,
    settlement.scoreResult,
    settlement.effectiveEndingReview,
    settlement.completedAt,
  )
  const actions = useGameOverActions({
    artifacts,
    lifeSummary: settlement.lifeSummary,
    scoreResult: settlement.scoreResult,
    settlementReady: settlement.settlementReady,
    snapshot,
  })
  useGameOverLifecycle({ actions, artifacts, settlement, snapshot })
  const [activeDimensionIndex, setActiveDimensionIndex] = useState(0)
  const dimensions = settlement.scoreResult?.dimensions.map((dimension) => ({
    label: dimension.label,
    value: dimension.value,
    comment: dimension.comment,
  })) ?? []
  const effectiveDimensionIndex = dimensions.length > 0
    ? Math.min(activeDimensionIndex, dimensions.length - 1)
    : 0
  const activeDimension = dimensions[effectiveDimensionIndex] ?? dimensions[0]

  if (!snapshot.canViewGameOver) return null

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <PageScroll className={`${styles.page} final-flow-page-surface`}>
            <article className={styles.book} aria-labelledby="game-over-title">
              <FlowRunningHead stepLabel="09 / 09" />
              <header className={styles.titleCopy}>
                <h1 id="game-over-title">一生回望</h1>
                <p>看清这一生留下的力量、选择与回声。</p>
              </header>
              <p className={styles.ritualDivider} aria-hidden="true">✦</p>

              <GameOverOverviewSections
                activeDimension={activeDimension}
                activeDimensionIndex={effectiveDimensionIndex}
                ageLabel={snapshot.ageLabel}
                dimensions={dimensions}
                lifeSummary={settlement.lifeSummary}
                lifeVerse={settlement.lifeVerse}
                overallScore={settlement.scoreResult?.score ?? null}
                rounds={snapshot.allNarratives.length}
                settlementError={settlement.settlementError}
                settlementStatus={settlement.settlementStatus}
                storyRepetitionStats={snapshot.storyRepetitionStats}
                worldviewId={snapshot.worldviewId}
                onRetrySettlement={settlement.retrySettlement}
                onSelectDimension={setActiveDimensionIndex}
              />

              {settlement.settlementReady && settlement.scoreResult ? (
                <>
                  <GameOverMythicSection
                    candidates={artifacts.promotionCandidates}
                    effectiveIndex={artifacts.effectivePromotionIndex}
                    error={actions.promotionError}
                    promoting={actions.promoting}
                    promotedTalent={artifacts.promotedTalent}
                    strengthLabel={artifacts.reincarnationStrength.label}
                    onPromote={() => void actions.handlePromote()}
                    onSelect={artifacts.setActivePromotionIndex}
                  />

                  <GameOverShareSection
                    activeReincarnation={artifacts.promotedTalent
                      ? {
                          name: artifacts.promotedTalent.name,
                          description: artifacts.promotedTalent.description,
                          effect: artifacts.promotedTalent.effect,
                        }
                      : undefined}
                    ageLabel={snapshot.ageLabel}
                    busy={actions.shareBusy}
                    characterName={snapshot.characterName}
                    facts={artifacts.shareFacts}
                    overallScore={settlement.scoreResult.score}
                    rounds={snapshot.allNarratives.length}
                    roundLabel={snapshot.roundLabel}
                    status={actions.shareStatus}
                    worldName={snapshot.worldName}
                    onSave={() => void actions.handleSaveShareCard()}
                    onShare={() => void actions.handleShareLife()}
                    onViewSimulationData={actions.handleViewSimulationData}
                  />
                </>
              ) : null}

              <GameOverAchievementSection achievements={snapshot.achievements} />
            </article>
          </PageScroll>

          <GameOverFooter
            confirmingNewLife={actions.confirmingNewLife}
            settlementReady={settlement.settlementReady}
            startingNewLife={actions.startingNewLife}
            onBack={actions.handleFooterBack}
            onStartNewLife={actions.handleStartNewLife}
          />
        </div>
      </div>
    </div>
  )
}
