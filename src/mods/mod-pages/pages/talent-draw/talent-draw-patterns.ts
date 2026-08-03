/**
 * Purpose: Project, deduplicate, and place talent-draw destiny patterns.
 * Owner: mod-pages/talent-draw
 * Responsibility: Pure pattern and slot transformations; persistence and AI calls live elsewhere.
 */

import {
  ATTRIBUTE_NAMES,
  DESTINY_PATTERN_DISPLAY_COUNT,
  DESTINY_PATTERN_SELECT_COUNT,
} from '@/mods/mod-character'

import type { DestinyPattern } from '@/mods/mod-character'
import type { TalentDrawSlots } from './talent-draw.types'

const ATTR_BONUS_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma'] as const

export function createSelectedUiSlots(indices: number[]): Array<number | null> {
  return Array.from({ length: DESTINY_PATTERN_SELECT_COUNT }, (_, index) => indices[index] ?? null)
}

export function formatPatternAttrSummary(pattern: DestinyPattern): string {
  if (!pattern.attrBonus) return '无属性加成'
  const labels = ATTR_BONUS_KEYS.flatMap((key) => {
    const value = pattern.attrBonus?.[key]
    if (typeof value !== 'number' || value === 0) return []
    return [`${ATTRIBUTE_NAMES[key] ?? key} ${value > 0 ? '+' : ''}${value}`]
  })
  return labels.length > 0 ? labels.join(' · ') : '无属性加成'
}

export function isAIGeneratedPattern(pattern: DestinyPattern): boolean {
  return pattern.id.startsWith('ai-') || pattern.id.startsWith('ai_')
}

export function patternNameKey(pattern: DestinyPattern): string {
  return pattern.name.trim().toLocaleLowerCase()
}

export function uniquePatternsByIdentity(patterns: DestinyPattern[]): DestinyPattern[] {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  return patterns.filter((pattern) => {
    if (pattern.polarity === 'negative') return false
    const nameKey = patternNameKey(pattern)
    if (seenIds.has(pattern.id) || seenNames.has(nameKey)) return false
    seenIds.add(pattern.id)
    seenNames.add(nameKey)
    return true
  })
}

export function drawSlotsFromPool(pool: DestinyPattern[]): TalentDrawSlots {
  const uniquePool = uniquePatternsByIdentity(pool)
  const shuffled = uniquePool.sort(() => Math.random() - 0.5)
  const drawn = shuffled.slice(0, DESTINY_PATTERN_DISPLAY_COUNT)
  const slots: TalentDrawSlots = Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null)
  drawn.forEach((pattern, index) => { slots[index] = pattern })
  return slots
}

export function revealSlotsInOrder(patterns: DestinyPattern[]): TalentDrawSlots {
  const revealed = uniquePatternsByIdentity(patterns).slice(0, DESTINY_PATTERN_DISPLAY_COUNT)
  const slots: TalentDrawSlots = Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null)
  revealed.forEach((pattern, index) => { slots[index] = pattern })
  return slots
}

export function mergeSlotsWithPatterns(
  currentSlots: TalentDrawSlots,
  patterns: DestinyPattern[],
): TalentDrawSlots {
  const nextSlots = currentSlots.length === DESTINY_PATTERN_DISPLAY_COUNT
    ? [...currentSlots]
    : Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null) as TalentDrawSlots
  const visibleIds = new Set(nextSlots.flatMap((pattern) => pattern ? [pattern.id] : []))
  const visibleNames = new Set(nextSlots.flatMap((pattern) => pattern ? [patternNameKey(pattern)] : []))
  for (const pattern of uniquePatternsByIdentity(patterns)) {
    if (visibleIds.has(pattern.id) || visibleNames.has(patternNameKey(pattern))) continue
    const emptyIndex = nextSlots.findIndex((slot) => slot === null)
    if (emptyIndex < 0) break
    nextSlots[emptyIndex] = pattern
    visibleIds.add(pattern.id)
    visibleNames.add(patternNameKey(pattern))
  }
  return nextSlots
}
