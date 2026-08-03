/**
 * Purpose: Coordinate the game-over view from scoring, review, artifact, action, and lifecycle modules.
 * Owner: mod-pages/game-over
 * Responsibility: Page-level composition and active radar selection only.
 */

'use client'

import { useState } from 'react'

import { usePreGenQueueStatus } from '@/mods/mod-engine'
import { PageScroll } from '@/mods/mod-ui'

import styles from './GameOver.module.css'
import { GameOverFooter } from './GameOverFooter'
import { GameOverMythicSection } from './GameOverMythicSection'
import { GameOverOverviewSections } from './GameOverOverviewSections'
import { GameOverShareSection } from './GameOverShareSection'
import { useGameOverActions } from './useGameOverActions'
import { useGameOverArtifacts } from './useGameOverArtifacts'
import { useGameOverEndingReview } from './useGameOverEndingReview'
import { useGameOverLifecycle } from './useGameOverLifecycle'
import { useGameOverScore } from './useGameOverScore'

export default function GameOverPage() {
  const score = useGameOverScore()
  const endingReview = useGameOverEndingReview(score)
  const artifacts = useGameOverArtifacts(score, endingReview.effectiveEndingReview)
  const preGenStatus = usePreGenQueueStatus()
  const actions = useGameOverActions({
    artifacts,
    lifeSummary: endingReview.lifeSummary,
    preGenerationActive: preGenStatus.isActive,
    score,
  })
  useGameOverLifecycle({ actions, artifacts, endingReview, score })
  const [activeDimensionIndex, setActiveDimensionIndex] = useState(0)
  const activeDimension = score.dimensions[activeDimensionIndex] ?? score.dimensions[0]

  if (!score.canViewGameOver) return null

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <PageScroll maxWidth={330} className={`${styles.page} final-flow-page-surface`}>
            <div className={styles.wrapper}>
              <article className={styles.book} aria-labelledby="game-over-title">
                <div className={styles.ornament} aria-hidden="true" />
                <header className={styles.header}>
                  <div className={styles.metaRow}>
                    <span>AI LIFE SIM · 命书</span>
                    <span>终章 · {score.roundLabel}</span>
                  </div>
                  <div className={styles.titleRow}>
                    <div>
                      <h1 id="game-over-title" className={styles.headerTitle}>一生回望</h1>
                      <p className={styles.headerCopy}>看清这一生留下的力量、选择与回声。</p>
                    </div>
                    <div className={styles.titleSeal} aria-hidden="true"><span>终</span></div>
                  </div>
                  <div className={styles.divider} aria-hidden="true"><span /></div>
                </header>

                <GameOverOverviewSections
                  achievements={score.achievements}
                  activeDimension={activeDimension}
                  activeDimensionIndex={activeDimensionIndex}
                  ageLabel={score.ageLabel}
                  characterName={score.characterName}
                  dimensions={score.dimensions}
                  lifeRecords={score.lifeRecords}
                  lifeSummary={endingReview.lifeSummary}
                  moralityLabel={score.moralityLabel}
                  overallScore={score.overallScore}
                  rounds={score.allNarratives.length}
                  sealCharacter={score.sealCharacter}
                  storyRepetitionStats={score.storyRepetitionStats}
                  worldviewId={score.worldviewId}
                  worldName={score.worldName}
                  onSelectDimension={setActiveDimensionIndex}
                />

                <GameOverMythicSection
                  activeCandidate={artifacts.activeMythicCandidate}
                  candidates={artifacts.mythicCandidates}
                  effectiveIndex={artifacts.effectiveMythicIndex}
                  error={actions.mythicError}
                  generating={actions.mythicGenerating}
                  overallScore={score.overallScore}
                  sealedOutsideCandidates={artifacts.sealedOutsideCurrentCandidates}
                  sealedPattern={artifacts.sealedMythicPattern}
                  sealedPatternId={artifacts.sealedMythicPatternId}
                  strengthLabel={score.reincarnationStrength.label}
                  onGenerate={() => void actions.handleGenerateMythics()}
                  onSeal={actions.handleSealMythic}
                  onSelect={artifacts.setActiveMythicIndex}
                />

                <GameOverShareSection
                  activeMythic={artifacts.activeMythicCandidate}
                  ageLabel={score.ageLabel}
                  busy={actions.shareBusy}
                  characterName={score.characterName}
                  facts={artifacts.shareFacts}
                  moralityLabel={score.moralityLabel}
                  overallScore={score.overallScore}
                  rounds={score.allNarratives.length}
                  roundLabel={score.roundLabel}
                  status={actions.shareStatus}
                  worldName={score.worldName}
                  onSave={() => void actions.handleSaveShareCard()}
                  onShare={() => void actions.handleShareLife()}
                />
              </article>
            </div>
          </PageScroll>

          <GameOverFooter
            confirmingNewLife={actions.confirmingNewLife}
            preGenerationActive={preGenStatus.isActive}
            sealedMythicPatternId={artifacts.sealedMythicPatternId}
            startingNewLife={actions.startingNewLife}
            onBack={actions.handleFooterBack}
            onStartNewLife={actions.handleStartNewLife}
            onViewSimulationData={actions.handleViewSimulationData}
          />
        </div>
      </div>
    </div>
  )
}
