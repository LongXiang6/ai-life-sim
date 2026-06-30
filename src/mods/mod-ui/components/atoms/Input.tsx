'use client'

/**
 * @module Input.tsx
 * @description 输入框原子组件 —— text 输入 + label + error + disabled 态
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：label 在上、输入框在下，清晰的层级关系
 *   - Deference：内容优先，无冗余装饰
 *   - Depth：focus 边框高亮提供视觉分层
 */

export interface InputProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  className?: string
  type?: 'text' | 'number' | 'password' | 'email'
  id?: string
  name?: string
  required?: boolean
  autoFocus?: boolean
}

/**
 * 输入框组件 —— 支持 label、错误提示、禁用态等
 * @param {InputProps} props - 组件属性
 */
export function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
  type = 'text',
  id,
  name,
  required = false,
  autoFocus = false,
}: InputProps) {
  const inputId = id || name || label?.replace(/\s+/g, '-').toLowerCase()

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
          {required && (
            <span className="text-[var(--color-error)] ml-0.5">*</span>
          )}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'w-full px-3 py-2 rounded-lg text-base transition-colors duration-150',
          'bg-[var(--color-bg-primary)]',
          'text-[var(--color-text-primary)]',
          'placeholder:text-[var(--color-text-tertiary)]',
          error
            ? 'border-2 border-[var(--color-error)] focus:ring-2 focus:ring-[var(--color-error)] focus:ring-opacity-30'
            : 'border border-[var(--color-border)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-primary-light)]',
          'focus:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-secondary)]',
        ].join(' ')}
      />
      {error && (
        <p className="text-sm text-[var(--color-error)] mt-0.5">{error}</p>
      )}
    </div>
  )
}
