/**
 * Purpose: Parse, normalize, deduplicate, and quality-check destiny-pattern AI values.
 * Owner: mod-character
 * Responsibility: Provide pure validation helpers without calling AI or mutating character state.
 */

import { clamp } from '@/core/shared'

import {
  DESTINY_PATTERN_DESC_MIN,
  DESTINY_PATTERN_EFFECT_MIN,
} from '../../prompts/destiny-pattern-context'
import { translateDestinyPatternAIResponse } from '../../prompts/destiny-pattern-prompt'
import type {
  DestinyPattern,
  DestinyPatternPolarity,
  DestinyPatternRarity,
} from '../../types'
import {
  rejectsBirthStateDestinyPatternContent,
  rejectsFutureDestinyPatternContent,
} from '../../utils/destiny-pattern-content-quality'
import { DESTINY_PATTERN_ID_PREFIX } from '../../constants'
import type { DestinyPatternAIItem } from './contracts'

export function destinyPatternNameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

export function dedupeDestinyPatterns(patterns: DestinyPattern[]): DestinyPattern[] {
  const result: DestinyPattern[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  for (const pattern of patterns) {
    if (!pattern?.id || !pattern.name) continue
    const nameKey = destinyPatternNameKey(pattern.name)
    if (seenIds.has(pattern.id) || seenNames.has(nameKey)) continue
    seenIds.add(pattern.id)
    seenNames.add(nameKey)
    result.push({ ...pattern, name: pattern.name.trim() })
  }
  return result
}

export function isAIGeneratedDestinyPattern(pattern: DestinyPattern): boolean {
  return pattern.id.startsWith(`${DESTINY_PATTERN_ID_PREFIX.AI}-`) || pattern.id.startsWith('ai_')
}

export function passesDestinyPatternContentQuality(item: DestinyPatternAIItem, startingAge = 0): boolean {
  const descLen = item.description?.length ?? 0
  if (descLen < DESTINY_PATTERN_DESC_MIN) return false
  if ((item.effect?.length ?? 0) < DESTINY_PATTERN_EFFECT_MIN) return false
  if (rejectsFutureDestinyPatternContent(item, startingAge)) return false
  if (rejectsBirthStateDestinyPatternContent(item)) return false
  if (item.rarity === 'common' && item.attrBonus) {
    const nonZero = Object.values(item.attrBonus).filter((v) => Number(v) !== 0).length
    if (nonZero > 1) return false
  }
  return true
}

export function parseDestinyPatternAIResponse(response: string): Array<{
  name: string
  description: string
  rarity: string
  polarity: string
  effect: string
  attrBonus: Record<string, number>
  systemModifiers?: Record<string, number>
}> {
  try {
    let jsonText = response.trim()
    const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)```/) || jsonText.match(/```\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonText)
    let list: unknown[] = []
    if (Array.isArray(parsed)) {
      list = parsed
    } else if (parsed && typeof parsed === 'object' && parsed.name) {
      list = [parsed]
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { patterns?: unknown }).patterns)) {
      list = (parsed as { patterns: unknown[] }).patterns
    } else if (parsed && typeof parsed === 'object') {
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
          list = val
          break
        }
      }
    }

    // 执行中文键值对底层英文契约翻译映射转译
    return translateDestinyPatternAIResponse(list) as Array<{
      name: string
      description: string
      rarity: string
      polarity: string
      effect: string
      attrBonus: Record<string, number>
      systemModifiers?: Record<string, number>
    }>
  } catch {
    return []
  }
}

export function validateDestinyPatternRarity(rarity: string): DestinyPatternRarity | null {
  const valid: DestinyPatternRarity[] = ['common', 'fine', 'rare', 'epic', 'legendary']
  return valid.includes(rarity as DestinyPatternRarity) ? (rarity as DestinyPatternRarity) : null
}

export function validateDestinyPatternPolarity(polarity: string): DestinyPatternPolarity | null {
  const valid: DestinyPatternPolarity[] = ['positive', 'mixed']
  return valid.includes(polarity as DestinyPatternPolarity) ? (polarity as DestinyPatternPolarity) : null
}

export function validateDestinyPatternAttrBonus(
  bonus: Record<string, number> | undefined,
  rarity: string,
): Partial<Record<string, number>> {
  if (!bonus || typeof bonus !== 'object') return {}

  const validKeys = ['physique', 'mind', 'talentAptitude', 'charisma']
  const result: Record<string, number> = {}
  const maxTotal = rarity === 'legendary' ? 7 : rarity === 'epic' ? 5 : rarity === 'rare' ? 4 : rarity === 'fine' ? 3 : 1

  let total = 0
  for (const key of validKeys) {
    const val = Number(bonus[key])
    if (isNaN(val) || val === 0) continue
    const clamped = clamp(val, -4, 4)
    result[key] = clamped
    total += Math.abs(clamped)
  }

  // 总和超限则按比例缩放
  if (total > maxTotal && total > 0) {
    const scale = maxTotal / total
    for (const key of Object.keys(result)) {
      result[key] = Math.round((result[key] ?? 0) * scale)
    }
  }

  return result
}

export function getDestinyPatternRarityLabel(rarity: DestinyPatternRarity): string {
  const labels: Record<DestinyPatternRarity, string> = {
    common: '普通', fine: '精良', rare: '稀有', epic: '史诗', legendary: '传说',
  }
  return labels[rarity] ?? rarity
}

