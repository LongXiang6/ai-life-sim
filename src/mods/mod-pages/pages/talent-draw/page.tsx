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
  PATTERN_LOADOUT_SLOT_COUNT,
  useCharacterStore,
} from '@/mods/mod-character'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar, FlowRunningHead, PageErrorBoundary } from '@/mods/mod-ui'
import { cn } from '@/foundation/utils'

import styles from './TalentDraw.module.css'
import { TalentDrawSelectionView } from './TalentDrawSelectionView'
import { TalentDrawStage } from './TalentDrawStage'
import { persistTalentDrawState, resolveInitialTalentDrawState } from './talent-draw-storage'
import { useTalentDrawGeneration } from './useTalentDrawGeneration'
import { useTalentDrawNotification } from './useTalentDrawNotification'
import { useTalentDrawReveal } from './useTalentDrawReveal'
import { useTalentDrawSelection } from './useTalentDrawSelection'
import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'

function TalentDrawContent() {
  const router = useRouter()
  const [initialDraw] = useState(() => resolveInitialTalentDrawState())
  const [phase, setPhase] = useState(initialDraw.phase)
  const [slots, setSlots] = useState(initialDraw.slots)
  const [candidatePool, setCandidatePool] = useState(initialDraw.pool)
  const [_localPoolSize, setLocalPoolSize] = useState(initialDraw.localPoolSize)
  const [errorMsg, setErrorMsg] = useState('')
  const fullPoolRef = useRef(initialDraw.pool)
  const abortRef = useRef(false)
  const regenerateAllRef = useRef<() => void>(() => undefined)
  const completionScheduledRef = useRef(false)
  const navigate = useCallback((path: string) => router.push(path), [router])
  const regenerateAll = useCallback(() => regenerateAllRef.current(), [])
  const { notify, toastMessage } = useTalentDrawNotification()

  const selection = useTalentDrawSelection({
    abortRef,
    fullPoolRef,
    initialLoadoutSlots: initialDraw.loadoutSlots,
    navigate,
    regenerateAll,
    notify,
    setErrorMsg,
    candidatePool,
    slots,
  })
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
  const { doGenerate, startBackgroundFill } = useTalentDrawGeneration({
    abortRef,
    clearCompletionTimer: reveal.clearCompletionTimer,
    completeFullDraw: reveal.completeFullDraw,
    completionScheduledRef,
    fullPoolRef,
    resetSelectionForGeneration: selection.resetSelectionForGeneration,
    setErrorMsg,
    setLocalPoolSize,
    setPhase,
    setRevealCountSynced: reveal.setRevealCountSynced,
    setSlots,
  })

  useEffect(() => {
    getDestinyPatternSystem().hydratePool(initialDraw.pool)
    const unsubscribe = getDestinyPatternSystem().subscribePool((patterns) => {
      const unique = [...new Map(patterns.map((pattern) => [pattern.id, pattern])).values()]
      fullPoolRef.current = unique
      setCandidatePool(unique)
      setLocalPoolSize(unique.length)
    })
    return unsubscribe
  }, [fullPoolRef, initialDraw.pool, setLocalPoolSize])

  useEffect(() => {
    if (phase !== 'selecting') return
    startBackgroundFill()
  }, [phase, startBackgroundFill])

  useEffect(() => {
    regenerateAllRef.current = () => { void doGenerate() }
  }, [doGenerate])

  useEffect(() => {
    if (phase === 'idle' || phase === 'selecting') {
      persistTalentDrawState(phase, slots, selection.loadoutSlots)
    }
  }, [phase, selection.loadoutSlots, slots])

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
    if (getDestinyPatternSystem().getPoolFillStatus().initialReady) setPhase('selecting')
  }, [])

  const handleBack = useCallback(() => {
    if (phase === 'selecting') {
      setPhase('ready')
      return
    }
    abortRef.current = true
    router.push('/new-game/character-create')
  }, [phase, router])

  const footerDisabled = selection.isConfirming
    || busyDrawing
    || (phase === 'ready' && !getDestinyPatternSystem().getPoolFillStatus().initialReady)
    || (phase === 'selecting' && selection.selectedData.length !== PATTERN_LOADOUT_SLOT_COUNT)
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
      ? '四类命印 · 准备就绪'
      : busyDrawing
        ? latestStreamPattern
          ? `已完成 ${visibleRevealCount} / ${DESTINY_PATTERN_DISPLAY_COUNT} · ${latestStreamPattern.name}`
          : `已完成 ${visibleRevealCount} / ${DESTINY_PATTERN_DISPLAY_COUNT} · 正在连接命盘`
        : phase === 'ready'
          ? '四类首批命印已归位'
          : selection.selectedData.length === PATTERN_LOADOUT_SLOT_COUNT
            ? '四个携带槽已确认 · 进入属性分配'
            : `还需选择 ${PATTERN_LOADOUT_SLOT_COUNT - selection.selectedData.length} 项命格`

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
              <article
                className={cn(
                  styles.paper,
                  phase === 'selecting' ? styles.paperSelection : styles.paperDraw,
                  'final-flow-page-surface',
                )}
                aria-labelledby="talent-page-title"
              >
                <header className={styles.header}>
                  <FlowRunningHead stepLabel={`${phase === 'selecting' ? '05' : '04'} / 08`} />
                  <div className={styles.titleCopy}>
                    <h1 id="talent-page-title">
                      {phase !== 'selecting' ? <span className="semantic-emoji" data-semantic-emoji aria-hidden="true">🔮</span> : null}
                      {phase === 'selecting' ? '选择命格' : '命格抽取'}
                    </h1>
                    <p>{phase === 'selecting'
                      ? '在五类页签中填满四个携带槽，普通命格与轮回天赋可自由组合。'
                      : '四类命印，静待天命。'}</p>
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
                    errorMsg={errorMsg}
                    isRegenerating={selection.isRegenerating}
                    mythicLibrary={selection.mythicLibrary}
                    onCandidateClick={selection.handleCandidateClick}
                    onDeselect={selection.handleDeselect}
                    onMythicClick={selection.handleMythicClick}
                    onRedraw={selection.handleRedraw}
                    reDrawDisabled={selection.reDrawDisabled}
                    resolvedLoadoutSlots={selection.resolvedLoadoutSlots}
                    selectedDataCount={selection.selectedData.length}
                    selectedDestinyIds={selection.selectedDestinyIds}
                    selectedMythicIds={selection.selectedMythicIds}
                    candidatePool={candidatePool}
                  />
                )}
              </article>
              <BottomActionBar
                onBack={handleBack}
                backTitle={phase === 'selecting' ? '返回命格抽取' : '返回角色创建'}
                backText="返回"
                backDescription={phase === 'selecting' ? '返回命格抽取' : '返回角色创建'}
                backDisabled={selection.isConfirming}
                onConfirm={handleFooterAction}
                confirmNumber={phase === 'selecting' ? '06' : '05'}
                confirmText={footerTitle}
                confirmDescription={footerCopy}
                confirmDisabled={footerDisabled}
              />
              <div className={cn(styles.toast, toastMessage && styles.toastVisible)} role="status" aria-live="polite">{toastMessage}</div>
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
