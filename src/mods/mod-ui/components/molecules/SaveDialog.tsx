'use client'

/**
 * @module SaveDialog.tsx
 * @description 游戏内手动存档弹窗 —— 槽位选择 + 存档命名
 * @mod mod-ui
 */

'use client'

import { useState, useCallback } from 'react'

import { saveManager } from '@/core/storage/save-manager'

interface SaveDialogProps {
  open: boolean
  onClose: () => void
  onSave: (slot: number, name: string) => void
  defaultWorldName?: string
  defaultCharacterName?: string
}

/**
 * 存档弹窗组件 —— 槽位选择 + 存档命名
 * @param {SaveDialogProps} props - 组件属性
 */
export function SaveDialog({ open, onClose, onSave, defaultWorldName, defaultCharacterName }: SaveDialogProps) {
  const [slot, setSlot] = useState(1)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const saveName = name.trim() || `存档 ${slot}`
      onSave(slot, saveName)
      onClose()
    } finally {
      setSaving(false)
    }
  }, [slot, name, saving, onSave, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') handleSave()
  }, [onClose, handleSave])

  if (!open) return null

  const nextSlot = saveManager.getNextSlot()

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
                  onClick={() => setSlot(s)}
                  className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                    slot === s
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
            推荐使用槽位 {nextSlot}
          </p>
        </div>

        {/* 存档命名 */}
        <div className="mb-6">
          <label className="block text-sm text-[var(--color-text-secondary)] mb-2">存档名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`存档 ${slot}`}
            className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
            autoFocus
          />
          {defaultWorldName && defaultCharacterName && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              {defaultWorldName} · {defaultCharacterName}
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
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
