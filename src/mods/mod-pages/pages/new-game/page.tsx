/**
 * @module new-game-page
 * @description 新游戏入口 —— 重定向到世界观选择页面
 * @mod mod-pages
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewGamePage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/new-game/world-select')
  }, [router])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-gray-400">跳转中…</p>
    </div>
  )
}
