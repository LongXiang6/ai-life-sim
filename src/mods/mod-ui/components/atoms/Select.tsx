'use client'

/**
 * @module Select.tsx
 * @description 下拉选择原子组件 —— 泛型 option 列表 + label + error 态
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：label 在上、下拉框在下，选中项高亮反馈
 *   - Deference：内容优先，最小装饰
 *   - Depth：focus 边框高亮 + 展开手势暗示
 */

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectProps<T extends string = string> {
  label?: string
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  error?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  required?: boolean
}

export function Select<T extends string = string>({
  label,
  value,
  onChange,
  options,
  placeholder = '请选择',
  error,
  disabled = false,
  className = '',
  id,
  name,
  required = false,
}: SelectProps<T>) {
  const selectId = id || name || label?.replace(/\s+/g, '-').toLowerCase()

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
          {required && (
            <span className="text-[var(--color-error)] ml-0.5">*</span>
          )}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          name={name}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value as T)}
          className={[
            'w-full px-3 py-2 pr-8 rounded-lg text-base transition-colors duration-150 appearance-none cursor-pointer',
            'bg-[var(--color-bg-primary)]',
            'text-[var(--color-text-primary)]',
            error
              ? 'border-2 border-[var(--color-error)] focus:ring-2 focus:ring-[var(--color-error)] focus:ring-opacity-30'
              : 'border border-[var(--color-border)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-primary-light)]',
            'focus:outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-secondary)]',
          ].join(' ')}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </div>
      {error && (
        <p className="text-sm text-[var(--color-error)] mt-0.5">{error}</p>
      )}
    </div>
  )
}
