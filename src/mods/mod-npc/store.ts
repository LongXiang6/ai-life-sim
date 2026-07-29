'use client'

import { create } from 'zustand'

import type { NpcSystemPersistenceState } from '@/foundation'

interface NpcSystemStore extends NpcSystemPersistenceState {
  replacePersistenceState: (state: NpcSystemPersistenceState) => void
  reset: () => void
}

const emptyState: NpcSystemPersistenceState = {
  schemaVersion: 1,
  identities: [],
  contextStates: [],
  goals: [],
  behaviorRecords: [],
  memories: [],
  memoryCompressions: [],
}

export const useNpcSystemStore = create<NpcSystemStore>()((set) => ({
  ...structuredClone(emptyState),
  replacePersistenceState: (state) => set({
    schemaVersion: 1,
    identities: structuredClone(state.identities),
    contextStates: structuredClone(state.contextStates),
    goals: structuredClone(state.goals),
    behaviorRecords: structuredClone(state.behaviorRecords),
    memories: structuredClone(state.memories),
    memoryCompressions: structuredClone(state.memoryCompressions),
  }),
  reset: () => set(structuredClone(emptyState)),
}))

export function selectNpcSystemPersistenceState(): NpcSystemPersistenceState {
  const state = useNpcSystemStore.getState()
  return {
    schemaVersion: 1,
    identities: structuredClone(state.identities),
    contextStates: structuredClone(state.contextStates),
    goals: structuredClone(state.goals),
    behaviorRecords: structuredClone(state.behaviorRecords),
    memories: structuredClone(state.memories),
    memoryCompressions: structuredClone(state.memoryCompressions),
  }
}
