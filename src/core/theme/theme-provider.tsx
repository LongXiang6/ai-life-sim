/**
 * @module theme-provider.tsx
 * @description 主题 Provider 组件 —— 注入 data-theme 属性实现主题切换
 * @mod core
 *
 * 规范来源：design-tokens.md §1 主题切换机制
 * 修复内容：主题 ID 统一为 design-tokens.md 定义，移除 CSS 类名切换
 */

'use client'

import { useEffect } from 'react'

import { useThemeStore, STARFIELD_THEMES } from './theme-store'
import { useFontFamily } from './font-config'
import { useFontStore } from './font-store'

/**
 * 主题 Provider 组件
 *
 * 注入 data-theme 属性，根据当前主题应用字体和星空背景。
 *
 * @param props - 组件属性
 * @param props.children - 子节点
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme)
  const fontFamily = useFontStore((s) => s.fontFamily)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useFontFamily(fontFamily)

  const showStarfield = STARFIELD_THEMES.includes(theme)

  return (
    <>
      {children}
      {showStarfield && <StarfieldOverlay />}
    </>
  )
}

/** 星空背景遮罩层 */
function StarfieldOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 50%, var(--color-primary-light) 0%, transparent 70%)',
        opacity: 0.15,
      }}
      aria-hidden
    />
  )
}
