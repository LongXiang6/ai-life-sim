/**
 * Purpose: Sanitize character persistence and save snapshots into the current state contract.
 * Owner: mod-character
 * Responsibility: Character-state migration and normalization only.
 */

import type {
  AttributeModifiers, BaseAttributes, CharacterBaseState, DestinyPattern,
  DestinyPatternGrowthAssessment, DestinyPatternGrowthEvidence, DestinyPatternGrowthHistoryEntry,
  DestinyPatternGrowthOption, DestinyPatternState,
  LifespanDraftState, PendingDestinyPatternGrowth, ReincarnationTalent,
  DestinyPatternGrowthSource,
} from '../types'
import {
  PATTERN_LOADOUT_SLOT_COUNT,
  RACE_LIFESPAN,
} from '../constants'
import { sanitizeCharacterNarrativeStatus } from '../subsystems/character-status-validation'
import { getPatternLoadoutCount } from '../pattern-loadout'
import {
  DESTINY_PATTERN_GROWTH_MINIMUM_AGE,
  getNextDestinyPatternDevelopmentStage,
} from '../destiny-pattern-growth'
import { basePointsFromCalendarDays } from '@/foundation'
import {
  normalizeCommonDestinyPatternCandidate,
  validateDestinyPatternAptitudeTier,
  validateDestinyPatternAttrBonus,
  validateDestinyPatternCategory,
} from '../subsystems/destiny-pattern-system/validation'

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

export function resetPersistedTalentState(value: unknown): Record<string, unknown> {
  const record = isRecord(value) ? value : {}
  return {
    ...record,
    destinyPatterns: {
      candidates: [],
      patterns: [],
      aptitudeCount: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
      pendingGrowth: null,
      growthHistory: [],
      growthEvidence: [],
      growthAssessments: [],
    },
    equippedReincarnationTalents: [],
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
  if (
    'rarity' in value
    || 'strengthenLevel' in value
    || 'apexStrengthenLevel' in value
    || typeof value.id !== 'string'
    || !value.id.trim()
    || typeof value.lineageId !== 'string'
    || !value.lineageId.trim()
    || !Number.isSafeInteger(value.version)
    || Number(value.version) < 1
    || typeof value.name !== 'string'
    || !value.name.trim()
    || typeof value.description !== 'string'
    || !value.description.trim()
    || typeof value.effect !== 'string'
    || !value.effect.trim()
  ) return null
  const category = validateDestinyPatternCategory(String(value.category))
  const aptitudeTier = validateDestinyPatternAptitudeTier(value.aptitudeTier)
  if (
    !category
    || aptitudeTier === null
    || !['awakening', 'mastery', 'complete'].includes(String(value.developmentStage))
  ) return null
  let attrBonus: Partial<AttributeModifiers>
  try {
    attrBonus = validateDestinyPatternAttrBonus(
      value.attrBonus as Record<string, number>,
      aptitudeTier,
    )
  } catch {
    return null
  }

  return {
    lineageId: value.lineageId.trim(),
    version: Number(value.version),
    id: value.id.trim(),
    name: value.name.trim(),
    description: value.description.trim(),
    effect: value.effect.trim(),
    category,
    aptitudeTier,
    developmentStage: value.developmentStage as DestinyPattern['developmentStage'],
    attrBonus,
  }
}

function sanitizeGrowthSource(value: unknown): DestinyPatternGrowthSource | null {
  if (!isRecord(value)) return null
  return 'apexStrengthenLevel' in value
    ? sanitizeReincarnationTalent(value)
    : sanitizeDestinyPattern(value)
}

function samePatternVersion(
  left: DestinyPatternGrowthSource,
  right: DestinyPatternGrowthSource,
): boolean {
  return left.id === right.id
    && left.lineageId === right.lineageId
    && left.version === right.version
    && left.aptitudeTier === right.aptitudeTier
    && left.developmentStage === right.developmentStage
    && ('apexStrengthenLevel' in left) === ('apexStrengthenLevel' in right)
}

function sanitizeGrowthOption(
  value: unknown,
  pendingSource: DestinyPatternGrowthSource,
): DestinyPatternGrowthOption | null {
  if (!isRecord(value) || typeof value.optionId !== 'string' || !value.optionId.trim()) return null
  const pattern = sanitizeGrowthSource(value.pattern)
  if (!pattern) return null
  if (pattern.lineageId !== pendingSource.lineageId) return null
  if (pattern.version !== pendingSource.version + 1) return null
  if (pattern.aptitudeTier !== pendingSource.aptitudeTier) return null
  if (pattern.developmentStage !== getNextDestinyPatternDevelopmentStage(pendingSource.developmentStage)) return null
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
  reincarnationTalents: readonly ReincarnationTalent[],
): PendingDestinyPatternGrowth | null {
  if (!isRecord(value)) return null
  if (typeof value.choiceId !== 'string' || !value.choiceId.trim()) return null
  if (typeof value.narrativeId !== 'string' || !value.narrativeId.trim()) return null
  if (!Number.isSafeInteger(value.roundSequence) || Number(value.roundSequence) < 1) return null
  if (typeof value.lineageId !== 'string' || !value.lineageId.trim()) return null
  const source = sanitizeGrowthSource(value.source)
  if (!source || source.lineageId !== value.lineageId.trim()) return null
  const current = patterns.find((pattern) => pattern.lineageId === source.lineageId)
    ?? reincarnationTalents.find((talent) => talent.lineageId === source.lineageId)
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
  const source = sanitizeGrowthSource(value.source)
  const result = sanitizeGrowthSource(value.result)
  if (!source || !result) return null
  if (('apexStrengthenLevel' in source) !== ('apexStrengthenLevel' in result)) return null
  if (source.lineageId !== value.lineageId.trim() || result.lineageId !== source.lineageId) return null
  if (result.version !== source.version + 1) return null
  if (result.aptitudeTier !== source.aptitudeTier) return null
  if (result.developmentStage !== getNextDestinyPatternDevelopmentStage(source.developmentStage)) return null
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
  const latestByLineage = new Map<string, DestinyPatternGrowthSource>()
  for (const entry of history) {
    if (seenChoices.has(entry.choiceId)) return []
    seenChoices.add(entry.choiceId)
    const previous = latestByLineage.get(entry.lineageId)
    if (previous && !samePatternVersion(previous, entry.source)) return []
    latestByLineage.set(entry.lineageId, entry.result)
  }
  return history
}

export function restoreReincarnationTalentsBeforeUnderageGrowth(
  destinyPatternState: unknown,
  currentAge: number | undefined,
  equippedReincarnationTalents: readonly ReincarnationTalent[],
): ReincarnationTalent[] {
  if (
    currentAge === undefined
    || (Number.isFinite(currentAge) && Math.max(0, Math.floor(currentAge)) >= DESTINY_PATTERN_GROWTH_MINIMUM_AGE)
  ) return [...equippedReincarnationTalents]
  const originalByLineage = new Map<string, DestinyPatternGrowthSource>()
  const record = isRecord(destinyPatternState) ? destinyPatternState : {}
  for (const entry of sanitizeGrowthHistory(record.growthHistory)) {
    if (!originalByLineage.has(entry.lineageId)) {
      originalByLineage.set(entry.lineageId, structuredClone(entry.source))
    }
  }
  return equippedReincarnationTalents.map((talent) => {
    const original = originalByLineage.get(talent.lineageId)
    return original && 'apexStrengthenLevel' in original
      ? structuredClone(original)
      : talent
  })
}

function sanitizeGrowthEvidence(value: unknown): DestinyPatternGrowthEvidence[] {
  if (!Array.isArray(value)) return []
  const byKey = new Map<string, DestinyPatternGrowthEvidence>()
  for (const item of value) {
    if (!isRecord(item)) continue
    if (typeof item.lineageId !== 'string' || !item.lineageId.trim()) continue
    if (!Number.isSafeInteger(item.sourceRound) || Number(item.sourceRound) < 1) continue
    if (typeof item.result !== 'string' || !item.result.trim()) continue
    const usage = typeof item.usage === 'string' && item.usage.trim() ? item.usage.trim() : undefined
    const evidence: DestinyPatternGrowthEvidence = {
      lineageId: item.lineageId.trim(),
      sourceRound: Number(item.sourceRound),
      ...(usage ? { usage } : {}),
      result: item.result.trim(),
      ...(typeof item.breakthrough === 'string' && item.breakthrough.trim()
        ? { breakthrough: item.breakthrough.trim() }
        : {}),
    }
    const key = `${evidence.lineageId}:${evidence.sourceRound}`
    const previous = byKey.get(key)
    byKey.set(key, previous
      ? {
          ...previous,
          ...(evidence.usage
            ? {
                usage: previous.usage
                  ? previous.usage.includes(evidence.usage)
                    ? previous.usage
                    : `${previous.usage}；${evidence.usage}`
                  : evidence.usage,
              }
            : {}),
          result: previous.result.includes(evidence.result) ? previous.result : `${previous.result}；${evidence.result}`,
          ...(previous.breakthrough || !evidence.breakthrough
            ? {}
            : { breakthrough: evidence.breakthrough }),
        }
      : evidence)
  }
  return [...byKey.values()].sort((left, right) => (
    left.sourceRound - right.sourceRound || left.lineageId.localeCompare(right.lineageId)
  ))
}

function sanitizeGrowthAssessments(value: unknown): DestinyPatternGrowthAssessment[] {
  if (!Array.isArray(value)) return []
  const latest = new Map<string, DestinyPatternGrowthAssessment>()
  for (const item of value) {
    if (!isRecord(item)) continue
    if (typeof item.lineageId !== 'string' || !item.lineageId.trim()) continue
    if (!Number.isSafeInteger(item.evaluatedThroughRound) || Number(item.evaluatedThroughRound) < 1) continue
    const assessment: DestinyPatternGrowthAssessment = {
      lineageId: item.lineageId.trim(),
      evaluatedThroughRound: Number(item.evaluatedThroughRound),
      ...(Number.isSafeInteger(item.evaluatedBreakthroughRound) && Number(item.evaluatedBreakthroughRound) >= 1
        ? { evaluatedBreakthroughRound: Number(item.evaluatedBreakthroughRound) }
        : {}),
    }
    const previous = latest.get(assessment.lineageId)
    if (!previous || assessment.evaluatedThroughRound > previous.evaluatedThroughRound) {
      latest.set(assessment.lineageId, assessment)
    }
  }
  return [...latest.values()]
}

function recountDestinyPatternAptitude(
  patterns: readonly DestinyPattern[],
): DestinyPatternState['aptitudeCount'] {
  const aptitudeCount: DestinyPatternState['aptitudeCount'] = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
  }
  for (const pattern of patterns) aptitudeCount[pattern.aptitudeTier]++
  return aptitudeCount
}

function removeUnderageDestinyPatternGrowth(
  state: DestinyPatternState,
  currentAge: number | undefined,
  equippedReincarnationTalents: readonly ReincarnationTalent[],
): { state: DestinyPatternState; equippedReincarnationTalents: ReincarnationTalent[] } {
  if (
    currentAge === undefined
    || (Number.isFinite(currentAge) && Math.max(0, Math.floor(currentAge)) >= DESTINY_PATTERN_GROWTH_MINIMUM_AGE)
  ) return { state, equippedReincarnationTalents: [...equippedReincarnationTalents] }
  if (
    !state.pendingGrowth
    && state.growthHistory.length === 0
    && state.growthEvidence.length === 0
    && state.growthAssessments.length === 0
  ) return { state, equippedReincarnationTalents: [...equippedReincarnationTalents] }

  const originalByLineage = new Map<string, DestinyPatternGrowthSource>()
  for (const entry of state.growthHistory) {
    if (!originalByLineage.has(entry.lineageId)) {
      originalByLineage.set(entry.lineageId, structuredClone(entry.source))
    }
  }
  const patterns = state.patterns.map((pattern) => (
    originalByLineage.get(pattern.lineageId) &&
      !('apexStrengthenLevel' in originalByLineage.get(pattern.lineageId)!)
      ? originalByLineage.get(pattern.lineageId) as DestinyPattern
      : pattern
  ))
  const nextReincarnationTalents = equippedReincarnationTalents.map((talent) => (
    originalByLineage.get(talent.lineageId) &&
      'apexStrengthenLevel' in originalByLineage.get(talent.lineageId)!
      ? originalByLineage.get(talent.lineageId) as ReincarnationTalent
      : talent
  ))
  return { state: {
    ...state,
    patterns,
    aptitudeCount: recountDestinyPatternAptitude(patterns),
    pendingGrowth: null,
    growthHistory: [],
    growthEvidence: [],
    growthAssessments: [],
  }, equippedReincarnationTalents: nextReincarnationTalents }
}

export function sanitizeDestinyPatternState(
  value: unknown,
  currentAge?: number,
  equippedReincarnationTalents: readonly ReincarnationTalent[] = [],
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
  const aptitudeCount = recountDestinyPatternAptitude(patterns)
  const growthHistory = sanitizeGrowthHistory(record.growthHistory)
  const pendingGrowth = sanitizePendingGrowth(
    record.pendingGrowth,
    patterns,
    equippedReincarnationTalents,
  )
  const growthEvidence = sanitizeGrowthEvidence(record.growthEvidence)
    .filter((entry) => (
      patterns.some((pattern) => pattern.lineageId === entry.lineageId)
      || equippedReincarnationTalents.some((talent) => talent.lineageId === entry.lineageId)
    ))
  const growthAssessments = sanitizeGrowthAssessments(record.growthAssessments)
    .filter((entry) => (
      patterns.some((pattern) => pattern.lineageId === entry.lineageId)
      || equippedReincarnationTalents.some((talent) => talent.lineageId === entry.lineageId)
    ))
  return removeUnderageDestinyPatternGrowth(
    {
      candidates,
      patterns,
      aptitudeCount,
      pendingGrowth,
      growthHistory,
      growthEvidence,
      growthAssessments,
    },
    currentAge,
    equippedReincarnationTalents,
  ).state
}

export function sanitizeReincarnationTalent(value: unknown): ReincarnationTalent | null {
  if (!isRecord(value)) return null
  if (
    'rarity' in value
    || 'strengthenLevel' in value
    || typeof value.id !== 'string'
    || !value.id.trim()
    || typeof value.lineageId !== 'string'
    || !value.lineageId.trim()
    || !Number.isSafeInteger(value.version)
    || Number(value.version) < 1
    || typeof value.name !== 'string'
    || !value.name.trim()
    || typeof value.description !== 'string'
    || !value.description.trim()
    || typeof value.effect !== 'string'
    || !value.effect.trim()
  ) return null
  const category = validateDestinyPatternCategory(String(value.category))
  const aptitudeTier = validateDestinyPatternAptitudeTier(value.aptitudeTier)
  if (
    !category
    || aptitudeTier === null
    || !['awakening', 'mastery', 'complete'].includes(String(value.developmentStage))
    || !Number.isSafeInteger(value.apexStrengthenLevel)
    || Number(value.apexStrengthenLevel) < 0
    || (aptitudeTier !== 9 && value.apexStrengthenLevel !== 0)
    || !Number.isSafeInteger(value.acquiredAt)
    || Number(value.acquiredAt) < 0
  ) return null
  if (!isRecord(value.source)
    || typeof value.source.worldName !== 'string'
    || typeof value.source.characterName !== 'string') return null
  let attrBonus: Partial<AttributeModifiers>
  try {
    attrBonus = validateDestinyPatternAttrBonus(
      value.attrBonus as Record<string, number>,
      aptitudeTier,
    )
  } catch {
    return null
  }
  return {
    id: value.id.trim(),
    lineageId: value.lineageId.trim(),
    version: Number(value.version),
    name: value.name.trim(),
    description: value.description.trim(),
    category,
    aptitudeTier,
    developmentStage: value.developmentStage as ReincarnationTalent['developmentStage'],
    effect: value.effect.trim(),
    attrBonus,
    apexStrengthenLevel: Number(value.apexStrengthenLevel),
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
  const equippedReincarnationTalents = Array.isArray(record.equippedReincarnationTalents)
    ? record.equippedReincarnationTalents
        .map(sanitizeReincarnationTalent)
        .filter((item): item is ReincarnationTalent => item !== null)
    : []
  const normalizedEquippedReincarnationTalents = restoreReincarnationTalentsBeforeUnderageGrowth(
    record.destinyPatterns,
    age,
    equippedReincarnationTalents,
  )
  const destinyPatterns = sanitizeDestinyPatternState(
    record.destinyPatterns,
    age,
    normalizedEquippedReincarnationTalents,
  )
  const loadoutValid = getPatternLoadoutCount(
    destinyPatterns.patterns,
    normalizedEquippedReincarnationTalents,
  ) <= PATTERN_LOADOUT_SLOT_COUNT

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
          aptitudeCount: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
          pendingGrowth: null,
          growthHistory: [],
          growthEvidence: [],
          growthAssessments: [],
        },
    lifespanDraft: sanitizeLifespanDraft(record.lifespanDraft, record.race),
    equippedReincarnationTalents: loadoutValid ? normalizedEquippedReincarnationTalents : [],
    worldCode,
    destinyPoolCacheKey: `mod-character:destiny-pool:${worldCode}`,
  }
}
