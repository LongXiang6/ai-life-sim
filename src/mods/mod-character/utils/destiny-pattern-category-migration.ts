/**
 * Purpose: Normalize persisted destiny-pattern category identifiers at the save boundary.
 * Owner: mod-character
 * Responsibility: One-time legacy category mapping only; active runtime categories remain owned by mod-character constants.
 */

import type { DestinyPattern } from '../types'

const DESTINY_PATTERN_CATEGORY_MIGRATION: Readonly<Record<string, DestinyPattern['category']>> = {
  action: 'action',
  cognition: 'cognition',
  expression: 'expression',
  stewardship: 'stewardship',
  misc: 'misc',
  battle: 'action',
  exploration: 'cognition',
  social: 'expression',
  production: 'stewardship',
}

export function sanitizeDestinyPatternCategory(value: unknown): DestinyPattern['category'] | null {
  if (typeof value !== 'string') return null
  return DESTINY_PATTERN_CATEGORY_MIGRATION[value.trim().toLocaleLowerCase()] ?? null
}
