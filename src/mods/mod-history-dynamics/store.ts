'use client'

/**
 * @module useHistoryDynamicsStore
 * @description mod-history-dynamics Zustand Store —— 事件池 + 因果模拟状态分片
 * @mod mod-history-dynamics
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type { EventPoolState, CausalSimulationState, HistoryDynamicsSummary, } from './types'

interface HistoryDynamicsStore {
  eventPool: EventPoolState
  causalSimulation: CausalSimulationState

  getSummary: () => HistoryDynamicsSummary

  setEventPool: (state: Partial<EventPoolState>) => void
  setCausalSimulation: (state: Partial<CausalSimulationState>) => void

  reset: () => void,
}

const initialEventPool: EventPoolState = {
  entries: [],
  presetUsedIndices: [],
  lastCleanupYear: 0,
}

const initialCausalSimulation: CausalSimulationState = {
  queue: {
    pending: [],
    resolved: [],
    recentDecadeCount: 0,
    recent30YearCount: 0,
  },
  lastProcessYear: 0,
}

export const useHistoryDynamicsStore = create<HistoryDynamicsStore>()(
  persist(
    (set, get,) => ({
      eventPool: initialEventPool,
      causalSimulation: initialCausalSimulation,

      getSummary: () => {
        const s = get()
        return {
          eventPool: s.eventPool,
          causalSimulation: s.causalSimulation,
        }
      },

      setEventPool: (partial,) => set((s,) => ({ eventPool: { ...s.eventPool, ...partial, }, }),),
      setCausalSimulation: (partial,) => set((s,) => ({ causalSimulation: { ...s.causalSimulation, ...partial, }, }),),

      reset: () => set({
        eventPool: initialEventPool,
        causalSimulation: initialCausalSimulation,
      },),
    }),
    {
      name: 'mod-history-dynamics:persist:history-dynamics-state',
      version: 1,
      migrate: (persistedState: unknown, _version: number) => persistedState as HistoryDynamicsStore,
      partialize: (state,) => {
        const { getSummary: _a, setEventPool: _b, setCausalSimulation: _c, reset: _d, ...rest } = state
        return rest
      },
    },
  ),
)
