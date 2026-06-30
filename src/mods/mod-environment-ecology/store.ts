'use client'

/**
 * @module useEnvironmentEcologyStore
 * @description mod-environment-ecology Zustand Store —— 气候/地理/生态/自然资源/污染 5 状态分片
 * @mod mod-environment-ecology
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type {
  ClimateState,
  GeographyState,
  EcologyState,
  NaturalResourceState,
  PollutionState,
  EnvironmentEcologySummary,
} from './types'

import {
  INITIAL_RESOURCE_RESERVES,
  BASE_REGENERATION_RATE,
  BASE_CONSUMPTION_RATE,
} from './constants'

interface EnvironmentEcologyStore {
  climate: ClimateState
  geography: GeographyState
  ecology: EcologyState
  naturalResource: NaturalResourceState
  pollution: PollutionState

  getSummary: () => EnvironmentEcologySummary

  setClimate: (state: Partial<ClimateState>) => void
  setGeography: (state: Partial<GeographyState>) => void
  setEcology: (state: Partial<EcologyState>) => void
  setNaturalResource: (state: Partial<NaturalResourceState>) => void
  setPollution: (state: Partial<PollutionState>) => void

  reset: () => void,
}

const initialClimate: ClimateState = {
  temperatureOffset: 0,
  humidity: 50,
  season: 'spring',
  seasonProgress: 0,
  activeDisasters: [],
  climateZones: {},
  seasonEffects: {
    diseaseRiskMultiplier: 1,
    incomeMultiplier: 1,
    staminaCostMultiplier: 1,
    healthRegenMultiplier: 1,
    narrativeTheme: 'default',
  },
  specialSeason: null,
}

const initialGeography: GeographyState = {
  regionTerrains: {},
  tectonicEvents: [],
  climateShiftProgress: 0,
  recentlyChanged: [],
}

const initialEcology: EcologyState = {
  metrics: {
    biodiversityIndex: 70,
    resilience: 60,
    habitatIntegrity: 80,
    foodChainStability: 65,
  },
  species: [],
  invasiveSpecies: [],
  extinctionEvents: [],
  overexploitationYears: 0,
}

const initialNaturalResource: NaturalResourceState = {
  resources: {
    mineral: {
      type: 'mineral',
      totalReserves: INITIAL_RESOURCE_RESERVES['mineral'],
      regenerationRate: BASE_REGENERATION_RATE['mineral'],
      consumptionRate: BASE_CONSUMPTION_RATE['mineral'],
      renewable: false,
    },
    forest: {
      type: 'forest',
      totalReserves: INITIAL_RESOURCE_RESERVES['forest'],
      regenerationRate: BASE_REGENERATION_RATE['forest'],
      consumptionRate: BASE_CONSUMPTION_RATE['forest'],
      renewable: true,
    },
    water: {
      type: 'water',
      totalReserves: INITIAL_RESOURCE_RESERVES['water'],
      regenerationRate: BASE_REGENERATION_RATE['water'],
      consumptionRate: BASE_CONSUMPTION_RATE['water'],
      renewable: true,
    },
    farmland: {
      type: 'farmland',
      totalReserves: INITIAL_RESOURCE_RESERVES['farmland'],
      regenerationRate: BASE_REGENERATION_RATE['farmland'],
      consumptionRate: BASE_CONSUMPTION_RATE['farmland'],
      renewable: true,
    },
    energy: {
      type: 'energy',
      totalReserves: INITIAL_RESOURCE_RESERVES['energy'],
      regenerationRate: BASE_REGENERATION_RATE['energy'],
      consumptionRate: BASE_CONSUMPTION_RATE['energy'],
      renewable: false,
    },
    special: {
      type: 'special',
      totalReserves: INITIAL_RESOURCE_RESERVES['special'],
      regenerationRate: BASE_REGENERATION_RATE['special'],
      consumptionRate: BASE_CONSUMPTION_RATE['special'],
      renewable: false,
    },
  },
  alarms: [],
}

const initialPollution: PollutionState = {
  regionPollutions: {},
  globalPollutionIndex: 0,
}

export const useEnvironmentEcologyStore = create<EnvironmentEcologyStore>()(
  persist(
    (set, get,) => ({
  climate: initialClimate,
  geography: initialGeography,
  ecology: initialEcology,
  naturalResource: initialNaturalResource,
  pollution: initialPollution,

  getSummary: () => {
    const s = get()
    return {
      climate: s.climate,
      geography: s.geography,
      ecology: s.ecology,
      naturalResource: s.naturalResource,
      pollution: s.pollution,
    }
  },

  setClimate: (partial,) => set((s,) => ({ climate: { ...s.climate, ...partial, }, }),),
  setGeography: (partial,) => set((s,) => ({ geography: { ...s.geography, ...partial, }, }),),
  setEcology: (partial,) => set((s,) => ({ ecology: { ...s.ecology, ...partial, }, }),),
  setNaturalResource: (partial,) => set((s,) => ({ naturalResource: { ...s.naturalResource, ...partial, }, }),),
  setPollution: (partial,) => set((s,) => ({ pollution: { ...s.pollution, ...partial, }, }),),

  reset: () => set({
    climate: initialClimate,
    geography: initialGeography,
    ecology: initialEcology,
    naturalResource: initialNaturalResource,
    pollution: initialPollution,
    }),
  }),
  {
    name: 'mod-environment-ecology:persist:environment-ecology-state',
    version: 1,
    migrate: (persistedState: unknown, _version: number) => persistedState as EnvironmentEcologyStore,
    partialize: (state,) => {
      const { getSummary: _a, setClimate: _b, setGeography: _c, setEcology: _d, setNaturalResource: _e, setPollution: _f, reset: _g, ...rest } = state
      return rest
    },
  },
  ),
)
