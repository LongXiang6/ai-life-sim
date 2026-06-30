'use client'

/**
 * @module Toggle.tsx
 * @description 开关切换分子组件 —— 双态/双选切换
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：切换状态清晰（颜色 + 滑块位移动画）
 *   - Depth：选中态背景色高亮，视觉反馈明确
 */

export interface ToggleOption<T extends string = string> {
  value: T
  label: string,
}

export interface ToggleProps<T extends string = string> {
  options: [ToggleOption<T>, ToggleOption<T>]
  value: T
  onChange: (value: T) => void
  label?: string
  className?: string,
}

export function Toggle<T extends string = string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: ToggleProps<T>) {
  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && (
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {label}
        </span>
      )}
      <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg-tertiary)]">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'flex-1 px-4 py-2 text-sm font-medium transition-all duration-150 cursor-pointer',
              opt.value === value
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
