'use client'

import { useEffect, useState } from 'react'

import { useCharacterStore } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'

/** 避免持久化 Store 尚未恢复时，把合法的创建流程刷新误判成越级访问。 */
export function useCreationStoresHydrated(): boolean {
  const [hydrated, setHydrated] = useState(
    () => useWorldStore.persist.hasHydrated() && useCharacterStore.persist.hasHydrated(),
  )

  useEffect(() => {
    const refresh = () => {
      setHydrated(useWorldStore.persist.hasHydrated() && useCharacterStore.persist.hasHydrated())
    }
    refresh()
    const unsubscribeWorld = useWorldStore.persist.onFinishHydration(refresh)
    const unsubscribeCharacter = useCharacterStore.persist.onFinishHydration(refresh)
    return () => {
      unsubscribeWorld()
      unsubscribeCharacter()
    }
  }, [])

  return hydrated
}
