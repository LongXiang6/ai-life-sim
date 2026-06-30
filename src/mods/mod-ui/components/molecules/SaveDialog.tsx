'use client'

/**
 * @module SaveDialog.tsx
 * @description 游戏内手动存档弹窗 —— 槽位选择 + 存档命名
 * @mod mod-ui
 */

import { useMemo, useState, useCallback } from 'react'

import { saveManager } from '@/core/storage/save-manager'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="存档"
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">保存存档</h2>

        {/* 槽位选择 */}
        <div className="mb-4">
          <label className="block text-sm text-[var(--color-text-secondary)] mb-2">存档槽位</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((s) => {
              const occupied = saveManager.slotExists(s)
              return (
                <button
                  key={s}
                  onClick={() => {
                    setSlot(s)
                    setMessage(saveManager.slotExists(s) ? { type: 'warning', text: `槽位 ${s} 已有存档，保存会覆盖原内容` } : null)
                  }}
                  className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                    activeSlot === s
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : occupied
                        ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50'
                  }`}
                >
                  {s}
                  {occupied && <span className="block text-xs">已占用</span>}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            {nextSlot >= 1 ? `推荐使用槽位 ${nextSlot}` : '所有槽位均已占用，请选择一个要覆盖的槽位'}
          </p>
        </div>

        {/* 存档命名 */}
        <div className="mb-6">
          <label className="block text-sm text-[var(--color-text-secondary)] mb-2">存档名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestedName}
            className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            autoFocus
          />
          {defaultWorldName && defaultCharacterName && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              {defaultWorldName} · {defaultCharacterName}
            </p>
          )}
          {occupied && !message && (
            <p className="text-xs text-[var(--color-warning)] mt-2">
              槽位 {activeSlot} 已有存档，保存会覆盖原内容。
            </p>
          )}
          {message && (
            <p className={`text-xs mt-2 ${message.type === 'error' ? 'text-[var(--color-error)]' : message.type === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
              {message.text}
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || activeSlot < 1}
            className="flex-1 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中...' : activeSlot < 1 ? '请选择槽位' : occupied ? `覆盖存档 ${activeSlot}` : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
