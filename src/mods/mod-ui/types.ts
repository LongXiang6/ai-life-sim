/**
 * @module types.ts
 * @description MOD 类型定义 —— UI 相关类型
 * @mod mod-ui
 *
 * 待实现：ButtonProps, ModalProps, CardProps, ComponentSize 等 UI 组件通用类型
 */

export type ComponentSize = 'sm' | 'md' | 'lg'
export type ComponentVariant = 'default' | 'primary' | 'secondary' | 'outline' | 'ghost'

export interface BaseComponentProps {
  className?: string
  size?: ComponentSize,
}
