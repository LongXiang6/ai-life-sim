/**
 * Purpose: Sanitize character persistence and save snapshots into the current state contract.
 * Owner: mod-character
 * Responsibility: Character-state migration and normalization only.
 */

import type {
  AttributeModifiers, BaseAttributes, CharacterBaseState, DestinyPattern,
  DestinyPatternGrowthHistoryEntry, DestinyPatternGrowthOption, DestinyPatternState,
  LifespanDraftState, PendingDestinyPatternGrowth, ReincarnationTalent,
} from '../types'
import {
  PATTERN_LOADOUT_SLOT_COUNT,
  RACE_LIFESPAN,
} from '../constants'
import { sanitizeCharacterNarrativeStatus } from '../subsystems/character-status-validation'
import { getPatternLoadoutCount } from '../pattern-loadout'
import {
  createDestinyPatternLineageId,
  DESTINY_PATTERN_GROWTH_MINIMUM_AGE,
  getNextDestinyPatternRarity,
} from '../destiny-pattern-growth'
import { basePointsFromCalendarDays } from '@/foundation'
import { sanitizeDestinyPatternCategory } from './destiny-pattern-category-migration'
import { normalizeCommonDestinyPatternCandidate } from '../subsystems/destiny-pattern-system/validation'

const BASE_ATTRIBUTE_KEYS = ['mind', 'physique', 'charisma', 'familyBackground'] as const
const ATTRIBUTE_BONUS_KEYS = [...BASE_ATTRIBUTE_KEYS, 'luck'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createGlobalCharacterId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `character_${randomId}`
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeBaseAttributes(value: unknown): BaseAttributes {
  const record = isRecord(value) ? value : {}
  return {
    mind: finiteNumber(record.mind),
    physique: finiteNumber(record.physique),
    charisma: finiteNumber(record.charisma),
    familyBackground: finiteNumber(record.familyBackground),
  }
}

function sanitizeAttributeModifiers(value: unknown): AttributeModifiers {
  return sanitizeBaseAttributes(value)
}

export function sanitizeCharacterBaseState(value: unknown): CharacterBaseState {
  const record = isRecord(value) ? value : {}
  const contextModifiers = isRecord(record.contextModifiers)
    ? Object.fromEntries(
        Object.entries(record.contextModifiers).flatMap(([contextId, sources]) => {
          if (!isRecord(sources)) return []
          return [[contextId, Object.fromEntries(
            Object.entries(sources).flatMap(([sourceId, modifiers]) => (
              isRecord(modifiers) ? [[sourceId, sanitizeAttrBonus(modifiers)]] : []
            )),
          )]]
        }),
      )
    : {}
  const status = sanitizeCharacterNarrativeStatus(record.status)
  return {
    base: sanitizeBaseAttributes(record.base),
    current: sanitizeBaseAttributes(record.current),
    modifiers: sanitizeAttributeModifiers(record.modifiers),
    contextModifiers,
    startingAge: finiteNumber(record.startingAge),
    ...(status ? { status } : {}),
  }
}

function sanitizeAttrBonus(value: unknown): Partial<AttributeModifiers> {
  if (!isRecord(value)) return {}
  const result: Partial<AttributeModifiers> = {}
  for (const key of ATTRIBUTE_BONUS_KEYS) {
    const amount = value[key]
    if (typeof amount === 'number' && Number.isFinite(amount) && amount !== 0) {
      result[key] = amount
    }
  }
  return result
}

export function sanitizeDestinyPattern(value: unknown): DestinyPattern | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null
  if (typeof value.description !== 'string' || typeof value.effect !== 'string') return null
  const category = sanitizeDestinyPatternCategory(value.category)
  if (!category) return null
  if (!['common', 'fine', 'rare', 'epic', 'legendary'].includes(String(value.rarity))) return null

  const lineageId = typeof value.lineageId === 'string' && value.lineageId.trim()
    ? value.lineageId.trim()
    : createDestinyPatternLineageId(`legacy:${value.id}`)
  const version = Number.isSafeInteger(value.version) && Number(value.version) >= 1
    ? Number(value.version)
    : 1

  return {
    lineageId,
    version,
    id: value.id,
    name: value.name,
    description: value.description,
    effect: value.effect,
    category,
    rarity: value.rarity as DestinyPattern['rarity'],
    attrBonus: sanitizeAttrBonus(value.attrBonus),
  }
}

function samePatternVersion(left: DestinyPattern, right: DestinyPattern): boolean {
  return left.id === right.id
    && left.lineageId === right.lineageId
    && left.version === right.version
    && left.rarity === right.rarity
}

function sanitizeGrowthOption(
  value: unknown,
  pendingSource: DestinyPattern,
): DestinyPatternGrowthOption | null {
  if (!isRecord(value) || typeof value.optionId !== 'string' || !value.optionId.trim()) return null
  const pattern = sanitizeDestinyPattern(value.pattern)
  if (!pattern) return null
  if (pattern.lineageId !== pendingSource.lineageId) return null
  if (pattern.version !== pendingSource.version + 1) return null
  if (pattern.rarity !== getNextDestinyPatternRarity(pendingSource.rarity)) return null
  if (pattern.category !== pendingSource.category) return null
  if (!['深度强化', '广度强化', '转变强化'].includes(String(value.route))) return null
  return {
    optionId: value.optionId.trim(),
    route: value.route as DestinyPatternGrowthOption['route'],
    pattern,
  }
}

function sanitizePendingGrowth(
  value: unknown,
  patterns: readonly DestinyPattern[],
): PendingDestinyPatternGrowth | null {
  if (!isRecord(value)) return null
  if (typeof value.choiceId !== 'string' || !value.choiceId.trim()) return null
  if (typeof value.narrativeId !== 'string' || !value.narrativeId.trim()) return null
  if (!Number.isSafeInteger(value.roundSequence) || Number(value.roundSequence) < 1) return null
  if (typeof value.lineageId !== 'string' || !value.lineageId.trim()) return null
  const source = sanitizeDestinyPattern(value.source)
  if (!source || source.lineageId !== value.lineageId.trim()) return null
  const current = patterns.find((pattern) => pattern.lineageId === source.lineageId)
  if (!current || !samePatternVersion(current, source)) return null
  if (!Array.isArray(value.options) || value.options.length !== 3) return null
  const options = value.options.map((option) => sanitizeGrowthOption(option, source))
  const [first, second, third] = options
  if (!first || !second || !third) return null
  if (new Set([first.optionId, second.optionId, third.optionId]).size !== 3) return null
  if (
    first.route !== '深度强化'
    || second.route !== '广度强化'
    || third.route !== '转变强化'
  ) return null
  return {
    choiceId: value.choiceId.trim(),
    narrativeId: value.narrativeId.trim(),
    roundSequence: Number(value.roundSequence),
    lineageId: value.lineageId.trim(),
    source,
    options: [first, second, third],
  }
}

function sanitizeGrowthHistoryEntry(value: unknown): DestinyPatternGrowthHistoryEntry | null {
  if (!isRecord(value)) return null
  if (typeof value.choiceId !== 'string' || !value.choiceId.trim()) return null
  if (typeof value.narrativeId !== 'string' || !value.narrativeId.trim()) return null
  if (!Number.isSafeInteger(value.roundSequence) || Number(value.roundSequence) < 1) return null
  if (typeof value.lineageId !== 'string' || !value.lineageId.trim()) return null
  if (typeof value.selectedOptionId !== 'string' || !value.selectedOptionId.trim()) return null
  if (typeof value.committedAt !== 'number' || !Number.isFinite(value.committedAt)) return null
  const source = sanitizeDestinyPattern(value.source)
  const result = sanitizeDestinyPattern(value.result)
  if (!source || !result) return null
  if (source.lineageId !== value.lineageId.trim() || result.lineageId !== source.lineageId) return null
  if (result.version !== source.version + 1) return null
  if (result.rarity !== getNextDestinyPatternRarity(source.rarity)) return null
  if (result.category !== source.category) return null
  return {
    choiceId: value.choiceId.trim(),
    narrativeId: value.narrativeId.trim(),
    roundSequence: Number(value.roundSequence),
    lineageId: value.lineageId.trim(),
    selectedOptionId: value.selectedOptionId.trim(),
    source,
    result,
    committedAt: value.committedAt,
    totalBasePoints: typeof value.totalBasePoints === 'number' && Number.isFinite(value.totalBasePoints)
      ? Math.max(0, Math.floor(value.totalBasePoints))
      : basePointsFromCalendarDays(typeof value.totalDays === 'number' && Number.isFinite(value.totalDays)
          ? Math.max(0, Math.floor(value.totalDays)) : 0),
    totalDays: typeof value.totalDays === 'number' && Number.isFinite(value.totalDays)
      ? Math.max(0, Math.floor(value.totalDays))
      : 0,
  }
}

function sanitizeGrowthHistory(value: unknown): DestinyPatternGrowthHistoryEntry[] {
  if (!Array.isArray(value)) return []
  const entries = value.map(sanitizeGrowthHistoryEntry)
  if (entries.some((entry) => entry === null)) return []
  const history = entries as DestinyPatternGrowthHistoryEntry[]
  const seenChoices = new Set<string>()
  const latestByLineage = new Map<string, DestinyPattern>()
  for (const entry of history) {
    if (seenChoices.has(entry.choiceId)) return []
    seenChoices.add(entry.choiceId)
    const previous = latestByLineage.get(entry.lineageId)
    if (previous && !samePatternVersion(previous, entry.source)) return []
    latestByLineage.set(entry.lineageId, entry.result)
  }
  return history
}

function recountDestinyPatternRarity(
  patterns: readonly DestinyPattern[],
): DestinyPatternState['rarityCount'] {
  const rarityCount: DestinyPatternState['rarityCount'] = {
    common: 0,
    fine: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
    mythic: 0,
  }
  for (const pattern of patterns) rarityCount[pattern.rarity]++
  return rarityCount
}

function removeUnderageDestinyPatternGrowth(
  state: DestinyPatternState,
  currentAge: number | undefined,
): DestinyPatternState {
  if (
    currentAge === undefined
    || (Number.isFinite(currentAge) && Math.max(0, Math.floor(currentAge)) >= DESTINY_PATTERN_GROWTH_MINIMUM_AGE)
  ) return state
  if (!state.pendingGrowth && state.growthHistory.length === 0) return state

  const originalByLineage = new Map<string, DestinyPattern>()
  for (const entry of state.growthHistory) {
    if (!originalByLineage.has(entry.lineageId)) {
      originalByLineage.set(entry.lineageId, structuredClone(entry.source))
    }
  }
  const patterns = state.patterns.map((pattern) => (
    originalByLineage.get(pattern.lineageId) ?? pattern
  ))
  return {
    ...state,
    patterns,
    rarityCount: recountDestinyPatternRarity(patterns),
    pendingGrowth: null,
    growthHistory: [],
  }
}

export function sanitizeDestinyPatternState(
  value: unknown,
  currentAge?: number,
): DestinyPatternState {
  const record = isRecord(value) ? value : {}
  const candidates = Array.isArray(record.candidates)
    ? record.candidates
      .map(sanitizeDestinyPattern)
      .filter((item): item is DestinyPattern => item !== null)
      .map(normalizeCommonDestinyPatternCandidate)
      .filter((item): item is DestinyPattern => item !== null)
    : []
  const patterns = Array.isArray(record.patterns)
    ? record.patterns.map(sanitizeDestinyPattern).filter((item): item is DestinyPattern => item !== null)
    : []
  const rarityCount = recountDestinyPatternRarity(patterns)
  const growthHistory = sanitizeGrowthHistory(record.growthHistory)
  const pendingGrowth = sanitizePendingGrowth(record.pendingGrowth, patterns)
  return removeUnderageDestinyPatternGrowth(
    { candidates, patterns, rarityCount, pendingGrowth, growthHistory },
    currentAge,
  )
}

export function sanitizeReincarnationTalent(value: unknown): ReincarnationTalent | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.lineageId !== 'string' || typeof value.name !== 'string') return null
  if (typeof value.description !== 'string' || typeof value.effect !== 'string') return null
  const category = sanitizeDestinyPatternCategory(value.category)
  if (!category) return null
  if (!['common', 'fine', 'rare', 'epic', 'legendary', 'mythic'].includes(String(value.rarity))) return null
  if (!isRecord(value.source)
    || typeof value.source.worldName !== 'string'
    || typeof value.source.characterName !== 'string') return null
  return {
    id: value.id,
    lineageId: value.lineageId.trim(),
    version: Number.isSafeInteger(value.version) && Number(value.version) >= 1
      ? Number(value.version)
      : 1,
    name: value.name,
    description: value.description,
    category,
    rarity: value.rarity as ReincarnationTalent['rarity'],
    effect: value.effect,
    attrBonus: sanitizeAttrBonus(value.attrBonus),
    strengthenLevel: value.rarity === 'mythic'
      ? Number.isSafeInteger(value.strengthenLevel) && Number(value.strengthenLevel) >= 0
        ? Number(value.strengthenLevel)
        : 0
      : 0,
    acquiredAt: finiteNumber(value.acquiredAt),
    source: {
      worldName: value.source.worldName,
      characterName: value.source.characterName,
      ...(typeof value.source.finalAge === 'number' && Number.isFinite(value.source.finalAge)
        ? { finalAge: value.source.finalAge }
        : {}),
      ...(typeof value.source.runId === 'string' && value.source.runId.trim()
        ? { runId: value.source.runId.trim() }
        : {}),
    },
  }
}

function sanitizeLifespanDraft(value: unknown, fallbackRaceId: unknown): LifespanDraftState {
  const record = isRecord(value) ? value : {}
  const raceRecord = isRecord(record.race) ? record.race : {}
  const raceId = typeof record.raceId === 'string' && record.raceId.trim()
    ? record.raceId.trim()
    : typeof fallbackRaceId === 'string' && RACE_LIFESPAN[fallbackRaceId]
      ? fallbackRaceId
      : 'human'
  const catalogRace = RACE_LIFESPAN[raceId] ?? RACE_LIFESPAN.human!
  const clockMode = ['aging', 'ageless', 'cyclic', 'external'].includes(String(raceRecord.clockMode))
    ? raceRecord.clockMode as LifespanDraftState['race']['clockMode']
    : catalogRace.clockMode
  const baseLifespanYears = finiteNumber(raceRecord.baseLifespanYears, catalogRace.baseLifespanYears)
  const maximumLifespanYears = finiteNumber(record.maximumLifespanYears, baseLifespanYears)
  return {
    raceId,
    race: {
      name: typeof raceRecord.name === 'string' && raceRecord.name.trim()
        ? raceRecord.name.trim()
        : catalogRace.name,
      baseLifespanYears: Math.max(1, Math.round(baseLifespanYears)),
      clockMode,
      attrBaselines: sanitizeAttrBonus(raceRecord.attrBaselines ?? catalogRace.attrBaselines),
    },
    maximumLifespanYears: Math.max(1, Math.round(maximumLifespanYears)),
  }
}

/**
 * 清洗 Zustand persist 或 OPFS 角色快照。
 * 角色创建草稿会保留；健康、寿命和生命周期运行投影始终重置，
 * 后续只从 Orchestrator owning-system 快照同步。
 */
export function sanitizeCharacterStateSnapshot(value: unknown): Record<string, unknown> {
  const record = isRecord(value) ? value : {}
  const age = Math.max(0, finiteNumber(record.age))
  const talents = Array.isArray(record.talents)
    ? record.talents.map((talent) => {
        if (!isRecord(talent)) return talent
        return { ...talent, attrBonus: sanitizeAttrBonus(talent.attrBonus) }
      })
    : []
  const destinyPatterns = sanitizeDestinyPatternState(record.destinyPatterns, age)
  const equippedReincarnationTalents = Array.isArray(record.equippedReincarnationTalents)
    ? record.equippedReincarnationTalents
        .map(sanitizeReincarnationTalent)
        .filter((item): item is ReincarnationTalent => item !== null)
    : []
  const loadoutValid = getPatternLoadoutCount(destinyPatterns.patterns, equippedReincarnationTalents) <= PATTERN_LOADOUT_SLOT_COUNT

  const worldCode = Math.max(0, Math.round(finiteNumber(record.worldCode)))

  return {
    characterId: typeof record.characterId === 'string' && record.characterId.trim()
      ? record.characterId.trim()
      : createGlobalCharacterId(),
    name: typeof record.name === 'string' ? record.name : '',
    gender: record.gender === 'female' ? 'female' : 'male',
    race: typeof record.race === 'string' && record.race.trim() ? record.race.trim() : 'human',
    background: typeof record.background === 'string' ? record.background : 'commoner',
    raceOrigin: typeof record.raceOrigin === 'string' ? record.raceOrigin : '',
    age,
    characterBase: sanitizeCharacterBaseState(record.characterBase),
    destinyPatterns: loadoutValid
      ? destinyPatterns
      : {
          ...destinyPatterns,
          patterns: [],
          rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
          pendingGrowth: null,
          growthHistory: [],
        },
    lifespanDraft: sanitizeLifespanDraft(record.lifespanDraft, record.race),
    talents,
    equippedReincarnationTalents: loadoutValid ? equippedReincarnationTalents : [],
    worldCode,
    destinyPoolCacheKey: `mod-character:destiny-pool:${worldCode}`,
    talentPoolCacheKey: `mod-character:talent-pool:${worldCode}`,
  }
}
