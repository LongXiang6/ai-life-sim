/**
 * @module destiny-pattern-pool-cache.ts
 * @description 命格/天赋池本地缓存（按世界编码隔离）
 * @mod mod-character
 */

import { cacheStore } from '@/core'

import type { DestinyPattern } from '../types'
import { DESTINY_PATTERN_PROMPT_VERSION } from '../prompts/destiny-pattern-prompt'
import { sanitizeDestinyPattern } from './character-state-migration'

export function getDestinyPatternPoolCacheKey(worldCode: number): string {
  return `destiny-pool:${DESTINY_PATTERN_PROMPT_VERSION}:${worldCode || 'default'}`
}

export function loadDestinyPatternPool(worldCode: number): DestinyPattern[] {
  try {
    const cached = cacheStore.get<DestinyPattern[]>('mod-character', getDestinyPatternPoolCacheKey(worldCode)) ?? []
    return cached
      .map(sanitizeDestinyPattern)
      .filter((pattern): pattern is DestinyPattern => pattern !== null)
  } catch {
    return []
  }
}

export function saveDestinyPatternPool(worldCode: number, patterns: DestinyPattern[]): void {
  if (patterns.length === 0) return
  try {
    const sanitized = patterns
      .map(sanitizeDestinyPattern)
      .filter((pattern): pattern is DestinyPattern => pattern !== null)
    cacheStore.set('mod-character', getDestinyPatternPoolCacheKey(worldCode), sanitized)
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
