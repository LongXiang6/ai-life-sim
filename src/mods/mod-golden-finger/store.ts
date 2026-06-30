'use client'

/**
 * @module useGoldenFingerStore
 * @description mod-golden-finger Zustand Store
 * @mod mod-golden-finger
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type { GoldenFingerState, } from './types'

interface GoldenFingerStore {
  goldenFinger: GoldenFingerState
  setGoldenFinger: (partial: Partial<GoldenFingerState>) => void
  reset: () => void,
}

const initial: GoldenFingerState = {
  mode: 'off',
  assigned: false,
  template: null,
  level: 0,
  levelProgress: 0,
  unlockedFeatures: [],
}

export const useGoldenFingerStore = create<GoldenFingerStore>()(
  persist(
    (set,) => ({
      goldenFinger: { ...initial, },
      setGoldenFinger: (partial,) =>
        set((s,) => ({ goldenFinger: { ...s.goldenFinger, ...partial, }, }),),
      reset: () => set({ goldenFinger: { ...initial, }, },),
    }),
    {
      name: 'mod-golden-finger:persist:golden-finger-state',
      version: 1,
      migrate: (persistedState: unknown, _version: number) => persistedState as GoldenFingerStore,
      partialize: (state,) => {
        const { setGoldenFinger: _a, reset: _b, ...rest } = state
        return rest
      },
    },
  ),
)
