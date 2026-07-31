'use client'

/** UI projection of the last collected environment context. */
import { create } from 'zustand'
import type { ClimateState, EcologyState, EnvironmentEcologySummary, PollutionState } from './types'

const climate: ClimateState = { contextId: '', temperatureOffset: 0, humidity: 50, season: 'spring', seasonProgress: 0,
  seasonEffects: { diseaseRiskMultiplier: 1, incomeMultiplier: 1, staminaCostMultiplier: 1, healthRegenMultiplier: 1, narrativeTheme: '常态' },
  specialSeason: null, activeDisasters: [], climateZones: {}, updatedAtTotalDays: 0 }
const ecology: EcologyState = { contextId: '', metrics: { biodiversityIndex: 70, resilience: 60, habitatIntegrity: 80, foodChainStability: 65 },
  species: [], invasiveSpeciesIds: [], extinctionEvents: [], overexploitationYears: 0, updatedAtTotalDays: 0 }
const pollution: PollutionState = { contextId: '', regionPollutions: {}, globalPollutionIndex: 0, updatedAtTotalDays: 0 }

interface EnvironmentEcologyStore extends EnvironmentEcologySummary { getSummary: () => EnvironmentEcologySummary; reset: () => void }

export const useEnvironmentEcologyStore = create<EnvironmentEcologyStore>((set, get) => ({
  climate: structuredClone(climate), ecology: structuredClone(ecology), pollution: structuredClone(pollution),
  getSummary: () => ({ climate: get().climate, ecology: get().ecology, pollution: get().pollution }),
  reset: () => set({ climate: structuredClone(climate), ecology: structuredClone(ecology), pollution: structuredClone(pollution) }),
}))
