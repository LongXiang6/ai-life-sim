/**
 * Purpose: Persist and restore the ordinary destiny-pattern candidate pool by world and Prompt version.
 * Owner: mod-character
 * Responsibility: Cache boundary only; category migration and candidate validation remain with their owning utilities.
 */

import { cacheStore } from '@/core'

import type { DestinyPattern } from '../types'
import { DESTINY_PATTERN_PROMPT_VERSION } from '../prompts/destiny-pattern-prompt'
import { normalizeCommonDestinyPatternCandidate } from '../subsystems/destiny-pattern-system/validation'
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
      .map(normalizeCommonDestinyPatternCandidate)
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
      .map(normalizeCommonDestinyPatternCandidate)
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
