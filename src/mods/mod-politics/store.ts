'use client'

/** UI projection of the last collected political context. */
import { create } from 'zustand'
import type { ConflictCycleState, FactionState, LegalState, PoliticsSummary, SocialStratificationState } from './types'

const socialStratification: SocialStratificationState = { contextId: '', groups: [], playerGroupId: null, mobilityIndex: 50, updatedAtTotalDays: 0 }
const faction: FactionState = { contextId: '', entities: [], playerEntityId: null, playerContribution: 0, playerRankLabel: '', updatedAtTotalDays: 0 }
const legal: LegalState = { contextId: '', systemType: 'customary', laws: [], enforcementLevel: 50, corruption: 20, updatedAtTotalDays: 0 }
const conflictCycle: ConflictCycleState = { contextId: '', conflicts: [], updatedAtTotalDays: 0 }

interface PoliticsStore extends PoliticsSummary { getSummary: () => PoliticsSummary; reset: () => void }
export const usePoliticsStore = create<PoliticsStore>((set, get) => ({
  socialStratification: structuredClone(socialStratification), faction: structuredClone(faction), legal: structuredClone(legal), conflictCycle: structuredClone(conflictCycle),
  getSummary: () => ({ socialStratification: get().socialStratification, faction: get().faction, legal: get().legal, conflictCycle: get().conflictCycle }),
  reset: () => set({ socialStratification: structuredClone(socialStratification), faction: structuredClone(faction), legal: structuredClone(legal), conflictCycle: structuredClone(conflictCycle) }),
}))
