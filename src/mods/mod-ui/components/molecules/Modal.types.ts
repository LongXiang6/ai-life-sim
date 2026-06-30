/**
 * @module Modal.types
 * @description Modal 组件的 Props 类型定义
 * @mod mod-ui
 */

import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}
