/**
 * Purpose: Render the active story book, controls, information panel, and narrative timeline.
 * Owner: mod-pages/game-story
 * Responsibility: Story-page presentation only; state and commands are supplied by the page orchestrator.
 */

import type { ComponentProps, RefObject } from 'react'

import {
  NarrativeTimeline,
  SaveDialog,
  ToastContainer,
} from '@/mods/mod-ui'

import { GameStoryInformationPanel } from './GameStoryInformationPanel'
import { GameStoryReaderBar } from './GameStoryReaderBar'
import styles from './GameStory.module.css'

interface StoryProgressStep {
  key: string
  label: string
}

interface GameStoryBookProps {
  autoRetryPending: boolean
  displayRoundCount: number
  endingDescription: string
  endingTitle: string
  hasUnresolvedBranch: boolean
  informationPanelProps: ComponentProps<typeof GameStoryInformationPanel> | null
  isComplete: boolean
  isDead: boolean
  narrativeEndRef: RefObject<HTMLDivElement | null>
  narrativeError?: string | null
  pendingNarrativeStatus?: string
  readerBarProps: Omit<ComponentProps<typeof GameStoryReaderBar>, 'stepButtonRef' | 'stepMenuRef'>
  runtimeIncomplete: boolean
  saveDialogOpen: boolean
  saveDialogProps: Omit<ComponentProps<typeof SaveDialog>, 'open' | 'onClose'>
  stepButtonRef: RefObject<HTMLButtonElement | null>
  stepMenuRef: RefObject<HTMLDivElement | null>
  storyProgressActiveIndex: number
  storyProgressLabel: string
  storyProgressSteps: StoryProgressStep[]
  timelineProps: Omit<ComponentProps<typeof NarrativeTimeline>, 'scrollContainerRef'>
  toastProps: ComponentProps<typeof ToastContainer>
  onCloseSaveDialog: () => void
  onGoToGameOver: () => void
}

export function GameStoryBook({
  autoRetryPending,
  displayRoundCount,
  endingDescription,
  endingTitle,
  hasUnresolvedBranch,
  informationPanelProps,
  isComplete,
  isDead,
  narrativeEndRef,
  narrativeError,
  pendingNarrativeStatus,
  readerBarProps,
  runtimeIncomplete,
  saveDialogOpen,
  saveDialogProps,
  stepButtonRef,
  stepMenuRef,
  storyProgressActiveIndex,
  storyProgressLabel,
  storyProgressSteps,
  timelineProps,
  toastProps,
  onCloseSaveDialog,
  onGoToGameOver,
}: GameStoryBookProps) {
  return (
    <div className="final-flow-frame final-flow-frame--core-simulation">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <div className={styles.root}>
            <ToastContainer {...toastProps} />
            <SaveDialog open={saveDialogOpen} onClose={onCloseSaveDialog} {...saveDialogProps} />
            <section className={styles.bookShell} aria-label="故事进行中">
              <div className={styles.stickyShell}>
                <GameStoryReaderBar
                  {...readerBarProps}
                  stepButtonRef={stepButtonRef}
                  stepMenuRef={stepMenuRef}
                />
                <div className={styles.readerDivider} aria-hidden="true"><span /></div>
                {informationPanelProps ? <GameStoryInformationPanel {...informationPanelProps} /> : null}
              </div>

              <div ref={narrativeEndRef} className={styles.reading} role="main">
                <header className={styles.chapterHead}>
                  <small>第 {Math.max(displayRoundCount, 1)} 回 · 故事进程</small>
                  <h1>故事进行中</h1>
                  <div className={styles.chapterRule}><span>{storyProgressLabel}</span></div>
                  <div className={styles.progressSteps} aria-label="故事进程阶段">
                    {storyProgressSteps.map((step, index) => {
                      const isDone = index < storyProgressActiveIndex
                      const isActive = index === storyProgressActiveIndex
                      return (
                        <span
                          key={step.key}
                          className={`${styles.progressStep} ${isDone ? styles.progressStepDone : ''} ${isActive ? styles.progressStepActive : ''}`}
                          aria-current={isActive ? 'step' : undefined}
                        >
                          <i>{String(index + 1).padStart(2, '0')}</i>
                          {step.label}
                        </span>
                      )
                    })}
                  </div>
                </header>

                {runtimeIncomplete ? (
                  <div className={styles.errorNotice} role="alert">
                    <strong>核心系统未完整加载</strong>
                    <span>请刷新页面后再继续；当前进度不会被推进或覆盖。</span>
                  </div>
                ) : null}

                {narrativeError ? (
                  <div className={styles.errorNotice} role="alert">
                    <strong>{pendingNarrativeStatus === 'failed'
                      ? '正文已生成，但本轮未完成结算'
                      : '这一段未能写完'}</strong>
                    <span>{autoRetryPending
                      ? `${narrativeError} 正在自动重新尝试；也可在页面底部立即再试。`
                      : hasUnresolvedBranch
                        ? `${narrativeError} 请先完成当前分支后继续。`
                        : isDead || isComplete
                          ? narrativeError
                          : `${narrativeError} 自动重试未恢复，可在页面底部再次尝试。`}</span>
                  </div>
                ) : null}

                <NarrativeTimeline scrollContainerRef={narrativeEndRef} {...timelineProps} />
                {isDead || isComplete ? (
                  <section className={styles.statusBanner}>
                    <h2>{endingTitle}</h2>
                    <p>{endingDescription}</p>
                    <button type="button" onClick={onGoToGameOver}>前往人生结算</button>
                  </section>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
