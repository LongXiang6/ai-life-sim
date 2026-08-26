/**
 * Purpose: Coordinate the live story round, branching, save, and navigation state.
 * Owner: mod-pages/game-story
 * Responsibility: Core story page orchestration; reader bar, information ledger, and tag parsing live in sibling modules.
 */

'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCharacterStore } from '@/mods/mod-character'
import { resolveDestinyPatternGrowthChoice } from '@/mods/mod-character/destiny-pattern-access'
import { useEngine, useEngineStore, useSimulationAdvance } from '@/mods/mod-engine'
import { useToastStore } from '@/mods/mod-ui'
import { GameStoryBook } from './GameStoryBook'
import { GameStoryFlowGuard } from './GameStoryFlowGuard'
import { resolveGameStoryProgress } from './game-story-progress'
import { useGameStoryAutoScroll } from './useGameStoryAutoScroll'
import { useGameStoryPresentation } from './useGameStoryPresentation'
import { useGameStorySave } from './useGameStorySave'
import { useGameStoryTimeStepMenu } from './useGameStoryTimeStepMenu'
import { useLegendaryEncounterSelection } from './useLegendaryEncounterSelection'
import { useSimulationBranch } from './useSimulationBranch'

export default function GamePage() {
  const router = useRouter()
  const { status, round, totalRounds, seasonName, stop } = useEngine()
  const {
    advanceRound,
    isAdvancing,
    isRuntimeReady,
    runtimeReadiness,
  } = useSimulationAdvance()
  const runtimeIncomplete = runtimeReadiness.loaderReady
    && runtimeReadiness.missingSubsystems.length > 0
  const runtimeBlockedText = runtimeIncomplete
    ? '核心系统加载不完整'
    : '核心系统初始化中'
  const pendingDestinyPatternGrowth = useCharacterStore((state) => state.destinyPatterns.pendingGrowth)
  const hasPendingDestinyPatternGrowth = pendingDestinyPatternGrowth !== null

  const {
    hasUnresolvedBranch,
    unresolvedBranchIndex,
    branchTitle,
    branchOptions,
    forceBranchNext,
    handleForceBranch,
    handleBranchConfirm,
    handleBranchCancel,
    branchCustomText,
    setBranchCustomText,
    selectedBranchOptionId,
    setSelectedBranchOptionId,
  } = useSimulationBranch({
    advanceRound,
    holdAdvanceAfterConfirm: hasPendingDestinyPatternGrowth,
  })
  const addToast = useToastStore((s) => s.addToast)

  const handleBranchConfirmWithFeedback = useCallback(async () => {
    const result = await handleBranchConfirm()
    if (!result.ok && result.error) {
      addToast('warning', result.error)
    }
  }, [handleBranchConfirm, addToast])

  const storyRepetitionStats = useEngineStore((s) => s.storyRepetitionStats)
  const narrativeError = useEngineStore((s) => s.narrativeError)
  const pendingNarrative = useEngineStore((s) => s.pendingNarrative)
  const hasVisiblePendingNarrative = Boolean(
    pendingNarrative && pendingNarrative.roundSequence > totalRounds,
  )
  const presentation = useGameStoryPresentation({
    hasVisiblePendingNarrative,
    pendingNarrative,
    round,
    seasonName,
    totalRounds,
  })
  const {
    characterAge,
    characterName,
    destinyPatterns,
    displayBaseAttrs,
    equippedReincarnationTalents,
    genderLabel,
    health,
    narrativeEntries,
    narrativeHistory,
    narrativeTimeLabel,
    raceName,
    recentRepetitionMetrics,
    talents,
    timeStep,
    worldBasicStatus,
    worldCharStatus,
    worldCode,
    worldConfig,
    worldIcon,
    worldSurrounding,
    worldTagSections,
  } = presentation
  const projectedNarrativeLength = narrativeHistory.length + (hasVisiblePendingNarrative ? 1 : 0)
  const displayRoundCount = hasVisiblePendingNarrative
    ? pendingNarrative?.roundSequence ?? totalRounds
    : totalRounds
  const {
    activeTimeStepKey,
    activeTimeStepLabel,
    handleTimeStepChange,
    setShowStepMenu,
    showStepMenu,
    stepButtonRef,
    stepMenuRef,
    timeStepOptions,
  } = useGameStoryTimeStepMenu(timeStep)
  const save = useGameStorySave({
    addToast,
    characterName,
    isAdvancing,
    isRuntimeReady,
    runtimeIncomplete,
    totalRounds,
    worldName: worldConfig?.name ?? '',
  })

  const [showWorldPanel, setShowWorldPanel] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const narrativeEndRef = useGameStoryAutoScroll(projectedNarrativeLength)
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)
  useLegendaryEncounterSelection()

  const isComplete = status === 'complete'
  const isDead = !health.alive

  const handleDestinyPatternGrowthSelect = useCallback((optionId: string) => {
    if (isAdvancing) return
    const result = resolveDestinyPatternGrowthChoice(optionId)
    if (!result.ok) {
      addToast('warning', result.error)
    }
  }, [addToast, isAdvancing])

  const handleNarrativeAdvance = useCallback(async () => {
    if (
      !isRuntimeReady
      || isDead
      || isComplete
      || isAdvancing
      || hasUnresolvedBranch
      || hasPendingDestinyPatternGrowth
    ) return
    await advanceRound()
  }, [
    advanceRound,
    hasPendingDestinyPatternGrowth,
    hasUnresolvedBranch,
    isAdvancing,
    isComplete,
    isDead,
    isRuntimeReady,
  ])

  const handleGoToGameOver = useCallback(() => {
    stop()
    router.push('/game-over')
  }, [router, stop])

  const {
    narrativeAdvanceBlockedText,
    narrativeAdvanceHint,
    narrativeAdvanceText,
    storyProgressActiveIndex,
    storyProgressLabel,
    storyProgressSteps,
  } = resolveGameStoryProgress({
    forceBranchNext,
    hasPendingDestinyPatternGrowth,
    hasUnresolvedBranch,
    hasVisiblePendingNarrative,
    isAdvancing,
    isRuntimeReady,
    narrativeError,
    runtimeBlockedText,
  })

  const flowGuard = useMemo(() => {
    if (!worldConfig || worldCode === 0) {
      return { title: '世界尚未建立', message: '请先完成世界选择与构建，再进入模拟。', action: '/new-game/world-select' }
    }
    if (!characterName.trim()) {
      return { title: '角色尚未创建', message: '请先完成角色创建、天赋和命运预览，再进入模拟。', action: '/new-game/character-create' }
    }
    return null
  }, [characterName, worldCode, worldConfig])

  if (flowGuard) {
    return (
      <GameStoryFlowGuard
        action={flowGuard.action}
        message={flowGuard.message}
        onReturn={(action) => router.replace(action)}
        title={flowGuard.title}
      />
    )
  }

  return (
    <GameStoryBook
      displayRoundCount={displayRoundCount}
      endingDescription={isDead
        ? `角色在第 ${round.year} 年 ${seasonName} 离世。`
        : `共走过 ${totalRounds} 轮，结算页将整理这一生的轨迹。`}
      endingTitle={isDead ? `${characterName} 的一生已落幕` : '本卷人生已经写完'}
      hasUnresolvedBranch={hasUnresolvedBranch}
      informationPanelProps={showWorldPanel ? {
        characterAge,
        characterName,
        destinyPatterns: destinyPatterns ?? [],
        displayBaseAttrs,
        equippedReincarnationTalents,
        genderLabel,
        health,
        isAdvancing,
        isRuntimeReady,
        latestWordRepeatRate: narrativeHistory[narrativeHistory.length - 1]?.repetitionMetric?.wordRepeatRate,
        narrativeTimeLabel,
        raceName,
        recentRepetitionMetrics,
        repetitionStats: storyRepetitionStats,
        runtimeBlockedText,
        talents,
        worldBasicStatus,
        worldCharStatus,
        worldName: worldConfig?.name ?? '未知世界',
        worldSurrounding,
        worldTagSections,
        onClose: () => setShowWorldPanel(false),
        onFeedback: () => router.push('/feedback'),
        onForceSettle: handleGoToGameOver,
        onOpenSave: () => { setShowWorldPanel(false); setShowSaveDialog(true) },
        onWelcome: () => router.push('/welcome'),
      } : null}
      isComplete={isComplete}
      isDead={isDead}
      narrativeEndRef={narrativeEndRef}
      narrativeError={narrativeError}
      pendingNarrativeStatus={pendingNarrative?.status}
      readerBarProps={{
        activeTimeStepKey,
        activeTimeStepLabel,
        characterAge,
        characterName,
        destinyPatterns: destinyPatterns ?? [],
        displayBaseAttrs,
        equippedReincarnationTalents,
        forceBranchNext,
        genderLabel,
        hasUnresolvedBranch,
        isAdvancing,
        isComplete,
        isDead,
        isRuntimeReady,
        narrativeTimeLabel,
        showStepMenu,
        showWorldPanel,
        timeStepOptions,
        worldIcon,
        worldName: worldConfig?.name ?? '未知世界',
        onForceBranch: handleForceBranch,
        onSelectTimeStep: handleTimeStepChange,
        onSetShowStepMenu: setShowStepMenu,
        onSetShowWorldPanel: setShowWorldPanel,
      }}
      runtimeIncomplete={runtimeIncomplete}
      saveDialogOpen={showSaveDialog}
      saveDialogProps={{
        onSave: save.handleManualSave,
        onCloudSave: save.accountStatus === 'authenticated' ? save.handleCloudSave : undefined,
        cloudSave: save.cloudSave,
        cloudLoading: save.cloudLoading,
        defaultWorldName: worldConfig?.name,
        defaultCharacterName: characterName,
      }}
      stepButtonRef={stepButtonRef}
      stepMenuRef={stepMenuRef}
      storyProgressActiveIndex={storyProgressActiveIndex}
      storyProgressLabel={storyProgressLabel}
      storyProgressSteps={storyProgressSteps}
      timelineProps={{
        entries: narrativeEntries,
        turnCount: displayRoundCount,
        showAdvance: !isDead && !isComplete,
        advanceBlocked: !isRuntimeReady || hasUnresolvedBranch || hasPendingDestinyPatternGrowth,
        advanceBlockedText: narrativeAdvanceBlockedText,
        advanceText: narrativeAdvanceText,
        advanceHint: narrativeAdvanceHint,
        isGenerating: isAdvancing,
        hasEndingEvent: isDead,
        onAdvance: handleNarrativeAdvance,
        onGoToGameOver: handleGoToGameOver,
        unresolvedBranchIndex,
        branchTitle,
        branchOptions,
        selectedBranchOptionId,
        branchCustomText,
        onBranchSelect: setSelectedBranchOptionId,
        onBranchConfirm: handleBranchConfirmWithFeedback,
        onBranchCancel: handleBranchCancel,
        onCustomInputChange: setBranchCustomText,
        onDestinyPatternGrowthSelect: handleDestinyPatternGrowthSelect,
      }}
      toastProps={{ toasts, onDismiss: dismissToast }}
      onCloseSaveDialog={() => setShowSaveDialog(false)}
      onGoToGameOver={handleGoToGameOver}
    />
  )
}
