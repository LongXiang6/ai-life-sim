'use client'

/**
 * @module Toast.tsx
 * @description Toast 通知分子组件 —— 多类型提示 + 滑入动画 + 自动消失
 * @mod mod-ui
 *
 * 使用 React Portal 渲染到 document.body，确保始终在遮罩层之上。
 * 不透明白色背景 + 彩色左边框区分类型，避免在深色遮罩上隐形。
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/foundation/utils/cn'

// ==================== 类型定义 ====================

export interface ToastItem {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  duration?: number,
}

export interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void,
}

// ==================== 类型配置 ====================

interface TypeConfig {
  icon: string
  borderColor: string
  iconColor: string,
}

const TYPE_CONFIGS: Record<ToastItem['type'], TypeConfig> = {
  success: {
    icon: '\u2713',
    borderColor: 'border-l-[var(--color-success)]',
    iconColor: 'text-[var(--color-success)]',
  },
  warning: {
    icon: '\u26A0',
    borderColor: 'border-l-[var(--color-warning)]',
    iconColor: 'text-[var(--color-warning)]',
  },
  error: {
    icon: '\u2717',
    borderColor: 'border-l-[var(--color-error)]',
    iconColor: 'text-[var(--color-error)]',
  },
  info: {
    icon: '\u2139',
    borderColor: 'border-l-[var(--color-primary)]',
    iconColor: 'text-[var(--color-primary)]',
  },
}

// ==================== 单条 Toast ====================

function ToastItemComponent({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: (id: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const config = TYPE_CONFIGS[toast.type]

  useEffect(() => {
    // 下一帧触发滑入动画
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // 自动消失
  useEffect(() => {
    const ms = toast.duration ?? 4000
    const timer = setTimeout(() => onDismiss(toast.id), ms)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg border border-[var(--color-border)] border-l-4 shadow-lg bg-[var(--color-bg)]',
        config.borderColor,
        'transition-all duration-300 ease-out',
        visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      )}
      role="alert"
    >
      <span className={cn('text-base font-bold flex-shrink-0 mt-0.5', config.iconColor)}>
        {config.icon}
      </span>
      <p className="flex-1 text-sm text-[var(--color-text-primary)] leading-relaxed">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors text-base leading-none"
        aria-label="关闭通知"
      >
        &times;
      </button>
    </div>
  )
}

// ==================== Toast 容器 ====================

/**
 * Toast 通知容器组件 —— 多类型提示 + 滑入动画 + 自动消失
 * @param {ToastContainerProps} props - 组件属性
 */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed top-4 right-4 z-[1500] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <ToastItemComponent key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  )
}
