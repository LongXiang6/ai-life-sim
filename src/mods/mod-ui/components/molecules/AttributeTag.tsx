'use client'

/**
 * @module AttributeTag
 * @description 属性标签分子组件 —— 图标 + 名称 + 值 + 颜色编码
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：正/负/零三色一眼区分
 *   - Deference：紧凑不抢内容
 */

import { cn } from '@/foundation/utils/cn'

export interface AttributeTagProps {
  icon: string
  label: string
  value: number
  /** 是否显示正号（默认 true） */
  showPlus?: boolean
  className?: string
}

/**
 * 根据属性值返回颜色编码
 *   正数 → 绿色 (--color-success)
 *   负数 → 红色 (--color-error)
 *   零   → 灰色 (--color-text-tertiary)
 */
function getValueColor(value: number): string {
  if (value > 0) return 'text-[var(--color-success)]'
  if (value < 0) return 'text-[var(--color-error)]'
  return 'text-[var(--color-text-tertiary)]'
}

function formatValue(value: number, showPlus: boolean): string {
  if (value > 0 && showPlus) return `+${value}`
  return String(value)
}

/**
 * 属性标签组件 —— 图标 + 名称 + 值 + 颜色编码
 * @param {AttributeTagProps} props - 组件属性
 */
export function AttributeTag({ icon, label, value, showPlus = true, className }: AttributeTagProps) {
  const colorClass = getValueColor(value)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
        'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]',
        className
      )}
      title={`${label}: ${value}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className={cn('font-semibold', colorClass)}>
        {formatValue(value, showPlus)}
      </span>
    </span>
  )
}
