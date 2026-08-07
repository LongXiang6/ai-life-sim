'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { TalentPreset } from './prompts/talent-presets'
import type {
  CharacterBaseState,
  CharacterSummary,
  DestinyPatternState,
  LifespanDraftState,
  MythicPattern,
  MythicPatternCandidate,
} from './types'
import {
  MYTHIC_PATTERN_SELECT_COUNT,
  RACE_LIFESPAN,
} from './constants'
import {
  createGlobalCharacterId,
  sanitizeCharacterStateSnapshot,
} from './utils/character-state-migration'

function destinyPoolCacheKey(worldCode: number): string {
  return `mod-character:destiny-pool:${worldCode}`
}

function talentPoolCacheKey(worldCode: number): string {
  return `mod-character:talent-pool:${worldCode}`
}

function normalizeEquippedMythicPatterns(patterns: readonly MythicPattern[]): MythicPattern[] {
  const seen = new Set<string>()
  return patterns.filter((pattern) => {
    if (!pattern || seen.has(pattern.id)) return false
    seen.add(pattern.id)
    return true
  }).slice(0, MYTHIC_PATTERN_SELECT_COUNT)
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
  rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 },
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
  mythicCandidates: MythicPatternCandidate[]
  equippedMythicPatterns: MythicPattern[]
  sealedMythicPatternId: string | null

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
  setMythicCandidates: (patterns: MythicPatternCandidate[]) => void
  setEquippedMythicPatterns: (patterns: MythicPattern[]) => void
  setSealedMythicPatternId: (id: string | null) => void
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
      mythicCandidates: [],
      equippedMythicPatterns: [],
      sealedMythicPatternId: null,
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
      setAge: (age) => set({ age }),
      setRace: (race) => set({ race }),
      setBackground: (background) => set({ background }),
      setRaceOrigin: (raceOrigin) => set({ raceOrigin }),
      setCharacterBase: (partial) => set((state) => ({ characterBase: { ...state.characterBase, ...partial } })),
      setDestinyPatterns: (partial) => set((state) => ({ destinyPatterns: { ...state.destinyPatterns, ...partial } })),
      setLifespanDraft: (lifespanDraft) => set({ lifespanDraft: structuredClone(lifespanDraft) }),
      setTalents: (talents) => set({ talents }),
      setMythicCandidates: (mythicCandidates) => set({ mythicCandidates, sealedMythicPatternId: null }),
      setEquippedMythicPatterns: (equippedMythicPatterns) => set({
        equippedMythicPatterns: normalizeEquippedMythicPatterns(equippedMythicPatterns),
      }),
      setSealedMythicPatternId: (sealedMythicPatternId) => set({ sealedMythicPatternId }),
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
        mythicCandidates: [],
        equippedMythicPatterns: [],
        sealedMythicPatternId: null,
      }),
    }),
    {
      name: 'mod-character:persist:character-state',
      version: 6,
      migrate: (persistedState: unknown) => {
        if (typeof persistedState !== 'object' || persistedState === null || Array.isArray(persistedState)) {
          console.warn('[CharacterStore] migrate: 数据格式异常，使用默认状态')
          return undefined as unknown as CharacterStore
        }
        return sanitizeCharacterStateSnapshot(persistedState) as unknown as CharacterStore
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
          setMythicCandidates: _setMythicCandidates,
          setEquippedMythicPatterns: _setEquippedMythicPatterns,
          setSealedMythicPatternId: _setSealedMythicPatternId,
          setWorldCode: _setWorldCode,
          reset: _reset,
          ...persisted
        } = state
        return persisted
      },
    },
  ),
)

export { useMythicLibraryStore } from './mythic-library-store'
