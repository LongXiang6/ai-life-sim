/**
 * Purpose: Parse, normalize, deduplicate, and structurally validate destiny-pattern values.
 * Owner: mod-character
 * Responsibility: Pure protocol validation without AI calls or character-state mutation.
 */

import { parseAIJSONCandidates } from '@/core'
import {
  DESTINY_PATTERN_CATEGORY_CONFIG,
  DESTINY_PATTERN_ID_PREFIX,
} from '../../constants'
import type {
  DestinyPattern,
  DestinyPatternCategory,
  DestinyPatternRarity,
} from '../../types'
import type { DestinyPatternAIItem } from './contracts'
import { validateDestinyPatternAttrBonusForRarity } from '../../destiny-pattern-growth'

const CATEGORY_BY_LABEL = Object.fromEntries(
  Object.entries(DESTINY_PATTERN_CATEGORY_CONFIG).map(([category, config]) => [config.label, category]),
) as Record<string, DestinyPatternCategory>

const ATTRIBUTE_BY_LABEL: Record<string, string> = {
  体魄: 'physique',
  力量: 'physique',
  体质: 'physique',
  心智: 'mind',
  智力: 'mind',
  智慧: 'mind',
  魅力: 'charisma',
  容貌: 'charisma',
  气质: 'charisma',
  财富: 'familyBackground',
  家庭: 'familyBackground',
  出身: 'familyBackground',
  资源: 'familyBackground',
  气运: 'luck',
  physique: 'physique',
  mind: 'mind',
  charisma: 'charisma',
  familybackground: 'familyBackground',
  luck: 'luck',
}

const FIELD_ALIASES = {
  category: ['类别', '分类', '方向', 'category', 'type'],
  name: ['名称', '名字', '命格名称', 'name', 'title'],
  description: ['设定描述', '描述', '背景', '详细介绍', 'description', 'detail'],
  effect: ['效果', '作用', '效果描述', '影响', 'effect', 'result'],
  attrBonus: ['属性加成', '属性', '属性变化', '加成', 'attrBonus', 'attributes'],
  items: ['天赋', '命格', '候选', '候选命格', 'patterns', 'talents', 'candidates', 'items'],
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
  const normalized = new Map(Object.entries(record).map(([key, value]) => [key.normalize('NFKC').toLocaleLowerCase(), value]))
  for (const alias of aliases) {
    const value = normalized.get(alias.normalize('NFKC').toLocaleLowerCase())
    if (value !== undefined) return value
  }
  return undefined
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function normalizeCategory(value: unknown, fallback?: DestinyPatternCategory): DestinyPatternCategory | null {
  const text = textValue(value)
  const english: Record<string, DestinyPatternCategory> = {
    enhancement: 'enhancement', enhance: 'enhancement', transformation: 'enhancement', evolution: 'enhancement',
    control: 'control', projection: 'control', manipulation: 'control', influence: 'control',
    perception: 'perception', information: 'perception', sensing: 'perception', cognition: 'perception',
    summoning: 'summoning', summon: 'summoning', clone: 'summoning', contract: 'summoning',
    creation: 'creation', crafting: 'creation', transmutation: 'creation', conversion: 'creation',
  }
  return CATEGORY_BY_LABEL[text] ?? english[text.toLocaleLowerCase()] ?? fallback ?? null
}

function normalizeAttributeKey(value: string): string | null {
  const compact = value.normalize('NFKC').trim().replace(/[\s_-]+/gu, '').toLocaleLowerCase()
  return ATTRIBUTE_BY_LABEL[compact] ?? ATTRIBUTE_BY_LABEL[value.trim()] ?? null
}

function addAttribute(result: Record<string, number>, label: unknown, rawValue: unknown): void {
  const key = normalizeAttributeKey(textValue(label))
  const value = Number(rawValue)
  if (!key || !Number.isInteger(value) || value === 0) return
  result[key] = (result[key] ?? 0) + value
}

function normalizeAttrBonus(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isRecord(entry)) {
        addAttribute(result, pickField(entry, ['属性', '名称', 'attribute', 'name', 'key']), pickField(entry, ['数值', '值', 'value', 'amount', 'bonus']))
      } else if (typeof entry === 'string') {
        Object.assign(result, normalizeAttrBonus(entry))
      }
    }
    return result
  }
  if (isRecord(value)) {
    for (const [label, rawValue] of Object.entries(value)) addAttribute(result, label, rawValue)
    return result
  }
  if (typeof value !== 'string') return result
  if (/^(无|没有|无属性|无加成|none|none\s*bonus)$/iu.test(value.trim())) return result
  const pattern = /(体魄|力量|体质|心智|智力|智慧|魅力|容貌|气质|财富|家庭|出身|资源|气运|physique|mind|charisma|familybackground|luck)\s*[:：=]?\s*([+-]?\d+)/giu
  for (const match of value.matchAll(pattern)) addAttribute(result, match[1], match[2])
  return result
}

function looksLikePattern(value: Record<string, unknown>): boolean {
  return FIELD_ALIASES.name.some((key) => Object.prototype.hasOwnProperty.call(value, key))
    || FIELD_ALIASES.description.some((key) => Object.prototype.hasOwnProperty.call(value, key))
    || FIELD_ALIASES.effect.some((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function collectPatternItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap((entry) => collectPatternItems(entry))
  if (!isRecord(value)) return []
  const nested = pickField(value, FIELD_ALIASES.items)
  if (nested !== undefined) return collectPatternItems(nested)
  if (looksLikePattern(value)) return [value]
  return Object.values(value).flatMap((entry) => (
    Array.isArray(entry) || isRecord(entry) ? collectPatternItems(entry) : []
  ))
}

function normalizePatternItem(value: unknown, fallbackCategory?: DestinyPatternCategory): DestinyPatternAIItem | null {
  if (!isRecord(value)) return null
  const name = textValue(pickField(value, FIELD_ALIASES.name))
  let description = textValue(pickField(value, FIELD_ALIASES.description))
  let effect = textValue(pickField(value, FIELD_ALIASES.effect))
  if (!description && effect) description = effect
  if (!effect && description) effect = description
  const category = normalizeCategory(pickField(value, FIELD_ALIASES.category), fallbackCategory)
  if (!category || !name || !description || !effect) return null
  return {
    category,
    name,
    description,
    effect,
    attrBonus: normalizeAttrBonus(pickField(value, FIELD_ALIASES.attrBonus)),
  }
}

export function parseDestinyPatternAIResponse(
  response: string,
  expectedCategory?: DestinyPatternCategory,
): DestinyPatternAIItem[] {
  const candidates = parseAIJSONCandidates<unknown>(response)
  const items = candidates.flatMap((candidate) => collectPatternItems(candidate.value))
  const normalized: DestinyPatternAIItem[] = []
  for (const item of items) {
    const parsed = normalizePatternItem(item, expectedCategory)
    if (parsed) normalized.push(parsed)
  }
  return normalized
}

export function validateDestinyPatternCategory(category: string): DestinyPatternCategory | null {
  return normalizeCategory(category)
}

export function validateDestinyPatternRarity(rarity: string): DestinyPatternRarity | null {
  const valid: DestinyPatternRarity[] = ['common', 'fine', 'rare', 'epic', 'legendary']
  return valid.includes(rarity as DestinyPatternRarity) ? rarity as DestinyPatternRarity : null
}

export function validateDestinyPatternAttrBonus(
  bonus: Record<string, number> | undefined,
  rarity: DestinyPatternRarity,
): Partial<Record<string, number>> {
  if (!bonus || typeof bonus !== 'object') return {}

  const validKeys = ['mind', 'physique', 'charisma', 'familyBackground', 'luck']
  const result: Record<string, number> = {}
  for (const key of validKeys) {
    const value = Number(bonus[key])
    if (!Number.isInteger(value) || value === 0) continue
    result[key] = value
  }
  if (!validateDestinyPatternAttrBonusForRarity(result, rarity)) {
    throw new Error(`${getDestinyPatternRarityLabel(rarity)}天赋属性加成超过等级边界或包含无效值`)
  }
  return result
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
    || pattern.rarity !== 'common'
  ) return null

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
      attrBonus: validateDestinyPatternAttrBonus(
        pattern.attrBonus as Record<string, number> | undefined,
        'common',
      ),
    }
  } catch {
    return null
  }
}

export function getDestinyPatternRarityLabel(rarity: DestinyPatternRarity): string {
  const labels: Record<DestinyPatternRarity, string> = {
    common: '普通', fine: '精良', rare: '稀有', epic: '史诗', legendary: '传说', mythic: '神话',
  }
  return labels[rarity]
}
