'use client'

/**
 * @module PageShell.tsx
 * @description 页面布局壳有机体组件 —— 导航栏 + 内容区 + 底部栏
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：固定导航 + 可滚动内容区，层级分明
 *   - Depth：导航栏 border-bottom 分隔，sticky 定位
 */

import { Button } from '../atoms/Button'

export interface PageShellProps {
  title: string
  children: React.ReactNode
  backTo?: string
  backLabel?: string
  onBack?: () => void
  actions?: React.ReactNode
}

/**
 * 页面布局壳组件 —— 导航栏 + 内容区 + 底部栏
 * @param {PageShellProps} props - 组件属性
 */
export function PageShell({
  title,
  children,
  backTo,
  backLabel = '返回',
  onBack,
  actions,
}: PageShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {actions}
          {(onBack || backTo) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBack ?? (() => {})}
            >
              {backLabel}
            </Button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
