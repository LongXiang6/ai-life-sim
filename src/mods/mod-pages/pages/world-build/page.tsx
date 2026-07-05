'use client'

/**
 * @module world-build-page
 * @description 兼容旧路由：世界构建已收敛到 /new-game/world-customize
 * @mod mod-pages
 */

import { useEffect } from 'react'

import { useRouter } from 'next/navigation'

export default function WorldBuildRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/new-game/world-customize')
  }, [router])

  return null
}
