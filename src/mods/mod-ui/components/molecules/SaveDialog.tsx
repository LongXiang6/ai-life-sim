'use client'

/**
 * @module SaveDialog.tsx
 * @description 游戏内手动存档弹窗 —— 槽位选择 + 存档命名
 * @mod mod-ui
 */

import { useMemo, useState, useCallback } from 'react'

import { MAX_MANUAL_SAVE_SLOTS, saveManager } from '@/core/storage/save-manager'
import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'

import styles from './SaveDialog.module.css'

interface SaveDialogProps {
  open: boolean
  onClose: () => void
  onSave: (slot: number, name: string) => Promise<void> | void
  onCloudSave?: (name: string) => Promise<void> | void
  cloudSave: CloudManualSaveSummary | null
  cloudLoading?: boolean
  defaultWorldName?: string
  defaultCharacterName?: string
}

/**
 * 存档弹窗组件 —— 槽位选择 + 存档命名
 * @param {SaveDialogProps} props - 组件属性
 */
export function SaveDialog({ open, onClose, onSave, onCloudSave, cloudSave, cloudLoading, defaultWorldName, defaultCharacterName }: SaveDialogProps) {
  if (!open) return null

  return (
    <SaveDialogContent
      onClose={onClose}
      onSave={onSave}
      onCloudSave={onCloudSave}
      cloudSave={cloudSave}
      cloudLoading={cloudLoading}
      defaultWorldName={defaultWorldName}
      defaultCharacterName={defaultCharacterName}
    />
  )
}

/** 仅在弹窗打开时挂载，使每次打开与关闭都自然重置局部状态。 */
function SaveDialogContent({
  onClose,
  onSave,
  onCloudSave,
  cloudSave,
  cloudLoading = false,
  defaultWorldName,
  defaultCharacterName,
}: Omit<SaveDialogProps, 'open'>) {
  // slot 为 0 表示用户尚未选择槽位（所有槽位都已占用时不预选，避免误覆盖）
  const [slot, setSlot] = useState(0)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [destination, setDestination] = useState<'local' | 'cloud'>('local')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [confirmOverwriteTarget, setConfirmOverwriteTarget] = useState<number | 'cloud' | null>(null)

  const nextSlotRaw = saveManager.getNextSlot()
  // 存在空闲槽位时推荐该槽位；所有槽位都已占用时不做推荐（0 = 无）
  const nextSlot = nextSlotRaw > MAX_MANUAL_SAVE_SLOTS ? 0 : nextSlotRaw
  // 用户未显式选择时（slot 为 0），仅在有空闲槽位时自动选中推荐槽位
  const activeSlot = slot >= 1 && slot <= MAX_MANUAL_SAVE_SLOTS ? slot : nextSlot
  const localOccupied = activeSlot >= 1 && saveManager.slotExists(activeSlot)
  const occupied = destination === 'cloud' ? Boolean(cloudSave) : localOccupied
  const overwriteTarget = destination === 'cloud' ? 'cloud' : activeSlot
  const awaitingOverwriteConfirmation = occupied && confirmOverwriteTarget === overwriteTarget

  const suggestedName = useMemo(() => {
    const parts = [defaultWorldName, defaultCharacterName].filter(Boolean)
    if (destination === 'cloud') return parts.length > 0 ? `${parts.join(' · ')} · 云端` : '云端人生'
    return parts.length > 0 ? `${parts.join(' · ')} · 存档 ${activeSlot}` : `存档 ${activeSlot}`
  }, [activeSlot, defaultCharacterName, defaultWorldName, destination])

  const handleSave = useCallback(async () => {
    if (saving) return
    if (destination === 'local' && activeSlot < 1) {
      setMessage({ type: 'warning', text: '所有槽位均已占用，请先选择一个要覆盖的槽位' })
      return
    }
    if (destination === 'cloud' && !onCloudSave) {
      setMessage({ type: 'warning', text: '登录后才可使用云端栏位' })
      return
    }
    if (occupied && confirmOverwriteTarget !== overwriteTarget) {
      setConfirmOverwriteTarget(overwriteTarget)
      setMessage({
        type: 'warning',
        text: destination === 'cloud'
          ? '云端栏位的原存档将被永久覆盖，请再次确认'
          : `槽位 ${activeSlot} 的原存档将被永久覆盖，请再次确认`,
      })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const saveName = name.trim() || suggestedName
      if (destination === 'cloud') await onCloudSave!(saveName)
      else await onSave(activeSlot, saveName)
      setSlot(activeSlot)
      setConfirmOverwriteTarget(null)
      setMessage({
        type: 'success',
        text: destination === 'cloud' ? '已保存到云端栏位' : `已保存到槽位 ${activeSlot}`,
      })
      window.setTimeout(onClose, 600)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }, [activeSlot, confirmOverwriteTarget, destination, name, occupied, onCloudSave, onClose, onSave, overwriteTarget, saving, suggestedName])

  const handleDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    void handleSave()
  }, [handleSave])

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={handleDialogKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="存档"
    >
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>保存存档</h2>

        <div className={styles.destinationTabs} role="group" aria-label="存档位置">
          <button
            type="button"
            aria-pressed={destination === 'local'}
            onClick={() => {
              setDestination('local')
              setConfirmOverwriteTarget(null)
              setMessage(null)
            }}
          >
            本机栏位
          </button>
          <button
            type="button"
            aria-pressed={destination === 'cloud'}
            disabled={!onCloudSave}
            onClick={() => {
              setDestination('cloud')
              setConfirmOverwriteTarget(null)
              setMessage(null)
            }}
          >
            云端栏位
          </button>
        </div>

        {/* 槽位选择 */}
        {destination === 'local' ? <div className={styles.section}>
          <p className={styles.label}>存档槽位</p>
          <div className={styles.slotGrid}>
            {Array.from({ length: MAX_MANUAL_SAVE_SLOTS }, (_, index) => index + 1).map((s) => {
              const occupied = saveManager.slotExists(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSlot(s)
                    setConfirmOverwriteTarget(null)
                    setMessage(saveManager.slotExists(s) ? { type: 'warning', text: `槽位 ${s} 已有存档，保存会覆盖原内容` } : null)
                  }}
                  className={`${styles.slotBtn} ${activeSlot === s ? styles.slotBtnActive : ''} ${occupied ? styles.slotBtnOccupied : ''}`}
                  aria-label={`槽位 ${s}${occupied ? '，已占用' : '，空闲'}`}
                  aria-pressed={activeSlot === s}
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
        </div> : (
          <div className={styles.section}>
            <p className={styles.label}>账号专属栏位</p>
            <div className={styles.cloudSlot} data-state={cloudSave ? 'occupied' : 'empty'}>
              <strong>{cloudLoading ? '正在读取...' : cloudSave?.name || '空栏位'}</strong>
              <small>
                {cloudSave
                  ? `${cloudSave.worldName || '未知世界'} · ${cloudSave.characterName || '未命名'} · 第 ${cloudSave.totalRounds} 轮`
                  : '尚未保存云端人生'}
              </small>
            </div>
          </div>
        )}

        {/* 存档命名 */}
        <div className={styles.section}>
          <label className={styles.label} htmlFor="save-dialog-name">存档名称</label>
          <input
            id="save-dialog-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleNameKeyDown}
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
              {destination === 'cloud' ? '云端栏位' : `槽位 ${activeSlot}`}已有存档，保存会覆盖原内容。
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
            disabled={saving || cloudLoading || (destination === 'local' && activeSlot < 1)}
            className={`${styles.saveBtn} ${awaitingOverwriteConfirmation ? styles.saveBtnDanger : ''}`}
          >
            {saving
              ? '保存中...'
              : cloudLoading
                ? '读取中...'
                : destination === 'local' && activeSlot < 1
                ? '请选择槽位'
                : awaitingOverwriteConfirmation
                  ? destination === 'cloud' ? '确认覆盖云端' : `确认覆盖 ${activeSlot}`
                  : occupied
                    ? destination === 'cloud' ? '覆盖云端存档' : `覆盖存档 ${activeSlot}`
                    : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
