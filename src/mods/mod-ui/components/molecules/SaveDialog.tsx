'use client'

/**
 * @module SaveDialog.tsx
 * @description 游戏内手动存档弹窗 —— 槽位选择 + 存档命名
 * @mod mod-ui
 */

import { useMemo, useState, useCallback } from 'react'

import { saveManager } from '@/core/storage/save-manager'

import styles from './SaveDialog.module.css'

interface SaveDialogProps {
  open: boolean
  onClose: () => void
  onSave: (slot: number, name: string) => Promise<void> | void
  defaultWorldName?: string
  defaultCharacterName?: string
}

/**
 * 存档弹窗组件 —— 槽位选择 + 存档命名
 * @param {SaveDialogProps} props - 组件属性
 */
export function SaveDialog({ open, onClose, onSave, defaultWorldName, defaultCharacterName }: SaveDialogProps) {
  // slot 为 0 表示用户尚未选择槽位（所有槽位都已占用时不预选，避免误覆盖）
  const [slot, setSlot] = useState(0)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)

  const nextSlotRaw = saveManager.getNextSlot()
  // 存在空闲槽位时推荐该槽位；所有槽位都已占用时不做推荐（0 = 无）
  const nextSlot = nextSlotRaw > 5 ? 0 : nextSlotRaw
  // 用户未显式选择时（slot 为 0），仅在有空闲槽位时自动选中推荐槽位
  const activeSlot = slot >= 1 && slot <= 5 ? slot : nextSlot
  const occupied = activeSlot >= 1 && saveManager.slotExists(activeSlot)

  const suggestedName = useMemo(() => {
    const parts = [defaultWorldName, defaultCharacterName].filter(Boolean)
    return parts.length > 0 ? `${parts.join(' · ')} · 存档 ${activeSlot}` : `存档 ${activeSlot}`
  }, [activeSlot, defaultCharacterName, defaultWorldName])

  const handleSave = useCallback(async () => {
    if (saving) return
    if (activeSlot < 1) {
      setMessage({ type: 'warning', text: '所有槽位均已占用，请先选择一个要覆盖的槽位' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const saveName = name.trim() || suggestedName
      await onSave(activeSlot, saveName)
      setMessage({ type: 'success', text: `已保存到槽位 ${activeSlot}` })
      window.setTimeout(onClose, 600)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }, [activeSlot, name, suggestedName, saving, onSave, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') handleSave()
  }, [onClose, handleSave])

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="存档"
    >
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>保存存档</h2>

        {/* 槽位选择 */}
        <div className={styles.section}>
          <label className={styles.label}>存档槽位</label>
          <div className={styles.slotGrid}>
            {[1, 2, 3, 4, 5].map((s) => {
              const occupied = saveManager.slotExists(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSlot(s)
                    setMessage(saveManager.slotExists(s) ? { type: 'warning', text: `槽位 ${s} 已有存档，保存会覆盖原内容` } : null)
                  }}
                  className={`${styles.slotBtn} ${activeSlot === s ? styles.slotBtnActive : ''} ${occupied ? styles.slotBtnOccupied : ''}`}
                >
                  {s}
                  {occupied && <span className={styles.slotOccupiedText}>已占用</span>}
                </button>
              )
            })}
          </div>
          <p className={styles.hint}>
            {nextSlot >= 1 ? `推荐使用槽位 ${nextSlot}` : '所有槽位均已占用，请选择一个要覆盖的槽位'}
          </p>
        </div>

        {/* 存档命名 */}
        <div className={styles.section}>
          <label className={styles.label}>存档名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestedName}
            className={styles.nameInput}
            autoFocus
          />
          {defaultWorldName && defaultCharacterName && (
            <p className={styles.hint}>
              {defaultWorldName} · {defaultCharacterName}
            </p>
          )}
          {occupied && !message && (
            <p className={styles.warningText}>
              槽位 {activeSlot} 已有存档，保存会覆盖原内容。
            </p>
          )}
          {message && (
            <p className={`${styles.message} ${message.type === 'error' ? styles.messageError : message.type === 'success' ? styles.messageSuccess : styles.messageWarning}`}>
              {message.text}
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelBtn}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || activeSlot < 1}
            className={styles.saveBtn}
          >
            {saving ? '保存中...' : activeSlot < 1 ? '请选择槽位' : occupied ? `覆盖存档 ${activeSlot}` : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
