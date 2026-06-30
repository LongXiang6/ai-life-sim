'use client'

/**
 * @module Tabs.tsx
 * @description 标签页切换分子组件 —— 下划线样式标签导航
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：激活 Tab 下划线 + 颜色高亮
 *   - Depth：底部 border 分隔 Tab 栏与内容区
 */

export interface TabItem {
  id: string
  label: string
  disabled?: boolean
}

export interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

/**
 * 标签页切换组件 —— 下划线样式标签导航
 * @param {TabsProps} props - 组件属性
 */
export function Tabs({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps) {
  return (
    <nav
      className={[
        'flex border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] overflow-x-auto',
        className,
      ].join(' ')}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={[
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 border-b-2',
            tab.disabled
              ? 'text-[var(--color-text-tertiary)] cursor-not-allowed border-transparent'
              : activeTab === tab.id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
