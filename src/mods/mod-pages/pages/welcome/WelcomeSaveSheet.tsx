/** Purpose: Render welcome-page save selection and deletion confirmation. Owner: mod-pages. Responsibility: Save-sheet presentation and event forwarding only. */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SaveMetadata } from '@/core/storage/save-manager'
import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'

import viewStyles from './WelcomeView.module.css'
import styles from './WelcomeSaveSheet.module.css'

interface WelcomeSaveSheetProps {
  runtimeReady: boolean
  saves: SaveMetadata[]
  cloudSave: CloudManualSaveSummary | null
  selectedSaveId: string | null
  onSelectSave: (saveId: string) => void
  onContinueSave: (slot: number) => Promise<boolean>
  onDeleteSave: (slot: number) => Promise<boolean>
  onContinueCloudSave: () => Promise<boolean>
  onDeleteCloudSave: () => Promise<boolean>
}

type WelcomeSaveItem =
  | { id: string; source: 'local'; save: SaveMetadata }
  | { id: 'cloud'; source: 'cloud'; save: CloudManualSaveSummary }

const saveDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function getSaveLabel(save: SaveMetadata): string {
  return save.characterName?.trim() || save.name?.trim() || `槽位 ${save.slot}`
}

function getItemLabel(item: WelcomeSaveItem): string {
  return item.source === 'cloud'
    ? item.save.characterName?.trim() || item.save.name?.trim() || '云端人生'
    : getSaveLabel(item.save)
}

function getItemDetail(item: WelcomeSaveItem): string {
  if (item.source === 'cloud') {
    return [
      item.save.worldName?.trim(),
      `第 ${item.save.totalRounds} 轮`,
      '云端栏位',
      saveDateFormatter.format(new Date(item.save.updatedAt)),
    ].filter(Boolean).join(' · ')
  }
  return getSaveDetail(item.save)
}

function getItemTimestamp(item: WelcomeSaveItem): number {
  return item.source === 'cloud' ? item.save.updatedAt : item.save.timestamp
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
  runtimeReady,
  saves,
  cloudSave,
  selectedSaveId,
  onSelectSave,
  onContinueSave,
  onDeleteSave,
  onContinueCloudSave,
  onDeleteCloudSave,
}: WelcomeSaveSheetProps) {
  const [open, setOpen] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WelcomeSaveItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)
  const deleteConfirmRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const saveItems = useMemo<WelcomeSaveItem[]>(() => [
    ...(cloudSave ? [{ id: 'cloud' as const, source: 'cloud' as const, save: cloudSave }] : []),
    ...saves.map((save) => ({ id: `local:${save.slot}`, source: 'local' as const, save })),
  ].sort((left, right) => getItemTimestamp(right) - getItemTimestamp(left)), [cloudSave, saves])
  const latestSave = saveItems[0] ?? null
  const selectedSave = useMemo(
    () => saveItems.find((save) => save.id === selectedSaveId) ?? latestSave,
    [latestSave, saveItems, selectedSaveId],
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
    if (!selectedSave && latestSave) onSelectSave(latestSave.id)
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
      const didNavigate = selectedSave.source === 'cloud'
        ? await onContinueCloudSave()
        : await onContinueSave(selectedSave.save.slot)
      if (didNavigate) closeSheet(false)
    } finally {
      setIsContinuing(false)
    }
  }, [closeSheet, isContinuing, onContinueCloudSave, onContinueSave, selectedSave])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || isDeleting) return
    setIsDeleting(true)
    try {
      const didDelete = deleteTarget.source === 'cloud'
        ? await onDeleteCloudSave()
        : await onDeleteSave(deleteTarget.save.slot)
      if (didDelete) setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }, [deleteTarget, isDeleting, onDeleteCloudSave, onDeleteSave])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={viewStyles.routeAction}
        disabled={!runtimeReady}
        aria-expanded={open}
        aria-controls="welcome-save-sheet"
        onClick={openSheet}
        title="展开存档栏位，选择一段人生继续"
      >
        <strong>📖 继续人生</strong>
        <small>
          {latestSave
            ? `${saveItems.length} 个存档 · 最近：${getItemLabel(latestSave)}`
            : '暂无存档 · 可从故事页手动保存'}
        </small>
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
            <strong id="welcome-save-sheet-title">🗂️ 选择存档</strong>
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

        {saveItems.length > 0 ? (
          <div className={styles.saveList} aria-label="存档栏位">
            {saveItems.map((save) => {
              const active = selectedSave?.id === save.id
              return (
                <div key={save.id} className={styles.saveItem} data-active={active}>
                  <button
                    type="button"
                    className={styles.saveItemSelect}
                    aria-pressed={active}
                    tabIndex={open ? 0 : -1}
                    disabled={isContinuing}
                    onClick={() => onSelectSave(save.id)}
                  >
                    <span>
                      <strong>{getItemLabel(save)}</strong>
                      <small>{getItemDetail(save)}</small>
                    </span>
                    <span className={styles.saveCheck} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.saveItemDelete}
                    aria-label={`删除${getItemLabel(save)}`}
                    tabIndex={open ? 0 : -1}
                    disabled={isContinuing || isDeleting}
                    onClick={() => setDeleteTarget(save)}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className={styles.saveEmpty}>尚无可继续的存档。进入故事后，可在“当前信息 → 更多”中手动保存。</p>
        )}

        <button
          type="button"
          className={styles.continueSave}
          disabled={!selectedSave || !runtimeReady || isContinuing}
          tabIndex={open ? 0 : -1}
          onClick={() => void handleContinue()}
        >
          <strong>{isContinuing ? '正在读取人生……' : runtimeReady ? '▶ 继续此人生' : '核心模拟系统加载中……'}</strong>
          <small>{selectedSave ? getItemLabel(selectedSave) : '暂无可用存档'}</small>
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
                “{getItemLabel(deleteTarget)}”删除后无法恢复，确定要继续吗？
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
