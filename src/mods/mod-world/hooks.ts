'use client'

/**
 * @module hooks.ts
 * @description 自定义 Hook —— 封装 world Store 的常用选择器
 * @mod mod-world
 */

'use client'

import { useWorldStore } from './store'

/** 世界基础信息 */
export function useWorld() {
  return useWorldStore((s) => ({
    worldConfig: s.worldConfig,
    initialized: s.initialized,
    worldCode: s.worldCode,
    setWorldConfig: s.setWorldConfig,
    setInitialized: s.setInitialized,
    setWorldCode: s.setWorldCode,
  }))
}

/** 当前世界区域概况 */
export function useWorldRegions() {
  return useWorldStore((s) => ({
    contextId: s.currentContextId,
    context: s.currentContextId ? s.contexts[s.currentContextId] : null,
  }))
}

/** 世界时间 */
export function useWorldTime() {
  return useWorldStore((s) => ({
    currentYear: s.currentYear,
    setCurrentYear: s.setCurrentYear,
  }))
}
