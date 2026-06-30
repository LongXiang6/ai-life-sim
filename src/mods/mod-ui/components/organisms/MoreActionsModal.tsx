'use client'

/**
 * @module MoreActionsModal
 * @description 更多操作弹窗有机体组件 —— 分支/存档/结算/主界面
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Depth：全屏遮罩 + 弹窗体 + 毛玻璃
 *   - Deference：弹窗从底部滑入，不遮挡主内容
 */

import { cn } from '@/foundation/utils/cn'

// ==================== 类型 ====================

interface ActionItem {
  icon: string
  label: string
  description?: string
  onClick: () => void
  variant?: 'default' | 'danger'
}

export interface MoreActionsModalProps {
  isOpen: boolean
  onClose: () => void
  actions: ActionItem[]
  className?: string
}

// ==================== 组件 ====================

/**
 * 更多操作弹窗组件 —— 分支/存档/结算/主界面
 * @param {MoreActionsModalProps} props - 组件属性
 */
export function MoreActionsModal({ isOpen, onClose, actions, className }: MoreActionsModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗体 */}
      <div
        className={cn(
          'relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-2xl',
          'animate-[slideUp_0.3s_ease-out]',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label="更多操作"
      >
        {/* 拖拽指示条 */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--color-text-tertiary)]/30" />
        </div>

        {/* 标题 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">操作</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 操作列表 */}
        <div className="px-3 pb-6 space-y-1">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                action.onClick()
                onClose()
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer',
                'hover:bg-[var(--color-bg-secondary)] active:scale-[0.98]',
                action.variant === 'danger' && 'hover:bg-[var(--color-error)]/10',
              )}
            >
              <span className="text-xl w-8 text-center">{action.icon}</span>
              <div className="flex-1 text-left">
                <div className={cn(
                  'text-sm font-medium',
                  action.variant === 'danger'
                    ? 'text-[var(--color-error)]'
                    : 'text-[var(--color-text-primary)]',
                )}>
                  {action.label}
                </div>
                {action.description && (
                  <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    {action.description}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
