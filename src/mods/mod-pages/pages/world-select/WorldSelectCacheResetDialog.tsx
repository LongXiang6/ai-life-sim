/** Purpose: Render the per-world cache reset confirmation dialog. Owner: mod-pages/world-select. Responsibility: Present confirmation and focus handling while cache ownership stays in the page hook. */

'use client'

import { useEffect, useRef } from 'react'

import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectCacheResetDialog({ logic }: { logic: WorldSelectLogic }) {
  const dialog = logic.pendingCacheReset
  const cancelReset = logic.handleCancelClearWorldCache
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelButtonRef.current?.focus({ preventScroll: true })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelReset()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        if (document.activeElement === cancelButtonRef.current) confirmButtonRef.current?.focus()
        else cancelButtonRef.current?.focus()
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
        <h2 id="world-cache-reset-title">清除「{dialog.worldName}」的缓存？</h2>
        <p id="world-cache-reset-description">
          只清除该世界的命格候选与命格抽取页状态，不会删除世界、设置或长期角色资料。
        </p>
        <div className={styles.cacheDialogActions}>
          <button ref={cancelButtonRef} type="button" onClick={logic.handleCancelClearWorldCache}>取消</button>
          <button ref={confirmButtonRef} type="button" className={styles.cacheDialogConfirm} onClick={logic.handleConfirmClearWorldCache}>确认清除</button>
        </div>
      </section>
    </div>
  )
}
