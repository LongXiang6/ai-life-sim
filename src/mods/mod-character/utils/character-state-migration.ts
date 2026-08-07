/**
 * @module character-state-migration
 * @description 角色持久化与存档快照的兼容清洗
 * @mod mod-character
 */

import type {
  AttributeModifiers,
  BaseAttributes,
  CharacterBaseState,
  DestinyPattern,
  DestinyPatternState,
  LifespanDraftState,
  MythicPattern,
  MythicPatternCandidate,
} from '../types'
import {
  MYTHIC_PATTERN_SELECT_COUNT,
  RACE_LIFESPAN,
} from '../constants'
import { sanitizeCharacterNarrativeStatus } from '../subsystems/character-status-validation'

const BASE_ATTRIBUTE_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma'] as const

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
    physique: finiteNumber(record.physique),
    mind: finiteNumber(record.mind),
    talentAptitude: finiteNumber(record.talentAptitude),
    charisma: finiteNumber(record.charisma),
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
  for (const key of BASE_ATTRIBUTE_KEYS) {
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
  if (!['common', 'fine', 'rare', 'epic', 'legendary'].includes(String(value.rarity))) return null
  if (!['positive', 'negative', 'mixed'].includes(String(value.polarity))) return null

  const systemModifiers: Partial<Record<string, number>> | undefined = isRecord(value.systemModifiers)
    ? Object.fromEntries(
        Object.entries(value.systemModifiers)
          .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount)),
      ) as Partial<Record<string, number>>
    : undefined

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    effect: value.effect,
    rarity: value.rarity as DestinyPattern['rarity'],
    polarity: value.polarity as DestinyPattern['polarity'],
    attrBonus: sanitizeAttrBonus(value.attrBonus),
    ...(systemModifiers && Object.keys(systemModifiers).length > 0 ? { systemModifiers } : {}),
  }
}

export function sanitizeDestinyPatternState(value: unknown): DestinyPatternState {
  const record = isRecord(value) ? value : {}
  const candidates = Array.isArray(record.candidates)
    ? record.candidates.map(sanitizeDestinyPattern).filter((item): item is DestinyPattern => item !== null)
    : []
  const patterns = Array.isArray(record.patterns)
    ? record.patterns.map(sanitizeDestinyPattern).filter((item): item is DestinyPattern => item !== null)
    : []
  const rarityCount: DestinyPatternState['rarityCount'] = {
    common: 0,
    fine: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  }
  for (const pattern of patterns) rarityCount[pattern.rarity]++
  return { candidates, patterns, rarityCount }
}

export function sanitizeMythicPatternCandidate(value: unknown): MythicPatternCandidate | null {
  if (!isRecord(value)) return null
  if (typeof value.name !== 'string' || typeof value.concept !== 'string' || typeof value.effect !== 'string') return null
  const name = value.name.trim()
  const concept = value.concept.trim()
  const effect = value.effect.trim()
  if (!name || !concept || !effect) return null
  const strengthTier = typeof value.strengthTier === 'string'
    && ['echo', 'deep', 'legacy', 'immortal'].includes(value.strengthTier)
    ? value.strengthTier as MythicPatternCandidate['strengthTier']
    : undefined
  const sourceScore = typeof value.sourceScore === 'number' && Number.isFinite(value.sourceScore)
    ? Math.max(0, Math.min(100, Math.round(value.sourceScore)))
    : undefined
  return {
    name,
    concept,
    effect,
    ...(strengthTier ? { strengthTier } : {}),
    ...(sourceScore === undefined ? {} : { sourceScore }),
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

export function sanitizeMythicPattern(value: unknown): MythicPattern | null {
  const candidate = sanitizeMythicPatternCandidate(value)
  if (!candidate || !isRecord(value) || typeof value.id !== 'string' || !isRecord(value.source)) return null
  if (typeof value.source.worldName !== 'string' || typeof value.source.characterName !== 'string') return null
  return {
    ...candidate,
    id: value.id,
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

/**
 * 清洗 Zustand persist 或 OPFS 角色快照。
 * 角色创建草稿会保留；健康、寿命和生命周期运行投影始终重置，
 * 后续只从 Orchestrator owning-system 快照同步。
 */
export function sanitizeCharacterStateSnapshot(value: unknown): Record<string, unknown> {
  const record = isRecord(value) ? value : {}
  const talents = Array.isArray(record.talents)
    ? record.talents.map((talent) => {
        if (!isRecord(talent)) return talent
        return { ...talent, attrBonus: sanitizeAttrBonus(talent.attrBonus) }
      })
    : []
  const mythicCandidates = Array.isArray(record.mythicCandidates)
    ? record.mythicCandidates
        .map(sanitizeMythicPatternCandidate)
        .filter((item): item is MythicPatternCandidate => item !== null)
    : []
  const equippedMythicPatterns = (Array.isArray(record.equippedMythicPatterns)
    ? record.equippedMythicPatterns.map(sanitizeMythicPattern).filter((item): item is MythicPattern => item !== null)
    : [])
    .filter((pattern, index, patterns) => patterns.findIndex((candidate) => candidate.id === pattern.id) === index)
    .slice(0, MYTHIC_PATTERN_SELECT_COUNT)

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
    age: Math.max(0, finiteNumber(record.age)),
    characterBase: sanitizeCharacterBaseState(record.characterBase),
    destinyPatterns: sanitizeDestinyPatternState(record.destinyPatterns),
    lifespanDraft: sanitizeLifespanDraft(record.lifespanDraft, record.race),
    talents,
    mythicCandidates,
    equippedMythicPatterns,
    sealedMythicPatternId: typeof record.sealedMythicPatternId === 'string'
      ? record.sealedMythicPatternId
      : null,
    worldCode,
    destinyPoolCacheKey: `mod-character:destiny-pool:${worldCode}`,
    talentPoolCacheKey: `mod-character:talent-pool:${worldCode}`,
  }
}
