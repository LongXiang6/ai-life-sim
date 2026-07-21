'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  CloudCharacterDraftSchema,
  DEFAULT_CLOUD_CHARACTER_DRAFT,
  type CloudCharacterDraft,
} from '@/core/account/account-contract'

interface CharacterCreationDraftStore {
  draft: CloudCharacterDraft
  updateDraft: (patch: Partial<CloudCharacterDraft>) => void
  replaceDraft: (draft: CloudCharacterDraft) => void
  resetDraft: () => void
}

function createDefaultDraft(): CloudCharacterDraft {
  return {
    ...DEFAULT_CLOUD_CHARACTER_DRAFT,
    attributes: { ...DEFAULT_CLOUD_CHARACTER_DRAFT.attributes },
    customGenders: [],
    customRaces: [],
    backgroundPresets: {},
  }
}

function draftsEqual(left: CloudCharacterDraft, right: CloudCharacterDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const useCharacterCreationDraftStore = create<CharacterCreationDraftStore>()(
  persist(
    (set, get) => ({
      draft: createDefaultDraft(),
      updateDraft: (patch) => {
        const next = CloudCharacterDraftSchema.parse({ ...get().draft, ...patch })
        if (!draftsEqual(get().draft, next)) set({ draft: next })
      },
      replaceDraft: (input) => {
        const draft = CloudCharacterDraftSchema.parse(input)
        if (!draftsEqual(get().draft, draft)) set({ draft })
      },
      resetDraft: () => set({ draft: createDefaultDraft() }),
    }),
    {
      name: 'mod-pages:persist:character-creation-draft',
      version: 1,
      migrate: () => ({ draft: createDefaultDraft() }),
      partialize: (state) => ({ draft: state.draft }),
      merge: (persistedState, currentState) => {
        const candidate = persistedState && typeof persistedState === 'object'
          ? (persistedState as { draft?: unknown }).draft
          : undefined
        const parsed = CloudCharacterDraftSchema.safeParse(candidate)
        return parsed.success ? { ...currentState, draft: parsed.data } : currentState
      },
    },
  ),
)

export function getCharacterCreationDraftSnapshot(): CloudCharacterDraft {
  return useCharacterCreationDraftStore.getState().draft
}
