/**
 * @file page.tsx
 * @description 角色创建页面入口 —— 单一响应式创建流视图
 * @mod mod-pages
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useWorldStore } from '@/mods/mod-world'

import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'
import { CharacterCreateMobile } from './CharacterCreateMobile'

export default function CharacterCreatePage() {
  const router = useRouter()
  const storesHydrated = useCreationStoresHydrated()
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const worldInitialized = useWorldStore((state) => state.initialized)
  const canCreateCharacter = Boolean(worldConfig && worldCode > 0 && worldInitialized)

  useEffect(() => {
    if (storesHydrated && !canCreateCharacter) router.replace('/new-game/world-select')
  }, [canCreateCharacter, router, storesHydrated])

  if (!storesHydrated || !canCreateCharacter) return null
  return <CharacterCreateMobile />
}
