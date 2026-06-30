/**
 * @module Button.types
 * @description Button 组件的 Props 类型定义
 * @mod mod-ui
 */

import type { ComponentSize, ComponentVariant } from '../../types';
import type { CSSProperties, ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  variant?: ComponentVariant;
  size?: ComponentSize;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}
