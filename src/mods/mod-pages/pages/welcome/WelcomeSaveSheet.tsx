'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SaveMetadata } from '@/core/storage/save-manager'

import styles from './WelcomeView.module.css'

interface WelcomeSaveSheetProps {
  saves: SaveMetadata[]
  selectedSlot: number | null
  onSelectSave: (slot: number) => void
  onContinueSave: (slot: number) => Promise<boolean>
  onDeleteSave: (slot: number) => Promise<boolean>
}

const saveDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function getSaveLabel(save: SaveMetadata): string {
  return save.characterName?.trim() || save.name?.trim() || `槽位 ${save.slot}`
}

function getSaveDetail(save: SaveMetadata): string {
  const parts = [
    save.worldName?.trim(),
    `第 ${save.totalRounds} 轮`,
    save.isAutoSave ? '自动存档' : `槽位 ${save.slot}`,
    saveDateFormatter.format(new Date(save.timestamp)),
  ]
  return parts.filter(Boolean).join(' · ')
}

export default function WelcomeSaveSheet({
  saves,
  selectedSlot,
  onSelectSave,
  onContinueSave,
  onDeleteSave,
}: WelcomeSaveSheetProps) {
  const [open, setOpen] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SaveMetadata | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)
  const deleteConfirmRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const latestSave = saves[0] ?? null
  const selectedSave = useMemo(
    () => saves.find((save) => save.slot === selectedSlot) ?? latestSave,
    [latestSave, saves, selectedSlot],
  )

  const closeSheet = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => returnFocusRef.current?.focus())
    }
  }, [])

  const openSheet = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerRef.current
    if (!selectedSave && latestSave) onSelectSave(latestSave.slot)
    setOpen(true)
  }, [latestSave, onSelectSave, selectedSave])

  useEffect(() => {
    if (!open || deleteTarget) return
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSheet()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      )
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeSheet, deleteTarget, open])

  useEffect(() => {
    if (!open || !deleteTarget) return
    deleteCancelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!isDeleting) setDeleteTarget(null)
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [deleteCancelRef.current, deleteConfirmRef.current]
        .filter((element): element is HTMLButtonElement => Boolean(element && !element.disabled))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [deleteTarget, isDeleting, open])

  const handleContinue = useCallback(async () => {
    if (!selectedSave || isContinuing) return
    setIsContinuing(true)
    try {
      const didNavigate = await onContinueSave(selectedSave.slot)
      if (didNavigate) closeSheet(false)
    } finally {
      setIsContinuing(false)
    }
  }, [closeSheet, isContinuing, onContinueSave, selectedSave])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || isDeleting) return
    setIsDeleting(true)
    try {
      const didDelete = await onDeleteSave(deleteTarget.slot)
      if (didDelete) setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }, [deleteTarget, isDeleting, onDeleteSave])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.routeAction} ${styles.savedAction}`}
        aria-expanded={open}
        aria-controls="welcome-save-sheet"
        onClick={openSheet}
        title="展开存档栏位，选择一段人生继续"
      >
        <span className={styles.routeIndex}>02</span>
        <span className={styles.routeCopy}>
          <strong>继续已有的人生</strong>
          <small>
            {latestSave
              ? `${saves.length} 个存档 · 最近：${getSaveLabel(latestSave)}`
              : '暂无存档 · 可从故事页手动保存'}
          </small>
        </span>
        <span className={styles.routeArrow} aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg>
        </span>
      </button>

      <section
        ref={sheetRef}
        id="welcome-save-sheet"
        className={`${styles.saveSheet} ${open ? styles.saveSheetOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-save-sheet-title"
        aria-hidden={!open}
      >
        <div className={styles.saveSheetHead}>
          <div>
            <strong id="welcome-save-sheet-title">选择存档</strong>
            <small>继续一段尚未写完的人生</small>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.saveSheetClose}
            aria-label="关闭存档"
            tabIndex={open ? 0 : -1}
            onClick={() => closeSheet()}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true"><path d="m3 3 8 8M11 3l-8 8" /></svg>
          </button>
        </div>

        {saves.length > 0 ? (
          <div className={styles.saveList} aria-label="存档栏位">
            {saves.map((save) => {
              const active = selectedSave?.slot === save.slot
              return (
                <button
                  key={save.slot}
                  type="button"
                  className={styles.saveItem}
                  aria-pressed={active}
                  tabIndex={open ? 0 : -1}
                  disabled={isContinuing}
                  onClick={() => onSelectSave(save.slot)}
                >
                  <span>
                    <strong>{getSaveLabel(save)}</strong>
                    <small>{getSaveDetail(save)}</small>
                  </span>
                  <span className={styles.saveCheck} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        ) : (
          <p className={styles.saveEmpty}>尚无可继续的存档。进入故事后，可在“当前信息 → 更多”中手动保存。</p>
        )}

        <p className={styles.saveSheetStatus} role="status" aria-live="polite">
          {selectedSave ? `已选择：${getSaveLabel(selectedSave)}` : '尚未选择存档'}
        </p>
        <button
          type="button"
          className={styles.deleteSelected}
          disabled={!selectedSave || isContinuing || isDeleting}
          tabIndex={open ? 0 : -1}
          onClick={() => selectedSave && setDeleteTarget(selectedSave)}
        >
          删除已选择的存档
        </button>
        <button
          type="button"
          className={styles.continueSave}
          disabled={!selectedSave || isContinuing}
          tabIndex={open ? 0 : -1}
          onClick={() => void handleContinue()}
        >
          <span>
            <strong>{isContinuing ? '正在读取人生……' : '继续此人生'}</strong>
            <small>{selectedSave ? getSaveLabel(selectedSave) : '暂无可用存档'}</small>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>

        {deleteTarget && (
          <div
            className={styles.deleteDialogOverlay}
            role="presentation"
            onClick={() => { if (!isDeleting) setDeleteTarget(null) }}
          >
            <div
              className={styles.deleteDialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="welcome-delete-save-title"
              aria-describedby="welcome-delete-save-description"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="welcome-delete-save-title">删除这段人生？</h2>
              <p id="welcome-delete-save-description">
                “{getSaveLabel(deleteTarget)}”删除后无法恢复，确定要继续吗？
              </p>
              <div className={styles.deleteDialogActions}>
                <button
                  ref={deleteCancelRef}
                  type="button"
                  className={styles.deleteCancel}
                  disabled={isDeleting}
                  onClick={() => setDeleteTarget(null)}
                >
                  取消
                </button>
                <button
                  ref={deleteConfirmRef}
                  type="button"
                  className={styles.deleteConfirm}
                  disabled={isDeleting}
                  onClick={() => void handleDeleteConfirm()}
                >
                  {isDeleting ? '删除中…' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
