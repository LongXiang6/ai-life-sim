/**
 * Purpose: Parse, normalize, deduplicate, and structurally validate destiny-pattern values.
 * Owner: mod-character
 * Responsibility: Pure protocol validation without AI calls or character-state mutation.
 */

import { parseAIJSONCandidates } from '@/core'
import {
  DESTINY_PATTERN_APTITUDE_CONFIG,
  DESTINY_PATTERN_CATEGORY_CONFIG,
  DESTINY_PATTERN_ID_PREFIX,
} from '../../constants'
import type {
  DestinyPattern,
  DestinyPatternAptitudeTier,
  DestinyPatternCategory,
  DestinyPatternDevelopmentStage,
} from '../../types'
import type { DestinyPatternAIItem } from './contracts'
import { validateDestinyPatternAttrBonusForAptitude } from '../../destiny-pattern-growth'

const ATTRIBUTE_BY_LABEL: Record<string, string> = {
  体魄: 'physique',
  心智: 'mind',
  魅力: 'charisma',
  财富: 'familyBackground',
  气运: 'luck',
}

const FIELD_ALIASES = {
  category: ['类别'],
  name: ['名称'],
  description: ['简介'],
  aptitudeTier: ['资质阶位'],
  developmentStage: ['开发阶段'],
  effect: ['效果'],
  attrBonus: ['属性加成'],
} as const

/**
 * Canonical identity for an ordinary destiny-pattern name.
 *
 * This is deliberately narrower than semantic similarity: Unicode compatibility
 * forms, surrounding/internal whitespace, and letter case are normalized, while
 * wording, punctuation, and effect text remain untouched.
 */
export function canonicalizeDestinyPatternName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, '')
    .toLocaleLowerCase()
}

export function dedupeDestinyPatterns(patterns: DestinyPattern[]): DestinyPattern[] {
  const result: DestinyPattern[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  for (const pattern of patterns) {
    if (!pattern?.id || typeof pattern.name !== 'string') continue
    const name = pattern.name.trim()
    const nameKey = canonicalizeDestinyPatternName(name)
    if (!nameKey || seenIds.has(pattern.id) || seenNames.has(nameKey)) continue
    seenIds.add(pattern.id)
    seenNames.add(nameKey)
    result.push({ ...pattern, name })
  }
  return result
}

export function isAIGeneratedDestinyPattern(pattern: DestinyPattern): boolean {
  return pattern.id.startsWith(`${DESTINY_PATTERN_ID_PREFIX.AI}-`) || pattern.id.startsWith('ai_')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickField(record: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias)) return record[alias]
  }
  return undefined
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCategory(value: unknown): DestinyPatternCategory | null {
  return typeof value === 'string' && Object.hasOwn(DESTINY_PATTERN_CATEGORY_CONFIG, value)
    ? value as DestinyPatternCategory
    : null
}

function normalizeAttrBonus(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null
  const result: Record<string, number> = {}
  for (const [label, amount] of Object.entries(value)) {
    const key = ATTRIBUTE_BY_LABEL[label]
    if (!key || typeof amount !== 'number' || !Number.isSafeInteger(amount)) return null
    if (amount !== 0) result[key] = amount
  }
  return result
}

function aptitudeTierValue(value: unknown): DestinyPatternAptitudeTier | null {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 9
    ? Number(value) as DestinyPatternAptitudeTier
    : null
}

function developmentStageValue(value: unknown): DestinyPatternDevelopmentStage | null {
  if (value === '初醒' || value === 'awakening') return 'awakening'
  if (value === '掌握' || value === 'mastery') return 'mastery'
  if (value === '圆满' || value === 'complete') return 'complete'
  return null
}

function normalizePatternItem(value: unknown): DestinyPatternAIItem | null {
  if (!isRecord(value)) return null
  if (['rarity', 'strengthenLevel', '等级', '稀有度'].some((key) => key in value)) return null
  const name = textValue(pickField(value, FIELD_ALIASES.name))
  const description = textValue(pickField(value, FIELD_ALIASES.description))
  const effect = textValue(pickField(value, FIELD_ALIASES.effect))
  const category = normalizeCategory(pickField(value, FIELD_ALIASES.category))
  const aptitudeTier = aptitudeTierValue(pickField(value, FIELD_ALIASES.aptitudeTier))
  const developmentStage = developmentStageValue(pickField(value, FIELD_ALIASES.developmentStage))
  const attrBonus = normalizeAttrBonus(pickField(value, FIELD_ALIASES.attrBonus))
  if (!category || !name || !description || !effect || aptitudeTier === null || !developmentStage || !attrBonus) return null
  return {
    category,
    name,
    description,
    aptitudeTier,
    developmentStage,
    effect,
    attrBonus,
  }
}

export function parseDestinyPatternAIResponse(response: string): DestinyPatternAIItem[] {
  const candidates = parseAIJSONCandidates<unknown>(response)
  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate.value) || !Array.isArray(candidate.value['天赋'])) return []
    return candidate.value['天赋']
      .map(normalizePatternItem)
      .filter((item): item is DestinyPatternAIItem => item !== null)
  })
}

export function validateDestinyPatternCategory(category: string): DestinyPatternCategory | null {
  return normalizeCategory(category)
}

export function validateDestinyPatternAptitudeTier(value: unknown): DestinyPatternAptitudeTier | null {
  return aptitudeTierValue(value)
}

export function validateDestinyPatternAttrBonus(
  bonus: Record<string, number> | undefined,
  aptitudeTier: DestinyPatternAptitudeTier,
): Partial<Record<string, number>> {
  if (!isRecord(bonus) || !validateDestinyPatternAttrBonusForAptitude(bonus, aptitudeTier)) {
    throw new Error(`${getDestinyPatternAptitudeLabel(aptitudeTier)}资质天赋属性加成超过边界或包含无效值`)
  }
  return { ...bonus }
}

/** Normalize a persisted or hydrated common candidate without judging its written content. */
export function normalizeCommonDestinyPatternCandidate(pattern: DestinyPattern): DestinyPattern | null {
  if (
    !pattern
    || typeof pattern.id !== 'string'
    || !pattern.id.trim()
    || typeof pattern.lineageId !== 'string'
    || !pattern.lineageId.trim()
    || !Number.isSafeInteger(pattern.version)
    || pattern.version < 1
    || typeof pattern.name !== 'string'
    || !pattern.name.trim()
    || typeof pattern.description !== 'string'
    || !pattern.description.trim()
    || typeof pattern.effect !== 'string'
    || !pattern.effect.trim()
    || 'rarity' in pattern
    || 'strengthenLevel' in pattern
    || 'apexStrengthenLevel' in pattern
  ) return null

  const aptitudeTier = validateDestinyPatternAptitudeTier(pattern.aptitudeTier)
  if (aptitudeTier === null || aptitudeTier > 3 || pattern.developmentStage !== 'awakening') return null
  const category = validateDestinyPatternCategory(pattern.category)
  if (!category) return null
  try {
    return {
      ...pattern,
      id: pattern.id.trim(),
      lineageId: pattern.lineageId.trim(),
      name: pattern.name.trim(),
      description: pattern.description.trim(),
      effect: pattern.effect.trim(),
      category,
      aptitudeTier,
      developmentStage: 'awakening',
      attrBonus: validateDestinyPatternAttrBonus(
        pattern.attrBonus as Record<string, number> | undefined,
        aptitudeTier,
      ),
    }
  } catch {
    return null
  }
}

export function getDestinyPatternAptitudeLabel(aptitudeTier: DestinyPatternAptitudeTier): string {
  return DESTINY_PATTERN_APTITUDE_CONFIG[aptitudeTier].label
}
