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

const DESTINY_PATTERN_POOL_KEY_PREFIX = 'destiny-pool:'
const DESTINY_PATTERN_POOL_PHYSICAL_PREFIX = `ai-life-sim:mod-character:cache:${DESTINY_PATTERN_POOL_KEY_PREFIX}`

export function getDestinyPatternPoolCacheKey(worldCode: number): string {
  return `${DESTINY_PATTERN_POOL_KEY_PREFIX}${DESTINY_PATTERN_PROMPT_VERSION}:${worldCode || 'default'}`
}

function deleteStaleDestinyPatternPools(): Set<number> {
  const currentWorldCodes = new Set<number>()
  if (typeof window === 'undefined') return currentWorldCodes

  const staleLogicalKeys: string[] = []
  const currentVersionPrefix = `${DESTINY_PATTERN_PROMPT_VERSION}:`
  for (let index = 0; index < localStorage.length; index += 1) {
    const physicalKey = localStorage.key(index)
    if (!physicalKey?.startsWith(DESTINY_PATTERN_POOL_PHYSICAL_PREFIX)) continue

    const suffix = physicalKey.slice(DESTINY_PATTERN_POOL_PHYSICAL_PREFIX.length)
    if (!suffix.startsWith(currentVersionPrefix)) {
      staleLogicalKeys.push(`${DESTINY_PATTERN_POOL_KEY_PREFIX}${suffix}`)
      continue
    }

    const rawWorldCode = suffix.slice(currentVersionPrefix.length)
    const worldCode = Number.parseInt(rawWorldCode, 10)
    if (Number.isFinite(worldCode) && worldCode > 0 && String(worldCode) === rawWorldCode) {
      currentWorldCodes.add(worldCode)
    } else {
      staleLogicalKeys.push(`${DESTINY_PATTERN_POOL_KEY_PREFIX}${suffix}`)
    }
  }

  for (const logicalKey of staleLogicalKeys) {
    cacheStore.remove('mod-character', logicalKey)
  }
  return currentWorldCodes
}

export function loadDestinyPatternPool(worldCode: number): DestinyPattern[] {
  try {
    deleteStaleDestinyPatternPools()
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
    deleteStaleDestinyPatternPools()
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
    deleteStaleDestinyPatternPools()
    cacheStore.remove('mod-character', getDestinyPatternPoolCacheKey(worldCode))
  } catch {
    /* ignore */
  }
}

/** Whether the current Prompt version has a usable candidate pool for this world. */
export function hasDestinyPatternPool(worldCode: number): boolean {
  if (!worldCode) return false
  try {
    return loadDestinyPatternPool(worldCode).length > 0
  } catch {
    return false
  }
}

/** Enumerate worlds represented by the current Prompt version after deleting stale assets. */
export function listDestinyPatternPoolWorldCodes(): Set<number> {
  return deleteStaleDestinyPatternPools()
}
