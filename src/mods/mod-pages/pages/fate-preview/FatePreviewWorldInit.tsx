/**
 * Purpose: Render live world-initialization steps and timer feedback on fate preview.
 * Owner: mod-pages/fate-preview
 * Responsibility: Initialization-status presentation only; readiness decisions remain in the page.
 */

'use client'

import { useEffect, useState } from 'react'

import type { WorldInitAIStatus } from '@/mods/mod-world'

import { WORLD_INIT_STEPS } from './fate-preview-helpers'
import styles from './FatePreview.module.css'

interface FatePreviewWorldInitProps {
  complete: boolean
  failed: boolean
  progress: number
  running: boolean
  startNotice: string | null
  status: WorldInitAIStatus | null
  stepLabel?: string
}

export function FatePreviewWorldInit({
  complete,
  failed,
  progress,
  running,
  startNotice,
  status,
  stepLabel,
}: FatePreviewWorldInitProps) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!status) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [status])
  const getStepSeconds = (label: string): number | null => {
    const timer = status?.stepTimers?.[label]
    if (!timer) return null
    return Math.max(0, Math.floor(((timer.end ?? now) - timer.start) / 1000))
  }

  return (
    <section className={`${styles.section} ${styles.initSection}`} aria-labelledby="world-init-title">
      <div className={styles.sectionHeading}>
        <strong id="world-init-title">世界初始化</strong>
        <span aria-live="polite">{progress} / 4 完成</span>
      </div>
      {startNotice ? <p className={styles.gateNotice} role="alert">{startNotice}</p> : null}
      <div className={styles.initStepList}>
        {WORLD_INIT_STEPS.map((step) => {
          const done = status ? step.doneFlag(status) : false
          const isCurrent = !done && running && stepLabel === step.label
          const isFailed = failed && !done && stepLabel === step.label
          const seconds = getStepSeconds(step.label)
          return (
            <div key={step.id} className={`${styles.initStepRow} ${done ? styles.initStepDone : ''} ${isCurrent ? styles.initStepCurrent : ''} ${isFailed ? styles.initStepFailed : ''}`} title={step.description}>
              <i className={styles.initStepIcon}>{isFailed ? '×' : done ? '✓' : isCurrent ? <span className={styles.loading149} /> : step.icon}</i>
              <strong className={styles.initStepLabel}>{step.shortLabel}</strong>
              <span className={styles.initStepTimer}>{done ? `${seconds ?? 0}s` : seconds !== null ? `${seconds}s` : isCurrent ? '调用中' : '等待'}</span>
            </div>
          )
        })}
      </div>
      <p className={styles.initCaption}>
        {complete ? '世界初始化完成，可以开启这段人生。' : failed ? '初始化出现错误，请检查下方信息。' : running ? '四项任务正在执行，完成后统一解锁开局。' : '等待世界初始化任务开始。'}
      </p>
      {failed && status?.errors?.length ? (
        <div className={styles.initPanelErrors}>
          {status.errors.map((error, index) => <p key={`${index}-${error}`} className={styles.initPanelErrorItem}>{error}</p>)}
        </div>
      ) : null}
    </section>
  )
}
