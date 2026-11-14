'use client'

/**
 * Purpose: Persist the player's selected narrative difficulty.
 * Owner: mod-difficulty
 * Responsibility: Difficulty selection state and persistence only.
 */

/**
 * @module store.ts
 * @description Zustand Store —— 五档叙事难度状态
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
      name: 'mod-difficulty:persist:narrative-difficulty-v2',
      version: 1,
      partialize: (state,) => {
        const { setLevel: _a, getConfig: _b, ...rest } = state
        return rest
      },
    },
  ),
)
