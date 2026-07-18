/**
 * @file page.tsx
 * @description 世界自定义页面入口 —— 单一响应式创建流视图
 * @mod mod-pages
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useWorldStore } from '@/mods/mod-world'

import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'
import { WorldCustomizeMobile } from './WorldCustomizeMobile'

export default function WorldCustomizePage() {
  const router = useRouter()
  const storesHydrated = useCreationStoresHydrated()
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const canConfigureWorld = Boolean(worldConfig && worldCode > 0)

  useEffect(() => {
    if (storesHydrated && !canConfigureWorld) router.replace('/new-game/world-select')
  }, [canConfigureWorld, router, storesHydrated])

  if (!storesHydrated || !canConfigureWorld) return null
  return <WorldCustomizeMobile />
}
