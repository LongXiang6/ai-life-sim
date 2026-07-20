'use client'

/**
 * @module ProgressBar.tsx
 * @description 进度条原子组件 —— 回合进度、任务进度、修炼进度等
 * @mod mod-ui
 */

export interface ProgressBarProps {
  value: number
  max: number
  label?: string
  showPercent?: boolean
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'success' | 'warning' | 'error'
  className?: string
}

const colorMap: Record<NonNullable<ProgressBarProps['color']>, string> = {
  primary: 'bg-[var(--color-primary)]',
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
  error: 'bg-[var(--color-error)]',
}

const sizeMap = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
} as const

/**
 * 进度条组件 —— 展示百分比进度，支持多种颜色和尺寸
 * @param {ProgressBarProps} props - 组件属性
 */
export function ProgressBar({
  value,
  max,
  label,
  showPercent = false,
  size = 'md',
  color = 'primary',
  className = '',
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {label}
            </span>
          )}
          {showPercent && (
            <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      )}
      <div
        className={[
          'w-full rounded-full overflow-hidden bg-[var(--color-bg-tertiary)]',
          sizeMap[size],
        ].join(' ')}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={['h-full rounded-full transition-all duration-300', colorMap[color]].join(' ')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
