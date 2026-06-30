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

/** 具名实体 */
export function useWorldEntities() {
  return useWorldStore((s) => ({
    entities: s.entities,
    setEntities: s.setEntities,
  }))
}

/** 世界时间 */
export function useWorldTime() {
  return useWorldStore((s) => ({
    currentYear: s.currentYear,
    setCurrentYear: s.setCurrentYear,
  }))
}
