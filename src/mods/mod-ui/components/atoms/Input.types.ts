export interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
  type?: 'text' | 'number' | 'password' | 'email';
  id?: string;
  name?: string;
  required?: boolean;
  autoFocus?: boolean;
}
