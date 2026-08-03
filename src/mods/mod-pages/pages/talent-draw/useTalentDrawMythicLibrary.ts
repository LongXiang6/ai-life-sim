/**
 * Purpose: Manage mythic-pattern selection and dialog focus for the talent-draw page.
 * Owner: mod-pages/talent-draw
 * Responsibility: Mythic library state, commands, and focus containment only.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  MYTHIC_PATTERN_SELECT_COUNT,
  useCharacterStore,
  useMythicLibraryStore,
} from '@/mods/mod-character'

import type { MythicPattern } from '@/mods/mod-character'

export function useTalentDrawMythicLibrary(notify: (message: string) => void) {
  const mythicLibrary = useMythicLibraryStore((state) => state.patterns)
  const equippedMythicPatterns = useCharacterStore((state) => state.equippedMythicPatterns)
  const setEquippedMythicPatterns = useCharacterStore((state) => state.setEquippedMythicPatterns)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [activeMythicSlot, setActiveMythicSlot] = useState(0)
  const librarySheetRef = useRef<HTMLElement | null>(null)
  const libraryTriggerRef = useRef<HTMLButtonElement | null>(null)
  const libraryCloseRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!libraryOpen) return
    const trigger = libraryTriggerRef.current
    const focusFrame = window.requestAnimationFrame(() => libraryCloseRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      const sheet = librarySheetRef.current
      if (!sheet) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setLibraryOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      trigger?.focus()
    }
  }, [libraryOpen])

  const handleToggleMythic = useCallback((pattern: MythicPattern | null) => {
    if (!pattern) {
      setEquippedMythicPatterns([])
      setLibraryOpen(false)
      notify('已清空轮回天赋槽')
      return
    }
    const existingIndex = equippedMythicPatterns.findIndex((item) => item.id === pattern.id)
    if (existingIndex >= 0) {
      setEquippedMythicPatterns(equippedMythicPatterns.filter((_, index) => index !== existingIndex))
      notify(`已移除${pattern.name}`)
      return
    }
    if (equippedMythicPatterns.length >= MYTHIC_PATTERN_SELECT_COUNT) {
      notify(`最多携带 ${MYTHIC_PATTERN_SELECT_COUNT} 项轮回天赋`)
      return
    }
    const insertionIndex = Math.min(activeMythicSlot, equippedMythicPatterns.length)
    setEquippedMythicPatterns([
      ...equippedMythicPatterns.slice(0, insertionIndex),
      pattern,
      ...equippedMythicPatterns.slice(insertionIndex),
    ])
    setLibraryOpen(false)
    notify(`轮回天赋 · ${pattern.name}`)
  }, [activeMythicSlot, equippedMythicPatterns, notify, setEquippedMythicPatterns])

  const handleOpenMythicSlot = useCallback((slotIndex: number) => {
    setActiveMythicSlot(slotIndex)
    setLibraryOpen(true)
  }, [])

  return {
    activeMythicSlot,
    equippedMythicPatterns,
    handleOpenMythicSlot,
    handleToggleMythic,
    libraryCloseRef,
    libraryOpen,
    librarySheetRef,
    libraryTriggerRef,
    mythicLibrary,
    setLibraryOpen,
  }
}
