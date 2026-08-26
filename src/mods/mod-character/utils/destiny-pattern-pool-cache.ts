/**
 * Purpose: Persist and restore the ordinary destiny-pattern candidate pool by world and Prompt version.
 * Owner: mod-character
 * Responsibility: Cache boundary only; category migration and candidate validation remain with their owning utilities.
 */

import { cacheStore } from '@/core'

import type { DestinyPattern } from '../types'
import { DESTINY_PATTERN_PROMPT_VERSION } from '../prompts/destiny-pattern-prompt'
import {
  dedupeDestinyPatterns,
  normalizeCommonDestinyPatternCandidate,
} from '../subsystems/destiny-pattern-system/validation'
import { sanitizeDestinyPattern } from './character-state-migration'

export function getDestinyPatternPoolCacheKey(worldCode: number): string {
  return `destiny-pool:${DESTINY_PATTERN_PROMPT_VERSION}:${worldCode || 'default'}`
}

export function loadDestinyPatternPool(worldCode: number): DestinyPattern[] {
  try {
    const cached = cacheStore.get<DestinyPattern[]>('mod-character', getDestinyPatternPoolCacheKey(worldCode)) ?? []
    const normalized = cached
      .map(sanitizeDestinyPattern)
      .filter((pattern): pattern is DestinyPattern => pattern !== null)
      .map(normalizeCommonDestinyPatternCandidate)
      .filter((pattern): pattern is DestinyPattern => pattern !== null)
    return dedupeDestinyPatterns(normalized)
  } catch {
    return []
  }
}

export function saveDestinyPatternPool(worldCode: number, patterns: DestinyPattern[]): void {
  if (patterns.length === 0) return
  try {
    const sanitizedCandidates = patterns
      .map(sanitizeDestinyPattern)
      .filter((pattern): pattern is DestinyPattern => pattern !== null)
      .map(normalizeCommonDestinyPatternCandidate)
      .filter((pattern): pattern is DestinyPattern => pattern !== null)
    const sanitized = dedupeDestinyPatterns(sanitizedCandidates)
    cacheStore.set('mod-character', getDestinyPatternPoolCacheKey(worldCode), sanitized)
  } catch {
    // ignore quota / private mode
  }
}

export function deleteDestinyPatternPool(worldCode: number): void {
  if (!worldCode) return
  try {
    cacheStore.remove('mod-character', getDestinyPatternPoolCacheKey(worldCode))

    // Clear older prompt-version entries for the same world as well. They are
    // no longer eligible for loading, but should not remain behind the reset
    // control as stale generated data.
    if (typeof window !== 'undefined') {
      const prefix = 'ai-life-sim:mod-character:cache:destiny-pool:'
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index)
        if (!key || !key.startsWith(prefix)) continue
        const suffix = key.slice(prefix.length)
        const rawWorldCode = suffix.slice(suffix.lastIndexOf(':') + 1)
        if (rawWorldCode === String(worldCode)) localStorage.removeItem(key)
      }
    }
  } catch {
    /* ignore */
  }
}

/** Whether any prompt-versioned candidate pool exists for this world. */
export function hasDestinyPatternPool(worldCode: number): boolean {
  if (!worldCode) return false
  try {
    return listDestinyPatternPoolWorldCodes().has(worldCode)
  } catch {
    return false
  }
}

/** Enumerate all world codes represented by prompt-versioned candidate pools. */
export function listDestinyPatternPoolWorldCodes(): Set<number> {
  const worldCodes = new Set<number>()
  if (typeof window === 'undefined') return worldCodes
  const prefix = 'ai-life-sim:mod-character:cache:destiny-pool:'
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key || !key.startsWith(prefix)) continue
    const suffix = key.slice(prefix.length)
    const rawWorldCode = suffix.slice(suffix.lastIndexOf(':') + 1)
    const worldCode = Number.parseInt(rawWorldCode, 10)
    if (Number.isFinite(worldCode) && worldCode > 0 && String(worldCode) === rawWorldCode) {
      worldCodes.add(worldCode)
    }
  }
  return worldCodes
}
