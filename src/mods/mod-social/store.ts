'use client'

import { create } from 'zustand'

import type {
  RelationshipRecord,
  RelationshipSystemPersistenceState,
  RelationshipTransition,
} from '@/foundation'

interface RelationshipStore {
  relationships: RelationshipRecord[]
  transitions: RelationshipTransition[]
  replacePersistenceState: (state: RelationshipSystemPersistenceState) => void
  reset: () => void
}

const initialState = {
  relationships: [] as RelationshipRecord[],
  transitions: [] as RelationshipTransition[],
}

export const useRelationshipStore = create<RelationshipStore>()((set) => ({
  ...initialState,
  replacePersistenceState: (state) => set({
    relationships: structuredClone(state.relationships),
    transitions: structuredClone(state.transitions),
  }),
  reset: () => set({
    relationships: [],
    transitions: [],
  }),
}))

export function selectRelationshipPersistenceState(): RelationshipSystemPersistenceState {
  const state = useRelationshipStore.getState()
  return {
    schemaVersion: 1,
    relationships: structuredClone(state.relationships),
    transitions: structuredClone(state.transitions),
  }
}
