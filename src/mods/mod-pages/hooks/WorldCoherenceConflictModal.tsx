'use client'

/**
 * @module WorldCoherenceConflictModal.tsx
 * @description 世界观描述与标签冲突确认弹窗
 * @mod mod-pages
 */

import { Button, Modal } from '@/mods/mod-ui'
import type { CoherencePreview } from '@/mods/mod-world'

export interface WorldCoherenceConflictModalProps {
  open: boolean
  preview: CoherencePreview | null
  onApplyCorrection: () => void
  onKeepUserTags: () => void
  onClose: () => void
}

export function WorldCoherenceConflictModal({
  open,
  preview,
  onApplyCorrection,
  onKeepUserTags,
  onClose,
}: WorldCoherenceConflictModalProps) {
  if (!preview) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="世界观标签与描述冲突"
      footer={(
        <>
          <Button variant="outline" onClick={onKeepUserTags}>
            保持我的选择
          </Button>
          <Button onClick={onApplyCorrection}>
            按描述校正
          </Button>
        </>
      )}
    >
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">
        {preview.inference.reason ?? '世界描述与当前标签不一致。'}
      </p>
      {preview.changes.length > 0 && (
        <ul className="space-y-2 text-sm">
          {preview.changes.map((c) => (
            <li
              key={c.field}
              className="flex justify-between gap-4 px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)]"
            >
              <span className="text-[var(--color-text-secondary)]">{c.label}</span>
              <span className="text-[var(--color-text-primary)] font-medium">
                {String(c.from)} → {String(c.to)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[var(--color-text-tertiary)] mt-4">
        「按描述校正」将优先 worldDescription；「保持我的选择」将锁定标签，不再自动覆盖。
      </p>
    </Modal>
  )
}
