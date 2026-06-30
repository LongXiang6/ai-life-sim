'use client'

/**
 * @module AttrChangeLabel
 * @description 属性变化标签分子组件 —— 叙事中属性增减的可视化标签
 * @mod mod-ui
 *
 * 示例：[💪体魄+1] [💰财富-5]
 * 用于叙事时间线中展示属性变化
 */

import { cn } from '@/foundation/utils/cn'

export interface AttrChangeLabelProps {
  icon: string
  label: string
  change: number
  className?: string
}

/**
 * 属性变化标签组件 —— 叙事中属性增减的可视化标签
 * @param {AttrChangeLabelProps} props - 组件属性
 */
export function AttrChangeLabel({ icon, label, change, className }: AttrChangeLabelProps) {
  const isPositive = change > 0
  const isNegative = change < 0

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium border',
        isPositive && 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)]',
        isNegative && 'bg-[var(--color-error)]/10 border-[var(--color-error)]/30 text-[var(--color-error)]',
        !isPositive && !isNegative && 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)] text-[var(--color-text-tertiary)]',
        className
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span className="font-semibold">
        {isPositive ? '+' : ''}{change}
      </span>
    </span>
  )
}
