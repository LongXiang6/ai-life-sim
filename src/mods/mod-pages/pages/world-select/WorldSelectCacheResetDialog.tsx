'use client'

import { useEffect, useRef } from 'react'

import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectCacheResetDialog({ logic }: { logic: WorldSelectLogic }) {
  const dialog = logic.pendingCacheReset
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const cancelReset = logic.handleCancelClearWorldCache

  useEffect(() => {
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    cancelButtonRef.current?.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelReset()
        return
      }
      if (event.key !== 'Tab') return
      if (event.shiftKey && document.activeElement === cancelButtonRef.current) {
        event.preventDefault()
        confirmButtonRef.current?.focus()
      } else if (!event.shiftKey && document.activeElement === confirmButtonRef.current) {
        event.preventDefault()
        cancelButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus({ preventScroll: true })
    }
  }, [cancelReset, dialog])

  if (!dialog) return null

  return (
    <div className={styles.cacheDialogLayer}>
      <section
        className={styles.cacheDialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="world-cache-reset-title"
        aria-describedby="world-cache-reset-description"
      >
        <h2 id="world-cache-reset-title">重置「{dialog.worldName}」的生成内容？</h2>
        <p id="world-cache-reset-description">
          将只清除该世界的命格候选、初始化校准、实体、地图与创建流程缓存。不会删除世界、存档或其他世界的数据。
        </p>
        <div className={styles.cacheDialogActions}>
          <button ref={cancelButtonRef} type="button" onClick={logic.handleCancelClearWorldCache}>取消</button>
          <button ref={confirmButtonRef} type="button" className={styles.cacheDialogConfirm} onClick={logic.handleConfirmClearWorldCache}>确认重置</button>
        </div>
      </section>
    </div>
  )
}
