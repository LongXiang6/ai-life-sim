/**
 * @module destiny-pattern-pool-cache.ts
 * @description 命格/天赋池本地缓存（按世界编码隔离）
 * @mod mod-character
 */

import { cacheStore } from '@/core'

import type { DestinyPattern } from '../types'
import {
  rejectsBirthStateDestinyPatternContent,
  rejectsFutureDestinyPatternContent,
} from './destiny-pattern-content-quality'

export function getDestinyPatternPoolCacheKey(worldCode: number): string {
  return `destiny-pool:${worldCode || 'default'}`
}

export function loadDestinyPatternPool(worldCode: number): DestinyPattern[] {
  try {
    const cached = cacheStore.get<DestinyPattern[]>('mod-character', getDestinyPatternPoolCacheKey(worldCode)) ?? []
    // 旧缓存同样经过当前质量门禁，避免已生成的年份/履历文案继续出现在抽取结果里。
    return cached.filter((pattern) => (
      !rejectsFutureDestinyPatternContent(pattern)
      && !rejectsBirthStateDestinyPatternContent(pattern)
    ))
  } catch {
    return []
  }
}

export function saveDestinyPatternPool(worldCode: number, patterns: DestinyPattern[]): void {
  if (patterns.length === 0) return
  try {
    cacheStore.set('mod-character', getDestinyPatternPoolCacheKey(worldCode), patterns)
  } catch {
    // ignore quota / private mode
  }
}

export function deleteDestinyPatternPool(worldCode: number): void {
  if (!worldCode) return
  try {
    cacheStore.remove('mod-character', getDestinyPatternPoolCacheKey(worldCode))
  } catch {
    /* ignore */
  }
}
