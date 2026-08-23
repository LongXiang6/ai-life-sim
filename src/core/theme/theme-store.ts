/**
 * Purpose: Own the persisted runtime theme selection and legacy theme migration.
 * Owner: core/theme
 * Responsibility: Validate the four supported themes and expose one switching contract.
 *
 * @module theme-store.ts
 * @description 运行时主题状态 —— 三套基础主题的唯一状态所有者
 * @mod core
 *
 * 主题只负责界面表现，不进入人生模拟状态。旧版本主题 ID 只在迁移边界
 * 被接受，并统一归一到当前三套主题之一。
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

/** 运行态可用的基础主题。多彩主题提供纯白基底和鲜艳可选的彩色语义 Token。 */
export type ThemeType = 'reading' | 'night' | 'white' | 'colorful'

export const DEFAULT_THEME: ThemeType = 'reading'
export const THEME_TYPES: ThemeType[] = ['reading', 'night', 'white', 'colorful']

export const THEME_LABELS: Record<ThemeType, string> = {
  reading: '阅读主题',
  night: '暗夜主题',
  white: '白色主题',
  colorful: '多彩主题',
}

const LEGACY_THEME_MAP: Record<string, ThemeType> = {
  default: 'reading',
  reading: 'reading',
  'reading-yellow': 'reading',
  cultivation: 'reading',
  wuxia: 'reading',
  'light-aurora': 'reading',
  white: 'white',
  'minimal-white': 'reading',
  night: 'night',
  dark: 'night',
  'minimal-black': 'night',
  'dark-cosmos': 'night',
  scifi: 'night',
  apocalypse: 'night',
  'cyber-neon': 'night',
  colorful: 'colorful',
  'rainbow-reading': 'colorful',
}

/** 将外部导入、云端快照和旧持久化值归一到当前主题集合。 */
export function normalizeTheme(value: unknown): ThemeType {
  if (typeof value !== 'string') return DEFAULT_THEME
  return LEGACY_THEME_MAP[value] ?? DEFAULT_THEME
}

interface ThemeState {
  theme: ThemeType
  setTheme: (theme: ThemeType) => void
  themes: ThemeType[]
}

export const useThemeStore = create<ThemeState>()(
  devtools(
    persist(
      (set) => ({
        theme: DEFAULT_THEME,
        themes: THEME_TYPES,
        setTheme: (nextTheme) => {
          const theme = normalizeTheme(nextTheme)
          set({ theme })
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', theme)
          }
        },
      }),
      {
        name: 'core-theme-store',
        migrate: (persistedState: unknown) => {
          const state = (persistedState && typeof persistedState === 'object')
            ? persistedState as { theme?: unknown }
            : {}
          return {
            theme: normalizeTheme(state.theme),
            themes: THEME_TYPES,
          } as ThemeState
        },
        version: 4,
      },
    ),
    { name: 'core-theme' },
  ),
)
