/**
 * @module Card.types
 * @description Card 组件的 Props 类型定义
 * @mod mod-ui
 */

import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}
