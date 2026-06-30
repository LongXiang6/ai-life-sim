'use client'

/**
 * @module FormField.tsx
 * @description 表单字段分子组件 —— Label + 输入控件 + Error 文案组合
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：统一 label 间距和 error 位置
 *   - Deference：内容优先，辅助信息弱化
 */

import { Input } from '../atoms/Input'
import { Select } from '../atoms/Select'

export type FormFieldProps = {
  type: 'input' | 'select'
  label: string
  error?: string
  required?: boolean
  hint?: string
  className?: string
  /** Input only */
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
  autoFocus?: boolean
  inputType?: 'text' | 'number' | 'password' | 'email'
  /** Select only */
  options?: Array<{ value: string; label: string; disabled?: boolean }>
}

export function FormField(props: FormFieldProps) {
  const { type, label, error, required, hint, className, ...rest } = props

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-[var(--color-text-primary)]">
          {label}
          {required && (
            <span className="text-[var(--color-error)] ml-0.5">*</span>
          )}
        </label>
      </div>
      {type === 'input' ? (
        <Input
          value={rest.value ?? ''}
          onChange={rest.onChange ?? (() => {})}
          placeholder={rest.placeholder}
          disabled={rest.disabled}
          id={rest.id}
          name={rest.name}
          required={required}
          autoFocus={rest.autoFocus}
          type={rest.inputType}
          error={error}
        />
      ) : (
        <Select
          value={rest.value ?? ''}
          onChange={rest.onChange ?? (() => {})}
          options={rest.options ?? []}
          placeholder={rest.placeholder}
          disabled={rest.disabled}
          id={rest.id}
          name={rest.name}
          required={required}
          error={error}
        />
      )}
      {hint && !error && (
        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{hint}</p>
      )}
    </div>
  )
}
