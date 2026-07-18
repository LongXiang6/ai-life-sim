/**
 * @file page.tsx
 * @description 世界选择页面入口 —— 单一响应式创建流视图
 * @mod mod-pages
 * 参照废弃项目 WorldSelect 完整移植
 */

'use client'

import { WorldSelectMobile } from './WorldSelectMobile'

export default function WorldSelectPage() {
  return <WorldSelectMobile />
}
