/**
 * Purpose: Validate the shared four-slot loadout used by ordinary and mythic patterns.
 * Owner: mod-character
 * Responsibility: Pure loadout counting and validation only; stores own persistence and mutation.
 */

import { PATTERN_LOADOUT_SLOT_COUNT } from './constants'

type PatternIdentity = { id: string }

export function getPatternLoadoutCount(
  patterns: readonly PatternIdentity[],
  mythicPatterns: readonly PatternIdentity[],
): number {
  return patterns.length + mythicPatterns.length
}

export function isPatternLoadoutComplete(
  patterns: readonly PatternIdentity[],
  mythicPatterns: readonly PatternIdentity[],
): boolean {
  return getPatternLoadoutCount(patterns, mythicPatterns) === PATTERN_LOADOUT_SLOT_COUNT
}

export function assertPatternLoadout(
  patterns: readonly PatternIdentity[],
  mythicPatterns: readonly PatternIdentity[],
  requireFull = false,
): void {
  if (new Set(patterns.map((pattern) => pattern.id)).size !== patterns.length) {
    throw new Error('普通命格选择包含重复项')
  }
  if (new Set(mythicPatterns.map((pattern) => pattern.id)).size !== mythicPatterns.length) {
    throw new Error('轮回天赋选择包含重复项')
  }
  const total = getPatternLoadoutCount(patterns, mythicPatterns)
  if (total > PATTERN_LOADOUT_SLOT_COUNT) {
    throw new Error(`普通命格与轮回天赋合计不能超过 ${PATTERN_LOADOUT_SLOT_COUNT} 项`)
  }
  if (requireFull && total !== PATTERN_LOADOUT_SLOT_COUNT) {
    throw new Error(`必须填满 ${PATTERN_LOADOUT_SLOT_COUNT} 个命格携带槽（当前 ${total} 个）`)
  }
}
