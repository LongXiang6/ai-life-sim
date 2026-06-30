'use client'

/**
 * @module font-store.ts
 * @description 字体状态管理 —— Zustand Store，持久化字体选择到 localStorage
 * @mod core
 *
 * 从 mod-settings 提升到 Core 层，消除 theme-provider → mod-settings 的违规依赖
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 字体族 */
export type FontFamily =
  | 'default'
  | 'pingfang'
  | 'yahei'
  | 'source-han-sans'
  | 'songti'
  | 'heiti'
  | 'kaiti'

/** 字体 Store 状态 */
interface FontState {
  fontFamily: FontFamily
  setFontFamily: (font: FontFamily) => void
}

export const useFontStore = create<FontState>()(
  persist(
    (set) => ({
      fontFamily: 'default',
      setFontFamily: (fontFamily) => set({ fontFamily }),
    }),
    { name: 'core-font-storage' },
  ),
)
