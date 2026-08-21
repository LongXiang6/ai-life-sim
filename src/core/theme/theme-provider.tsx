/**
 * Purpose: Project the selected theme into the document and apply font preferences.
 * Owner: core/theme
 * Responsibility: Keep runtime theme attributes synchronized with the core theme store.
 *
 * @module theme-provider.tsx
 * @description 应用主题 Provider —— 将核心主题状态投影为 data-theme 属性并应用字体偏好
 * @mod core
 */

'use client'

import { useEffect } from 'react'

import { useFontFamily } from './font-config'
import { useFontStore } from './font-store'
import { useThemeStore } from './theme-store'

/** 主题 Provider 组件。 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme)
  const fontFamily = useFontStore((state) => state.fontFamily)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useFontFamily(fontFamily)

  return children
}
