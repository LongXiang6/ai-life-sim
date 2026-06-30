'use client'

/**
 * @module Modal.tsx
 * @description 模态弹窗分子组件 —— 遮罩层 + 居中弹窗 + 关闭按钮
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：弹窗居中，遮罩半透明
 *   - Depth：z-index 分层 + 点击遮罩关闭
 */

import { useEffect } from 'react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * 模态弹窗组件 —— 遮罩层 + 居中弹窗 + 关闭按钮
 * @param {ModalProps} props - 组件属性
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className = '',
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={onClose}
        aria-label="关闭弹窗"
      />
      <div
        className={[
          'relative z-10 w-full max-w-lg mx-4 rounded-2xl bg-[var(--color-bg-primary)] shadow-xl',
          className,
        ].join(' ')}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
            >
              <svg
                className="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
