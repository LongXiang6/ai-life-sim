'use client'

/**
 * @module Badge.tsx
 * @description 标签徽章原子组件 —— 世界观标签、稀有度、状态标记等
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：小尺寸高可辨识性
 *   - Depth：通过颜色区分不同类型
 */

export interface BadgeProps {
  children: React.ReactNode
  color?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
  className?: string
}

const colorClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  default: 'bg-gray-100 text-gray-700',
  primary: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
  success: 'bg-green-100 text-[var(--color-success)]',
  warning: 'bg-amber-100 text-[var(--color-warning)]',
  error: 'bg-red-100 text-[var(--color-error)]',
  info: 'bg-sky-100 text-sky-700',
}

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
} as const

/**
 * 标签徽章组件 —— 用于世界观标签、稀有度、状态标记等
 * @param {BadgeProps} props - 组件属性
 */
export function Badge({
  children,
  color = 'default',
  size = 'sm',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-medium',
        colorClasses[color],
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
