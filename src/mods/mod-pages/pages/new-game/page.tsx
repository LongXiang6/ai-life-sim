/**
 * @module new-game-page
 * @description 新游戏入口 —— 完整重置当前人生后进入世界观选择
 * @mod mod-pages
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { resetForNewLife } from '../../helpers/new-life-reset'

export default function NewGamePage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void resetForNewLife()
      .then(() => {
        if (active) router.replace('/new-game/world-select')
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : '新人生初始化失败，请重试。')
      })
    return () => { active = false }
  }, [attempt, router])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md px-6 text-center">
        <p className="text-sm text-gray-500" role="status" aria-live="polite">
          {error || '正在清理上一段人生并准备新的世界…'}
        </p>
        {error && (
          <div className="mt-4 flex justify-center gap-3">
            <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => router.replace('/welcome')}>返回欢迎页</button>
            <button
              type="button"
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
              onClick={() => {
                setError('')
                setAttempt((value) => value + 1)
              }}
            >重试</button>
          </div>
        )}
      </div>
    </div>
  )
}
