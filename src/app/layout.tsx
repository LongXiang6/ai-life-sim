/**
 * @module layout.tsx
 * @description 根布局 —— 主题注入 + 全局 Provider + Foundation Token
 * @mod app
 *
 * 规范来源：mod-specification.md §10 主题系统规范
 *
 * 待实现：
 *   - MOD 加载器初始化（所有 MOD 按序加载）
 *   - 全局 Store Provider 注入
 */

import './globals.css'

import { ThemeProvider } from '@/core/theme'

import { InitMods } from './_components/init-mods'
import { StorageInit } from './_components/storage-init'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 人生模拟器',
  description: 'AI 驱动的人生模拟器',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <StorageInit>
            <InitMods>
              {children}
            </InitMods>
          </StorageInit>
        </ThemeProvider>
      </body>
    </html>
  )
}
