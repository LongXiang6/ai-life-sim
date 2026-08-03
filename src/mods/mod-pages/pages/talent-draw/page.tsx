/**
 * Purpose: Coordinate the talent-draw page state, route guards, and delegated flow modules.
 * Owner: mod-pages/talent-draw
 * Responsibility: Page-level orchestration only; generation, selection, storage, AI, and views live in sibling modules.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  DESTINY_PATTERN_SELECT_COUNT,
  MYTHIC_PATTERN_SELECT_COUNT,
  useCharacterStore,
} from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar, PageErrorBoundary } from '@/mods/mod-ui'
import { cn } from '@/foundation/utils'

import styles from './TalentDraw.module.css'
import { TalentDrawMythicLibrary } from './TalentDrawMythicLibrary'
import { TalentDrawSelectionView } from './TalentDrawSelectionView'
import { TalentDrawStage } from './TalentDrawStage'
import { persistTalentDrawState, resolveInitialTalentDrawState } from './talent-draw-storage'
import { useTalentDrawGeneration } from './useTalentDrawGeneration'
import { useTalentDrawMythicLibrary } from './useTalentDrawMythicLibrary'
import { useTalentDrawNotification } from './useTalentDrawNotification'
import { useTalentDrawReveal } from './useTalentDrawReveal'
import { useTalentDrawSelection } from './useTalentDrawSelection'
import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'

function TalentDrawContent() {
  const router = useRouter()
  const [initialDraw] = useState(() => resolveInitialTalentDrawState())
  const [phase, setPhase] = useState(initialDraw.phase)
  const [slots, setSlots] = useState(initialDraw.slots)
  const [localPoolSize, setLocalPoolSize] = useState(initialDraw.localPoolSize)
  const [errorMsg, setErrorMsg] = useState('')
  const fullPoolRef = useRef(initialDraw.pool)
  const abortRef = useRef(false)
  const completionScheduledRef = useRef(false)
  const navigate = useCallback((path: string) => router.push(path), [router])
  const { notify, toastMessage } = useTalentDrawNotification()

  const selection = useTalentDrawSelection({
    abortRef,
    fullPoolRef,
    initialSelectedSlotIndices: initialDraw.selectedSlotIndices,
    localPoolSize,
    navigate,
    notify,
    setErrorMsg,
    setSlots,
    slots,
  })
  const mythic = useTalentDrawMythicLibrary(notify)
  const setLibraryOpen = mythic.setLibraryOpen
  const reveal = useTalentDrawReveal({
    abortRef,
    completionScheduledRef,
    fullPoolRef,
    initialPhase: initialDraw.phase,
    initialSlots: initialDraw.slots,
    setLocalPoolSize,
    setPhase,
    setSlots,
  })
  const { doGenerate } = useTalentDrawGeneration({
    abortRef,
    clearCompletionTimer: reveal.clearCompletionTimer,
    completeFullDraw: reveal.completeFullDraw,
    completionScheduledRef,
    fullPoolRef,
    getRevealCount: reveal.getRevealCount,
    phase,
    resetSelectionForGeneration: selection.resetSelectionForGeneration,
    setErrorMsg,
    setLocalPoolSize,
    setPhase,
    setRevealCountSynced: reveal.setRevealCountSynced,
    setSlots,
  })

  useEffect(() => {
    if (phase === 'idle' || phase === 'selecting') {
      persistTalentDrawState(phase, slots, selection.selectedSlotIndices)
    }
  }, [phase, selection.selectedSlotIndices, slots])

  useEffect(() => {
    if (phase === 'selecting') router.prefetch('/attribute-alloc')
  }, [phase, router])

  const visibleRevealCount = phase === 'selecting'
    ? slots.filter(Boolean).length
    : Math.min(reveal.revealCount, DESTINY_PATTERN_DISPLAY_COUNT)
  const latestStreamPattern = visibleRevealCount > 0 ? slots[visibleRevealCount - 1] : null
  const generationMessage = latestStreamPattern
    ? visibleRevealCount < DESTINY_PATTERN_DISPLAY_COUNT
      ? `${latestStreamPattern.name}已显现，正在生成第 ${visibleRevealCount + 1} 条有效命格。`
      : `${latestStreamPattern.name}已显现，正在等待其余命印归位。`
    : '正在生成第 1 条有效命格。'
  const busyDrawing = phase === 'generating' || reveal.completionReplay

  const handleEnterSelection = useCallback(() => {
    if (slots.filter(Boolean).length >= DESTINY_PATTERN_DISPLAY_COUNT) setPhase('selecting')
  }, [slots])

  const handleBack = useCallback(() => {
    if (phase === 'selecting') {
      setLibraryOpen(false)
      setPhase('ready')
      return
    }
    abortRef.current = true
    router.push('/new-game/character-create')
  }, [phase, router, setLibraryOpen])

  const footerDisabled = selection.isConfirming
    || busyDrawing
    || (phase === 'ready' && slots.filter(Boolean).length < DESTINY_PATTERN_DISPLAY_COUNT)
    || (phase === 'selecting' && selection.selectedData.length !== DESTINY_PATTERN_SELECT_COUNT)
  const footerTitle = selection.isConfirming
    ? '正在确认'
    : phase === 'idle'
      ? '开始抽取'
      : busyDrawing
        ? phase === 'generating' ? '正在生成' : '命印归位中'
        : phase === 'ready' ? '进入命格选择' : '确认命格'
  const footerCopy = selection.isConfirming
    ? '正在进入属性分配'
    : phase === 'idle'
      ? '十二道命印 · 准备就绪'
      : busyDrawing
        ? latestStreamPattern
          ? `已完成 ${visibleRevealCount} / ${DESTINY_PATTERN_DISPLAY_COUNT} · ${latestStreamPattern.name}`
          : `已完成 ${visibleRevealCount} / ${DESTINY_PATTERN_DISPLAY_COUNT} · 正在连接命盘`
        : phase === 'ready'
          ? '十二道命印已归位'
          : selection.selectedData.length === DESTINY_PATTERN_SELECT_COUNT
            ? '三条普通命格已选择 · 进入属性分配'
            : `还需选择 ${DESTINY_PATTERN_SELECT_COUNT - selection.selectedData.length} 条普通命格`

  const handleFooterAction = useCallback(() => {
    if (phase === 'idle') void doGenerate()
    else if (phase === 'ready') handleEnterSelection()
    else if (phase === 'selecting') selection.handleConfirm()
  }, [doGenerate, handleEnterSelection, phase, selection])

  return (
    <PageErrorBoundary message="命格抽取页面出现错误">
      <div className="final-flow-frame">
        <div className="flow-responsive-viewport">
          <div className="flow-responsive-layout">
            <main className={styles.page} data-phase={phase}>
              <article className={styles.book} aria-labelledby="talent-page-title">
                <div className={cn(styles.screen, phase !== 'selecting' && styles.screenDraw, 'final-flow-page-surface')}>
                  <header className={styles.header}>
                    <div className={styles.meta} aria-hidden="true">
                      <span>AI LIFE SIM · 命书</span>
                      <span>{phase === 'selecting' ? '05' : '04'} / 08</span>
                    </div>
                    <div className={styles.titleRow}>
                      <div className={styles.titleCopy}>
                        <h1 id="talent-page-title">{phase === 'selecting' ? '选择命格' : '命格抽取'}</h1>
                        <p>{phase === 'selecting'
                          ? `从十二个候选中选满三条，可携带 ${MYTHIC_PATTERN_SELECT_COUNT} 项轮回天赋。`
                          : '十二条候选准备完成后，进入命格选择。'}</p>
                      </div>
                    </div>
                  </header>
                  {phase !== 'selecting' ? (
                    <TalentDrawStage
                      busyDrawing={busyDrawing}
                      completionReplay={reveal.completionReplay}
                      errorMsg={errorMsg}
                      generationMessage={generationMessage}
                      phase={phase}
                      slots={slots}
                      visibleRevealCount={visibleRevealCount}
                    />
                  ) : (
                    <TalentDrawSelectionView
                      activeMythicSlot={mythic.activeMythicSlot}
                      equippedMythicPatterns={mythic.equippedMythicPatterns}
                      errorMsg={errorMsg}
                      isRegenerating={selection.isRegenerating}
                      libraryTriggerRef={mythic.libraryTriggerRef}
                      onCandidateClick={selection.handleCandidateClick}
                      onDeselect={selection.handleDeselect}
                      onOpenMythicSlot={mythic.handleOpenMythicSlot}
                      onRedraw={selection.handleRedraw}
                      onToggleMythic={mythic.handleToggleMythic}
                      reDrawDisabled={selection.reDrawDisabled}
                      selectedDataCount={selection.selectedData.length}
                      selectedSlotIndices={selection.selectedSlotIndices}
                      selectedUiSlots={selection.selectedUiSlots}
                      slots={slots}
                    />
                  )}
                </div>
                {mythic.libraryOpen ? (
                  <TalentDrawMythicLibrary
                    activeMythicSlot={mythic.activeMythicSlot}
                    closeRef={mythic.libraryCloseRef}
                    equippedMythicPatterns={mythic.equippedMythicPatterns}
                    mythicLibrary={mythic.mythicLibrary}
                    onClose={() => setLibraryOpen(false)}
                    onToggle={mythic.handleToggleMythic}
                    sheetRef={mythic.librarySheetRef}
                  />
                ) : null}
                <BottomActionBar
                  onBack={handleBack}
                  backTitle={phase === 'selecting' ? '返回命格抽取' : '返回角色创建'}
                  backDisabled={selection.isConfirming}
                  onConfirm={handleFooterAction}
                  confirmNumber={phase === 'selecting' ? '06' : '05'}
                  confirmText={footerTitle}
                  confirmDescription={footerCopy}
                  confirmDisabled={footerDisabled}
                />
                <div className={cn(styles.toast, toastMessage && styles.toastVisible)} role="status" aria-live="polite">{toastMessage}</div>
              </article>
            </main>
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  )
}

export default function TalentDrawPage() {
  const router = useRouter()
  const storesHydrated = useCreationStoresHydrated()
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const worldInitialized = useWorldStore((state) => state.initialized)
  const characterName = useCharacterStore((state) => state.name)
  const hasWorld = Boolean(worldConfig && worldCode > 0 && worldInitialized)
  const hasCharacter = Boolean(characterName.trim())

  useEffect(() => {
    if (!storesHydrated) return
    if (!hasWorld) router.replace('/new-game/world-select')
    else if (!hasCharacter) router.replace('/new-game/character-create')
  }, [hasCharacter, hasWorld, router, storesHydrated])

  if (!storesHydrated || !hasWorld || !hasCharacter) return null
  return <TalentDrawContent />
}
