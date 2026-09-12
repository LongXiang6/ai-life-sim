/**
 * Purpose: Render the selectable calendar and event-node pacing controls.
 * Owner: mod-ui
 * Responsibility: Present and emit a normalized TimeStep without owning time state.
 *
 * @module TimeStepSelector.tsx
 * @description 时间步进选择器分子组件 —— 8 档时间步进选择（24/12/4/2节点/年、年/3/5/10年）
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：当前选中档高亮，档位从细到粗排列
 *   - Deference：内容优先，最小装饰
 *   - Depth：选中态背景色高亮，视觉反馈明确
 */

'use client'

import { AVAILABLE_TIME_STEPS, type TimeStep } from '@/foundation'

export interface TimeStepSelectorProps {
  value: TimeStep
  onChange: (step: TimeStep) => void
  className?: string
}

/** 将时间步长编码为字符串 key */
function encodeTimeStep(step: { unit: string; value: number }): string {
  return `${step.unit}:${step.value}`
}

/** 从字符串 key 解码时间步长 */
function decodeTimeStep(key: string): TimeStep {
  const [unit, value] = key.split(':')
  return { unit: unit as TimeStep['unit'], value: Number(value) }
}

export function TimeStepSelector({ value, onChange, className = '' }: TimeStepSelectorProps) {
  const currentKey = encodeTimeStep(value)

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        时间步进
      </span>
      <div className="flex flex-wrap gap-1">
        {AVAILABLE_TIME_STEPS.map((step) => {
          const key = encodeTimeStep(step)
          const isSelected = key === currentKey
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(decodeTimeStep(key))}
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer',
                isSelected
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]',
              ].join(' ')}
            >
              {step.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
