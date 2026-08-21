'use client'

/**
 * Purpose: Own the cross-world, cross-life reincarnation talent library.
 * Owner: mod-character
 * Responsibility: Persist and enforce the 36-slot library capacity; replaced lineage versions stay single-source.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { REINCARNATION_LIBRARY_MAX_SLOTS } from '@/core/account/account-contract'

import type { ReincarnationTalent } from './types'
import { sanitizeReincarnationTalent } from './utils/character-state-migration'

interface ReincarnationLibraryStore {
  talents: ReincarnationTalent[]
  /** 以 lineageId 稳定替换旧版本；全新 lineageId 且已满则抛错。 */
  addReincarnationTalent: (talent: ReincarnationTalent) => ReincarnationTalent
  removeReincarnationTalent: (id: string) => void
  replaceReincarnationTalents: (talents: ReincarnationTalent[]) => void
}

export const useReincarnationLibraryStore = create<ReincarnationLibraryStore>()(
  persist(
    (set, get) => ({
      talents: [],
      addReincarnationTalent: (input) => {
        const talent = sanitizeReincarnationTalent(input)
        if (!talent) throw new Error('轮回天赋结构无效')
        const existingIndex = get().talents.findIndex((item) => item.lineageId === talent.lineageId)
        if (existingIndex >= 0) {
          set((state) => ({
            talents: state.talents.map((item, index) => index === existingIndex ? talent : item),
          }))
          return talent
        }
        if (get().talents.length >= REINCARNATION_LIBRARY_MAX_SLOTS) {
          throw new Error(`轮回天赋栏位已满（${REINCARNATION_LIBRARY_MAX_SLOTS} 项），请先移除一项旧天赋`)
        }
        set((state) => ({ talents: [...state.talents, talent] }))
        return talent
      },
      removeReincarnationTalent: (id) => set((state) => ({
        talents: state.talents.filter((talent) => talent.id !== id),
      })),
      replaceReincarnationTalents: (talents) => {
        if (talents.length > REINCARNATION_LIBRARY_MAX_SLOTS) {
          throw new Error(`轮回天赋不能超过 ${REINCARNATION_LIBRARY_MAX_SLOTS} 项`)
        }
        const sanitized = talents
          .map(sanitizeReincarnationTalent)
          .filter((item): item is ReincarnationTalent => item !== null)
        if (sanitized.length !== talents.length) throw new Error('轮回天赋数据无效')
        set({ talents: sanitized })
      },
    }),
    {
      name: 'mod-character:persist:reincarnation-library',
      version: 1,
      migrate: (persistedState: unknown) => {
        const raw = persistedState && typeof persistedState === 'object' && !Array.isArray(persistedState)
          ? persistedState as { talents?: unknown }
          : {}
        const talents = Array.isArray(raw.talents)
          ? raw.talents.map(sanitizeReincarnationTalent).filter((item): item is ReincarnationTalent => item !== null)
          : []
        return { talents }
      },
      partialize: (state) => ({ talents: state.talents }),
    },
  ),
)
