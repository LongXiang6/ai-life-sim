'use client'

/**
 * @module useWorldCoherenceConfirm.tsx
 * @description 世界观一致性冲突确认 Hook
 * @mod mod-pages
 */

import { useCallback, useRef, useState } from 'react'

import type { WorldConfig } from '@/mods/mod-world'
import {
  applyCoherenceKeepUserTags,
  applyCoherenceToWorldConfig,
  previewCoherenceCorrection,
  type CoherencePreview,
} from '@/mods/mod-world'

import { WorldCoherenceConflictModal } from './WorldCoherenceConflictModal'

type ResolveChoice = 'apply' | 'keep'

export function useWorldCoherenceConfirm() {
  const [preview, setPreview] = useState<CoherencePreview | null>(null)
  const [pendingConfig, setPendingConfig] = useState<WorldConfig | null>(null)
  const resolverRef = useRef<((config: WorldConfig) => void) | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  const resolveWithChoice = useCallback((choice: ResolveChoice) => {
    if (!pendingConfig || !resolverRef.current) return
    const final = choice === 'apply'
      ? applyCoherenceToWorldConfig(pendingConfig, { logWarnings: false })
      : applyCoherenceKeepUserTags(pendingConfig)
    setPreview(null)
    setPendingConfig(null)
    const cb = resolverRef.current
    resolverRef.current = null
    cancelRef.current = null
    cb(final)
  }, [pendingConfig])

  const requestCoherenceResolve = useCallback((
    draft: WorldConfig,
    onResolved: (config: WorldConfig) => void,
    onCancel?: () => void,
  ) => {
    const p = previewCoherenceCorrection(draft)
    if (!p.hasConflict) {
      onResolved(p.resolved)
      return
    }
    setPendingConfig(draft)
    setPreview(p)
    resolverRef.current = onResolved
    cancelRef.current = onCancel ?? null
  }, [])

  const dismissConflict = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    setPreview(null)
    setPendingConfig(null)
    resolverRef.current = null
  }, [])

  const conflictModal = (
    <WorldCoherenceConflictModal
      open={preview !== null && pendingConfig !== null}
      preview={preview}
      onApplyCorrection={() => resolveWithChoice('apply')}
      onKeepUserTags={() => resolveWithChoice('keep')}
      onClose={dismissConflict}
    />
  )

  return { requestCoherenceResolve, conflictModal }
}
