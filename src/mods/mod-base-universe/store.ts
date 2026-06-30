'use client'

/**
 * @module useBaseUniverseStore
 * @description mod-base-universe Zustand Store —— 天象/纪元/世界地图/命运预言 4 子系统状态
 * @mod mod-base-universe
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type {
  CelestialState,
  EraState,
  WorldMapState,
  FateProphecyState,
  DivineState,
  BaseUniverseSummary,
} from './types'

interface BaseUniverseStore {
  celestial: CelestialState
  era: EraState
  worldMap: WorldMapState
  fateProphecy: FateProphecyState
  divineCreation: DivineState

  getSummary: () => BaseUniverseSummary

  setCelestial: (state: Partial<CelestialState>) => void
  setEra: (state: Partial<EraState>) => void
  setWorldMap: (state: Partial<WorldMapState>) => void
  setFateProphecy: (state: Partial<FateProphecyState>) => void
  setDivineCreation: (state: Partial<DivineState>) => void

  reset: () => void,
}

const initialCelestial: CelestialState = {
  currentPhase: 'normal',
  phaseDuration: 0,
  cooldownYears: 0,
  lastRollEraYear: 0,
  activeEvents: [],
  history: [],
  crossEffects: [],
}

const initialEra: EraState = {
  currentEraName: '蛮荒时代',
  currentEraStart: 0,
  yearsIntoEra: 0,
  nextEraName: null,
  yearsUntilNext: null,
  phase: 'opening',
  hint: '蛮荒时代元年初立',
  history: [{ name: '蛮荒时代', startAnchorYear: 0, endedYear: null, },],
  speedMultiplier: 1,
}

const initialWorldMap: WorldMapState = {
  initialized: false,
  mapTemplate: 'continental',
  regions: [],
}

const initialFateProphecy: FateProphecyState = {
  prophecies: [],
  causalityPenalty: 0,
  activeProphecyCount: 0,
  lastAdvanceQuarter: 0,
  recentFulfilled: [],
  recentBroken: [],
  recentOmens: [],
}

const initialDivineCreation: DivineState = {
  initialized: false,
  enabled: false,
  activeDeities: [],
  divineFavor: {},
  interventionProbability: 0,
  worldview: undefined,
}

export const useBaseUniverseStore = create<BaseUniverseStore>()(
  persist(
    (set, get,) => ({
  celestial: initialCelestial,
  era: initialEra,
  worldMap: initialWorldMap,
  fateProphecy: initialFateProphecy,
  divineCreation: initialDivineCreation,

  getSummary: () => {
    const s = get()
    return {
      celestial: s.celestial,
      era: s.era,
      worldMap: s.worldMap,
      fateProphecy: s.fateProphecy,
      divineCreation: s.divineCreation,
    }
  },

  setCelestial: (partial,) => set((s,) => ({ celestial: { ...s.celestial, ...partial, }, }),),
  setEra: (partial,) => set((s,) => ({ era: { ...s.era, ...partial, }, }),),
  setWorldMap: (partial,) => set((s,) => ({ worldMap: { ...s.worldMap, ...partial, }, }),),
  setFateProphecy: (partial,) => set((s,) => ({ fateProphecy: { ...s.fateProphecy, ...partial, }, }),),
  setDivineCreation: (partial,) => set((s,) => ({ divineCreation: { ...s.divineCreation, ...partial, }, }),),

  reset: () => set({
    celestial: initialCelestial,
    era: initialEra,
    worldMap: initialWorldMap,
    fateProphecy: initialFateProphecy,
    divineCreation: initialDivineCreation,
    }),
  }),
  {
    name: 'mod-base-universe:persist:base-universe-state',
    version: 1,
    migrate: (persistedState: unknown, _version: number) => persistedState as BaseUniverseStore,
    partialize: (state,) => {
      const { getSummary: _a, setCelestial: _b, setEra: _c, setWorldMap: _d, setFateProphecy: _e, setDivineCreation: _f, reset: _g, ...rest } = state
      return rest
    },
  },
  ),
)
