/**
 * @module FormField.types
 * @description FormField 组件的 Props 类型定义
 * @mod mod-ui
 */

export type FormFieldProps = {
  type: 'input' | 'select';
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  /** Input only */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  inputType?: 'text' | 'number' | 'password' | 'email';
  /** Select only */
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
};
