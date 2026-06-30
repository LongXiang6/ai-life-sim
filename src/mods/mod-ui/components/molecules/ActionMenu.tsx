'use client'

/**
 * @module ActionMenu.tsx
 * @description 操作菜单分子组件 —— 更多操作下拉菜单（分支/存档/结算/主界面）
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：图标 + 文字明确标识每个操作
 *   - Deference：点击弹出，不干扰主流程
 *   - Depth：绝对定位浮层 + 阴影
 */

import { useState, useRef, useEffect } from 'react'

import { useRouter } from 'next/navigation'

import { useToastStore } from '../../store'

export interface ActionMenuItem {
  label: string
  icon: string
  onClick: () => void
  disabled?: boolean
}

export interface ActionMenuProps {
  items?: ActionMenuItem[]
}

const DEFAULT_ITEMS: ActionMenuItem[] = [
  {
    label: '分支选择',
    icon: '\u2913',
    onClick: () => { /* placeholder */ },
  },
  {
    label: '存档',
    icon: '\u25C8',
    onClick: () => { /* placeholder */ },
  },
  {
    label: '结算',
    icon: '\u229B',
    onClick: () => { /* placeholder */ },
  },
  {
    label: '主界面',
    icon: '\u2302',
    onClick: () => { /* placeholder */ },
  },
]

/**
 * 操作菜单组件 —— 更多操作下拉菜单，支持分支/存档/结算/主界面
 * @param {ActionMenuProps} props - 组件属性
 */
export function ActionMenu({ items = DEFAULT_ITEMS }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const addToast = useToastStore((s) => s.addToast)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleItemClick = (item: ActionMenuItem) => {
    if (item.disabled) return
    // 主界面跳转
    if (item.label === '主界面') {
      router.push('/')
      addToast('info', '返回主界面')
    } else if (item.label === '存档') {
      addToast('info', '存档功能开发中')
    } else if (item.label === '结算') {
      addToast('info', '结算功能开发中')
    } else if (item.label === '分支选择') {
      addToast('info', '分支选择功能开发中')
    }
    item.onClick()
    setOpen(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-xl"
        aria-label="更多操作"
        aria-expanded={open}
      >
        &hellip;
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 min-w-[180px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-xl z-50 overflow-hidden">
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              disabled={item.disabled}
              onClick={() => handleItemClick(item)}
              className={[
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                item.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-[var(--color-bg-tertiary)] cursor-pointer',
                idx < items.length - 1 ? 'border-b border-[var(--color-border)]' : '',
              ].join(' ')}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="text-[var(--color-text-primary)]">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
