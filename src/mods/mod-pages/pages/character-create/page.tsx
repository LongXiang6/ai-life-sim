/**
 * @file page.tsx
 * @description 角色创建页面入口 —— 根据设备自动选择桌面端/移动端
 * @mod mod-pages
 */

'use client'

import { useIsMobile } from '@/foundation'

import { CharacterCreateDesktop } from './CharacterCreateDesktop'
import { CharacterCreateMobile } from './CharacterCreateMobile'

export default function CharacterCreatePage() {
  const isMobile = useIsMobile()

  return isMobile
    ? <CharacterCreateMobile />
    : <CharacterCreateDesktop />
}
