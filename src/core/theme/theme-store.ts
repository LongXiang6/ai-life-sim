/**
 * @module theme-store.ts
 * @description 定版界面主题状态 —— 固定为极简白，并归一化历史持久化值
 * @mod core
 *
 * 历史主题 ID 仅在迁移边界被接受，不再进入运行态或样式选择器。
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

/** 定版方案唯一运行主题。 */
export type ThemeType = 'minimal-white'

/** 主题 Store 状态 */
interface ThemeState {
  theme: ThemeType
  setTheme: (theme: ThemeType) => void
  themes: ThemeType[],
}

/** 历史主题 ID 只用于迁移，全部归一化到定版主题。 */
const LEGACY_THEME_MAP: Record<string, ThemeType> = {
  default: 'minimal-white',
  dark: 'minimal-white',
  cultivation: 'minimal-white',
  wuxia: 'minimal-white',
  scifi: 'minimal-white',
  apocalypse: 'minimal-white',
  'minimal-black': 'minimal-white',
  'reading-yellow': 'minimal-white',
  'dark-cosmos': 'minimal-white',
  'light-aurora': 'minimal-white',
  'cyber-neon': 'minimal-white',
}

export const useThemeStore = create<ThemeState>()(
  devtools(
    persist(
      (set) => ({
        theme: 'minimal-white',
        themes: ['minimal-white'],
        setTheme: () => {
          set({ theme: 'minimal-white' })
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', 'minimal-white')
          }
        },
      }),
      {
        name: 'core-theme-store',
        migrate: (persistedState: { theme?: string; themes?: ThemeType[] } | unknown, _version: number) => {
          const state = persistedState as { theme?: string; themes?: ThemeType[] }
          const oldTheme = state?.theme
          if (oldTheme && LEGACY_THEME_MAP[oldTheme]) state.theme = LEGACY_THEME_MAP[oldTheme]
          return { ...state, theme: 'minimal-white', themes: ['minimal-white'] } as ThemeState
        },
        version: 3,
      },
    ),
    { name: 'core-theme' },
  ),
)
