'use client'

/**
 * @module Button.tsx
 * @description 按钮原子组件 —— 4 种 variant + 3 种 size + loading 态
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：明确的按钮层级（primary 主操作 / secondary 次操作 / outline 边框 / default 文字）
 *   - Deference：内容优先，颜色通过 Design Token 控制
 *   - Depth：hover/active 视觉反馈
 */

import type { CSSProperties } from 'react'
import type { ComponentSize, ComponentVariant } from '../../types'

export interface ButtonProps {
  children: React.ReactNode
  variant?: ComponentVariant
  size?: ComponentSize
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  className?: string
  style?: CSSProperties
  type?: 'button' | 'submit' | 'reset'
}

const sizeClasses: Record<ComponentSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
  md: 'px-4 py-2 text-base rounded-lg gap-2',
  lg: 'px-6 py-3 text-lg rounded-xl gap-2.5',
}

const variantClasses: Record<ComponentVariant, string> = {
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] active:scale-[0.98]',
  secondary:
    'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] active:scale-[0.98]',
  outline:
    'border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-border-focus)] hover:text-[var(--color-primary)] active:scale-[0.98]',
  default:
    'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] active:scale-[0.98]',
  ghost:
    'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] active:scale-[0.98] border-transparent',
}

/**
 * 按钮组件 —— 支持 5 种 variant + 3 种 size + loading 态
 * @param {ButtonProps} props - 组件属性
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  className = '',
  style,
  type = 'button',
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      style={style}
      className={[
        'inline-flex items-center justify-center font-medium transition-all duration-150 select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100',
        sizeClasses[size],
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
