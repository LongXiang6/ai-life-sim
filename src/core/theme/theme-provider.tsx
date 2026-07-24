/**
 * @module theme-provider.tsx
 * @description 定版主题 Provider —— 固定注入 minimal-white 并应用字体偏好
 * @mod core
 *
 * 旧主题样式已移除，运行时不再创建主题遮罩或可切换的视觉分支。
 */

'use client'

import { useEffect } from 'react'

import { useThemeStore } from './theme-store'
import { useFontFamily } from './font-config'
import { useFontStore } from './font-store'

/**
 * 主题 Provider 组件
 *
 * 注入唯一主题属性并应用字体偏好。
 *
 * @param props - 组件属性
 * @param props.children - 子节点
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme)
  const fontFamily = useFontStore((s) => s.fontFamily)

  useEffect(() => {
    if (theme !== 'minimal-white') useThemeStore.getState().setTheme('minimal-white')
    document.documentElement.setAttribute('data-theme', 'minimal-white')
  }, [theme])

  useFontFamily(fontFamily)

  return children
}
