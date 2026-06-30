'use client'

/**
 * @module store.ts
 * @description Zustand Store —— 四档难度状态管理
 * @mod mod-difficulty
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type { DifficultyLevel, DifficultyConfig, DifficultyStoreState, } from './types'

import { DIFFICULTY_CONFIG, DEFAULT_DIFFICULTY, } from './constants'

export const useDifficultyStore = create<DifficultyStoreState>()(
  persist(
    (set, get,) => ({
      level: DEFAULT_DIFFICULTY,

      setLevel: (level: DifficultyLevel,) => {
        set({ level, },)
      },

      getConfig: (): DifficultyConfig => {
        return DIFFICULTY_CONFIG[get().level] ?? DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY]
      },
    }),
    {
      name: 'mod-difficulty:persist:difficulty-state',
      version: 1,
      migrate: (persistedState: unknown, _version: number) => persistedState as DifficultyStoreState,
      partialize: (state,) => {
        const { setLevel: _a, getConfig: _b, ...rest } = state
        return rest
      },
    },
  ),
)
