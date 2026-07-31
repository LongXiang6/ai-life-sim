'use client'
import { create } from 'zustand'
import type { BaseUniverseSummary, CelestialState, DivineState, EraState, FateProphecyState } from './types'

const celestial: CelestialState = { contextId: '', currentPhase: 'normal', dayOfLocalYear: 0, localYearLength: 365, activePhenomena: [], history: [], updatedAtTotalDays: 0 }
const era: EraState = { contextId: '', currentEraName: '', anchorYear: 0, localYear: 0, dayOfYear: 0, daysPerYear: 365, phase: 'opening', updatedAtTotalDays: 0 }
const fateProphecy: FateProphecyState = { contextId: '', enabled: false, prophecies: [], causalityPenalty: 0, recentFulfilled: [], recentBroken: [], recentOmens: [], updatedAtTotalDays: 0 }
const divineCreation: DivineState = { contextId: '', initialized: false, enabled: false, deities: [], updatedAtTotalDays: 0 }
interface BaseUniverseStore extends BaseUniverseSummary { getSummary: () => BaseUniverseSummary; reset: () => void }
export const useBaseUniverseStore = create<BaseUniverseStore>((set, get) => ({
  celestial: structuredClone(celestial), era: structuredClone(era), fateProphecy: structuredClone(fateProphecy), divineCreation: structuredClone(divineCreation),
  getSummary: () => ({ celestial: get().celestial, era: get().era, fateProphecy: get().fateProphecy, divineCreation: get().divineCreation }),
  reset: () => set({ celestial: structuredClone(celestial), era: structuredClone(era), fateProphecy: structuredClone(fateProphecy), divineCreation: structuredClone(divineCreation) }),
}))
