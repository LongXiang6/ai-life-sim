/**
 * @module theme-store.ts
 * @description 主题状态管理 —— Zustand Store，支持 3 主题切换（极简白 / 极简黑 / 阅读黄）
 * @mod core
 *
 * Apple HIG：
 *   - Clarity：极简模式下 UI 退居其次，内容优先
 *   - Deference：极简模式去装饰化，阅读黄模式暖色调护眼
 *   - Depth：阅读黄模式可保留背景层次
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

/** 主题类型 */
export type ThemeType = 'minimal-white' | 'minimal-black' | 'reading-yellow' | 'dark-cosmos' | 'light-aurora' | 'cyber-neon'

/** 定版界面固定使用白纸主题；保留旧类型仅用于兼容历史持久化值。 */
export const STARFIELD_THEMES: ThemeType[] = []

/** 主题 Store 状态 */
interface ThemeState {
  theme: ThemeType
  setTheme: (theme: ThemeType) => void
  themes: ThemeType[],
}

/** 旧主题 → 新主题映射（v4 → v5 迁移） */
const LEGACY_THEME_MAP: Record<string, ThemeType> = {
  default: 'minimal-white',
  dark: 'minimal-black',
  cultivation: 'reading-yellow',
  wuxia: 'reading-yellow',
  scifi: 'minimal-black',
  apocalypse: 'minimal-black',
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
        migrate: (persistedState: { theme?: string; themes?: ThemeType[] } | unknown, version: number) => {
          const state = persistedState as { theme?: string; themes?: ThemeType[] }
          // v0 → v1: 迁移旧主题值到新主题
          if (version === 0) {
            const oldTheme = state?.theme
            if (oldTheme && LEGACY_THEME_MAP[oldTheme]) {
              state.theme = LEGACY_THEME_MAP[oldTheme]
            }
          }
          return { ...state, theme: 'minimal-white', themes: ['minimal-white'] } as ThemeState
        },
        version: 2,
      },
    ),
    { name: 'core-theme' },
  ),
)
