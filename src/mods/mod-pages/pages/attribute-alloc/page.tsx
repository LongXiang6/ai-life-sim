/**
 * @module attribute-alloc-compat-redirect
 * @description 已移除属性分配功能；兼容旧地址并转入命运预览
 * @mod mod-pages
 */

'use client'

import { useEffect } from 'react'

import { useRouter } from 'next/navigation'

export default function AttributeAllocCompatibilityRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/fate-preview')
  }, [router])

  return null
}
