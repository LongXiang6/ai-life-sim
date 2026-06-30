/**
 * @module Badge.types
 * @description Badge 组件的 Props 类型定义
 * @mod mod-ui
 */

import type { ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
  color?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}
