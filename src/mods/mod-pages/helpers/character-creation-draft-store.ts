/**
 * Purpose: Persist the long-lived character identity draft and project cloud-compatible snapshots.
 * Owner: mod-pages
 * Responsibility: Character creation draft state and cloud boundary adaptation only; starting attributes remain in mod-character.
 */

'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  CloudCharacterDraftSchema,
  DEFAULT_CLOUD_CHARACTER_DRAFT,
  type CloudCharacterDraft,
} from '@/core/account/account-contract'

type CharacterCreationDraft = Omit<CloudCharacterDraft, 'attributes'>

const CharacterCreationDraftSchema = CloudCharacterDraftSchema.omit({ attributes: true })

interface CharacterCreationDraftStore {
  draft: CharacterCreationDraft
  updateDraft: (patch: Partial<CharacterCreationDraft>) => void
  replaceDraft: (draft: CloudCharacterDraft) => void
  resetDraft: () => void
}

function normalizeDraft(input: unknown): CharacterCreationDraft | null {
  if (!input || typeof input !== 'object') return null
  const { attributes: _legacyAttributes, ...candidate } = input as Record<string, unknown>
  const parsed = CharacterCreationDraftSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function createDefaultDraft(): CharacterCreationDraft {
  const { attributes: _legacyAttributes, ...draft } = DEFAULT_CLOUD_CHARACTER_DRAFT
  return {
    ...draft,
    customGenders: [],
    customRaces: [],
    backgroundPresets: {},
  }
}

function draftsEqual(left: CharacterCreationDraft, right: CharacterCreationDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const useCharacterCreationDraftStore = create<CharacterCreationDraftStore>()(
  persist(
    (set, get) => ({
      draft: createDefaultDraft(),
      updateDraft: (patch) => {
        const next = CharacterCreationDraftSchema.parse({ ...get().draft, ...patch })
        if (!draftsEqual(get().draft, next)) set({ draft: next })
      },
      replaceDraft: (input) => {
        const draft = normalizeDraft(input)
        if (!draft) return
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
        const draft = normalizeDraft(candidate)
        return draft ? { ...currentState, draft } : currentState
      },
    },
  ),
)

export function getCharacterCreationDraftSnapshot(): CloudCharacterDraft {
  return {
    ...useCharacterCreationDraftStore.getState().draft,
    attributes: { ...DEFAULT_CLOUD_CHARACTER_DRAFT.attributes },
  }
}
