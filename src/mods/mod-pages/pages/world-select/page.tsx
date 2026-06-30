/**
 * @file page.tsx
 * @description 世界选择页面入口 —— 根据设备自动选择桌面端/移动端
 * @mod mod-pages
 * 参照废弃项目 WorldSelect 完整移植
 */

'use client'

import { useIsMobile } from '@/foundation/utils/use-is-mobile'

import { WorldSelectDesktop } from './WorldSelectDesktop'
import { WorldSelectMobile } from './WorldSelectMobile'

export default function WorldSelectPage() {
  const isMobile = useIsMobile()

  return isMobile
    ? <WorldSelectMobile />
    : <WorldSelectDesktop />
}
