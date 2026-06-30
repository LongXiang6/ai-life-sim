'use client'

/**
 * @module useGoldenFingerHooks
 * @description mod-golden-finger 自定义 Hook
 * @mod mod-golden-finger
 */

import { useGoldenFingerStore } from './store'

export function useGoldenFinger() {
  return useGoldenFingerStore((s) => s.goldenFinger)
}
