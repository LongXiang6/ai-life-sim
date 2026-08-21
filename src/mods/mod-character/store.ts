/**
 * Purpose: Own the persisted character creation and in-life destiny-pattern state.
 * Owner: mod-character
 * Responsibility: Character Store actions, hydration normalization, and persistence projection only.
 */

'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { TalentPreset } from './prompts/talent-presets'
import type {
  CharacterBaseState,
  CharacterSummary,
  DestinyPattern,
  DestinyPatternGrowthHistoryEntry,
  DestinyPatternState,
  LifespanDraftState,
  PendingDestinyPatternGrowth,
  ReincarnationTalent,
} from './types'
import {
  PATTERN_LOADOUT_SLOT_COUNT,
  RACE_LIFESPAN,
} from './constants'
import {
  createGlobalCharacterId,
  sanitizeCharacterStateSnapshot,
  sanitizeDestinyPatternState,
} from './utils/character-state-migration'
import { assertPatternLoadout } from './pattern-loadout'
import {
  isDestinyPatternGrowthAgeEligible,
  registerPendingDestinyPatternGrowthInState,
  resolvePendingDestinyPatternGrowthInState,
} from './destiny-pattern-growth'

function destinyPoolCacheKey(worldCode: number): string {
  return `mod-character:destiny-pool:${worldCode}`
}

function talentPoolCacheKey(worldCode: number): string {
  return `mod-character:talent-pool:${worldCode}`
}

function normalizeEquippedReincarnationTalents(talents: readonly ReincarnationTalent[]): ReincarnationTalent[] {
  const seen = new Set<string>()
  const normalized: ReincarnationTalent[] = []
  for (const talent of talents) {
    if (!talent || seen.has(talent.id)) throw new Error('轮回天赋选择包含重复项')
    seen.add(talent.id)
    normalized.push(talent)
  }
  if (normalized.length > PATTERN_LOADOUT_SLOT_COUNT) {
    throw new Error(`轮回天赋不能超过 ${PATTERN_LOADOUT_SLOT_COUNT} 项`)
  }
  return normalized
}

const HUMAN_RACE = RACE_LIFESPAN.human!

const initialCharacterBase = (): CharacterBaseState => ({
  base: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
  current: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
  modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
  contextModifiers: {},
  startingAge: 0,
})

const initialDestinyPatterns = (): DestinyPatternState => ({
  candidates: [],
  patterns: [],
  rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
  pendingGrowth: null,
  growthHistory: [],
})

const initialLifespanDraft = (): LifespanDraftState => ({
  raceId: 'human',
  race: structuredClone(HUMAN_RACE),
  maximumLifespanYears: HUMAN_RACE.baseLifespanYears,
})

interface CharacterStore {
  characterId: string
  name: string
  gender: 'male' | 'female'
  race: string
  background: string
  raceOrigin: string
  age: number

  characterBase: CharacterBaseState
  destinyPatterns: DestinyPatternState
  lifespanDraft: LifespanDraftState

  talents: TalentPreset[]
  equippedReincarnationTalents: ReincarnationTalent[]

  worldCode: number
  destinyPoolCacheKey: string
  talentPoolCacheKey: string

  getSummary: () => CharacterSummary
  ensureCharacterId: () => string
  setName: (name: string) => void
  setGender: (gender: 'male' | 'female') => void
  setAge: (age: number) => void
  setRace: (race: string) => void
  setBackground: (background: string) => void
  setRaceOrigin: (origin: string) => void
  setCharacterBase: (state: Partial<CharacterBaseState>) => void
  setDestinyPatterns: (state: Partial<DestinyPatternState>) => void
  setLifespanDraft: (state: LifespanDraftState) => void
  setTalents: (talents: TalentPreset[]) => void
  setEquippedReincarnationTalents: (talents: ReincarnationTalent[]) => void
  setPatternLoadout: (
    patterns: DestinyPattern[],
    reincarnationTalents: ReincarnationTalent[],
    candidates: DestinyPattern[],
  ) => void
  registerPendingDestinyPatternGrowth: (pending: PendingDestinyPatternGrowth) => void
  resolvePendingDestinyPatternGrowth: (optionId: string) => DestinyPatternGrowthHistoryEntry
  setWorldCode: (code: number) => void
  reset: () => void
}

export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set, get) => ({
      characterId: '',
      name: '',
      gender: 'male',
      race: 'human',
      background: 'commoner',
      raceOrigin: '',
      age: 0,
      characterBase: initialCharacterBase(),
      destinyPatterns: initialDestinyPatterns(),
      lifespanDraft: initialLifespanDraft(),
      talents: [],
      equippedReincarnationTalents: [],
      worldCode: 0,
      destinyPoolCacheKey: destinyPoolCacheKey(0),
      talentPoolCacheKey: talentPoolCacheKey(0),

      getSummary: () => {
        const state = get()
        return {
          name: state.name,
          gender: state.gender,
          age: state.age,
          startingAge: state.characterBase.startingAge,
          base: state.characterBase,
          destinyPatterns: state.destinyPatterns,
          status: state.characterBase.status,
        }
      },

      ensureCharacterId: () => {
        const existing = get().characterId
        if (existing) return existing
        const characterId = createGlobalCharacterId()
        set({ characterId })
        return characterId
      },

      setName: (name) => set((state) => ({
        name,
        characterId: state.characterId || createGlobalCharacterId(),
      })),
      setGender: (gender) => set({ gender }),
      setAge: (age) => set((state) => ({
        age,
        destinyPatterns: sanitizeDestinyPatternState(state.destinyPatterns, age),
      })),
      setRace: (race) => set({ race }),
      setBackground: (background) => set({ background }),
      setRaceOrigin: (raceOrigin) => set({ raceOrigin }),
      setCharacterBase: (partial) => set((state) => ({ characterBase: { ...state.characterBase, ...partial } })),
      setDestinyPatterns: (partial) => set((state) => {
        const destinyPatterns = sanitizeDestinyPatternState(
          { ...state.destinyPatterns, ...partial },
          state.age,
        )
        assertPatternLoadout(destinyPatterns.patterns, state.equippedReincarnationTalents)
        return { destinyPatterns }
      }),
      setLifespanDraft: (lifespanDraft) => set({ lifespanDraft: structuredClone(lifespanDraft) }),
      setTalents: (talents) => set({ talents }),
      setEquippedReincarnationTalents: (talents) => set((state) => {
        const equippedReincarnationTalents = normalizeEquippedReincarnationTalents(talents)
        assertPatternLoadout(state.destinyPatterns.patterns, equippedReincarnationTalents)
        return { equippedReincarnationTalents }
      }),
      setPatternLoadout: (patterns, reincarnationTalents, candidates) => set((state) => {
        const equippedReincarnationTalents = normalizeEquippedReincarnationTalents(reincarnationTalents)
        assertPatternLoadout(patterns, equippedReincarnationTalents, true)
        const rarityCount = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 } satisfies DestinyPatternState['rarityCount']
        for (const pattern of patterns) rarityCount[pattern.rarity]++
        return {
          characterBase: {
            ...initialCharacterBase(),
            startingAge: state.characterBase.startingAge,
          },
          destinyPatterns: {
            ...state.destinyPatterns,
            candidates: [...candidates],
            patterns: [...patterns],
            rarityCount,
            pendingGrowth: null,
            growthHistory: [],
          },
          equippedReincarnationTalents,
        }
      }),
      registerPendingDestinyPatternGrowth: (pending) => set((state) => ({
        destinyPatterns: registerPendingDestinyPatternGrowthInState(
          state.destinyPatterns,
          pending,
          state.age,
        ),
      })),
      resolvePendingDestinyPatternGrowth: (optionId) => {
        if (!isDestinyPatternGrowthAgeEligible(get().age)) {
          throw new Error('角色未满 16 岁，不能确认天赋成长')
        }
        const resolved = resolvePendingDestinyPatternGrowthInState(
          get().destinyPatterns,
          optionId,
        )
        set({ destinyPatterns: resolved.state })
        return resolved.historyEntry
      },
      setWorldCode: (code) => set({
        worldCode: code,
        destinyPoolCacheKey: destinyPoolCacheKey(code),
        talentPoolCacheKey: talentPoolCacheKey(code),
      }),

      reset: () => set({
        characterId: '',
        name: '',
        gender: 'male',
        race: 'human',
        background: 'commoner',
        raceOrigin: '',
        age: 0,
        characterBase: initialCharacterBase(),
        destinyPatterns: initialDestinyPatterns(),
        lifespanDraft: initialLifespanDraft(),
        talents: [],
        equippedReincarnationTalents: [],
      }),
    }),
    {
      name: 'mod-character:persist:character-state',
      version: 9,
      migrate: (persistedState: unknown) => {
        if (typeof persistedState !== 'object' || persistedState === null || Array.isArray(persistedState)) {
          console.warn('[CharacterStore] migrate: 数据格式异常，使用默认状态')
          return undefined as unknown as CharacterStore
        }
        return sanitizeCharacterStateSnapshot(persistedState) as unknown as CharacterStore
      },
      merge: (persistedState, currentState) => {
        if (
          typeof persistedState !== 'object'
          || persistedState === null
          || Array.isArray(persistedState)
        ) return currentState
        return {
          ...currentState,
          ...sanitizeCharacterStateSnapshot(persistedState),
        } as CharacterStore
      },
      partialize: (state) => {
        const {
          getSummary: _getSummary,
          ensureCharacterId: _ensureCharacterId,
          setName: _setName,
          setGender: _setGender,
          setAge: _setAge,
          setRace: _setRace,
          setBackground: _setBackground,
          setRaceOrigin: _setRaceOrigin,
          setCharacterBase: _setCharacterBase,
          setDestinyPatterns: _setDestinyPatterns,
          setLifespanDraft: _setLifespanDraft,
          setTalents: _setTalents,
          setEquippedReincarnationTalents: _setEquippedReincarnationTalents,
          setPatternLoadout: _setPatternLoadout,
          registerPendingDestinyPatternGrowth: _registerPendingDestinyPatternGrowth,
          resolvePendingDestinyPatternGrowth: _resolvePendingDestinyPatternGrowth,
          setWorldCode: _setWorldCode,
          reset: _reset,
          ...persisted
        } = state
        return persisted
      },
    },
  ),
)

export { useReincarnationLibraryStore } from './reincarnation-library-store'
