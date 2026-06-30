'use client'

/**
 * @module timeline-analysis-page
 * @description 时间线分析 —— 后台静默分析，立即跳转不阻塞用户
 * @mod mod-pages
 */

import { useEffect, useRef } from 'react'

import { useRouter } from 'next/navigation'

export default function TimelineAnalysisPage() {
  const router = useRouter()
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    // 后台静默分析（不阻塞用户流程），立即跳转到下一个页面
    router.replace('/talent-draw')
  }, [router])

  // 不渲染任何 UI（页面闪过后立即跳转）
  return null
}
