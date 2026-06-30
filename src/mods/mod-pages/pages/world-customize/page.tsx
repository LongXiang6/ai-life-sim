/**
 * @file page.tsx
 * @description 世界自定义页面入口 —— 根据设备自动选择桌面端/移动端
 * @mod mod-pages
 */

'use client'

import { useIsMobile } from '@/foundation'

import { WorldCustomizeDesktop } from './WorldCustomizeDesktop'
import { WorldCustomizeMobile } from './WorldCustomizeMobile'

export default function WorldCustomizePage() {
  const isMobile = useIsMobile()

  return isMobile
    ? <WorldCustomizeMobile />
    : <WorldCustomizeDesktop />
}
