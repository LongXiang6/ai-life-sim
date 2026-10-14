/**
 * Purpose: Normalize persisted destiny-pattern category identifiers at the save boundary.
 * Owner: mod-character
 * Responsibility: One-time legacy category mapping only; active runtime categories remain owned by mod-character constants.
 */

import type { DestinyPattern } from '../types'

const DESTINY_PATTERN_CATEGORY_MIGRATION: Readonly<Record<string, DestinyPattern['category']>> = {
  enhancement: 'enhancement',
  control: 'control',
  perception: 'perception',
  summoning: 'summoning',
  creation: 'creation',
  action: 'enhancement',
  battle: 'enhancement',
  movement: 'enhancement',
  foundation: 'enhancement',
  cognition: 'perception',
  knowledge: 'perception',
  exploration: 'perception',
  specialization: 'perception',
  expression: 'control',
  communication: 'control',
  social: 'control',
  trait: 'control',
  stewardship: 'creation',
  management: 'creation',
  production: 'creation',
  manufacture: 'creation',
  rule: 'creation',
  misc: 'creation',
  miscellaneous: 'creation',
  opportunity: 'creation',
}

export function sanitizeDestinyPatternCategory(value: unknown): DestinyPattern['category'] | null {
  if (typeof value !== 'string') return null
  return DESTINY_PATTERN_CATEGORY_MIGRATION[value.trim().toLocaleLowerCase()] ?? null
}
