'use client'

/**
 * @module store.ts
 * @description 角色系统 Zustand Store
 * @mod mod-character
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type {
  CharacterBaseState,
  DestinyPatternState,
  HealthState,
  LifespanState,
  LifeStageState,
  AttributeDecayState,
  MoralityState,
  CharacterSummary,
  MythicPattern,
  MythicPatternCandidate,
} from './types'
import type { TalentPreset, } from './prompts/talent-presets'

import { DEFAULT_LIFE_STAGES, DEFAULT_STAGE_DISPLAY_NAMES, } from './constants'

import type { LifeStageId, LifeStageConfig, } from './types'
import { sanitizeCharacterStateSnapshot } from './utils/character-state-migration'

/** 天赋池缓存键（按世界编码隔离） */
function destinyPoolCacheKey(worldCode: number,): string {
  return `mod-character:destiny-pool:${worldCode}`
}

function talentPoolCacheKey(worldCode: number,): string {
  return `mod-character:talent-pool:${worldCode}`
}

function buildDefaultStages(): Record<LifeStageId, LifeStageConfig> {
  const stages = {} as Record<LifeStageId, LifeStageConfig>
  const ids: LifeStageId[] = ['infant', 'child', 'teenager', 'young_adult', 'adult', 'middle_age', 'elder', 'deceased',]
  for (const id of ids) {
    const def = DEFAULT_LIFE_STAGES[id]!
    stages[id] = {
      ...def,
      displayName: DEFAULT_STAGE_DISPLAY_NAMES[id] ?? id,
      eventPool: [],
      avoidancePool: [],
    }
  }
  return stages
}

interface CharacterStore {
  name: string
  gender: 'male' | 'female'
  /** 种族 key（对应 RACE_LIFESPAN 的 key） */
  race: string
  /** 背景 key */
  background: string
  /** 种族由来说明（AI 生成，非人类种族时填充） */
  raceOrigin: string
  age: number

  characterBase: CharacterBaseState
  destinyPatterns: DestinyPatternState
  health: HealthState
  lifespan: LifespanState
  lifeStage: LifeStageState
  decay: AttributeDecayState
  morality: MoralityState

  talents: TalentPreset[]

  /** 本局结算生成的三个神话词条候选。 */
  mythicCandidates: MythicPatternCandidate[]
  /** 本局从跨局总库选择携带的独立神话词条；可留空。 */
  equippedMythicPattern: MythicPattern | null
  /** 本局结算已封存到总库的神话词条 ID；用于防止重复入库。 */
  sealedMythicPatternId: string | null

  /** 当前世界编码（用于天赋池隔离） */
  worldCode: number
  /** 命格池缓存键（按世界编码隔离） */
  destinyPoolCacheKey: string
  /** 天赋池缓存键（按世界编码隔离） */
  talentPoolCacheKey: string

  getSummary: () => CharacterSummary

  setName: (name: string) => void
  setGender: (gender: 'male' | 'female') => void
  setAge: (age: number) => void
  setRace: (race: string) => void
  setBackground: (background: string) => void
  setRaceOrigin: (origin: string) => void
  setCharacterBase: (state: Partial<CharacterBaseState>) => void
  setDestinyPatterns: (state: Partial<DestinyPatternState>) => void
  setHealth: (state: Partial<HealthState>) => void
  setLifespan: (state: Partial<LifespanState>) => void
  setLifeStage: (state: Partial<LifeStageState>) => void
  setDecay: (state: Partial<AttributeDecayState>) => void
  setMorality: (state: Partial<MoralityState>) => void
  setTalents: (talents: TalentPreset[]) => void
  setMythicCandidates: (patterns: MythicPatternCandidate[]) => void
  setEquippedMythicPattern: (pattern: MythicPattern | null) => void
  setSealedMythicPatternId: (id: string | null) => void
  setWorldCode: (code: number) => void

  reset: () => void,
}

const initialCharacterBase: CharacterBaseState = {
  base: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, },
  current: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, },
  modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, },
  startingAge: 0,
}

const initialDestinyPatterns: DestinyPatternState = {
  candidates: [],
  patterns: [],
  rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, },
}

const initialHealth: HealthState = {
  hp: 100, maxHp: 100, stamina: 100, spirit: 80,
  diseases: [], injuries: [], isDead: false,
}

const initialLifespan: LifespanState = {
  maxAge: 100, baseMaxAge: 100,
  race: { name: '人类', baseMaxAge: 100, goldenAgeRatio: [0.18, 0.40,], decayMultiplier: 1.0, },
  breakthroughs: [], breakthroughChance: 0.30,
}

const initialLifeStage: LifeStageState = {
  currentStage: 'infant',
  stages: buildDefaultStages(),
  adapted: false,
}

const initialDecay: AttributeDecayState = {
  modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, },
  goldenAgeRange: [18, 40,], isDecaying: false, stageHint: '幼年',
}

const initialMorality: MoralityState = { value: 0, level: 'balanced', roundDelta: 0, }

export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set, get,) => ({
      name: '', gender: 'male', race: 'human', background: 'commoner', raceOrigin: '', age: 0,
      characterBase: initialCharacterBase,
      destinyPatterns: initialDestinyPatterns,
      health: initialHealth,
      lifespan: initialLifespan,
      lifeStage: initialLifeStage,
      decay: initialDecay,
      morality: initialMorality,
      talents: [],
      mythicCandidates: [],
      equippedMythicPattern: null,
      sealedMythicPatternId: null,
      worldCode: 0,
      destinyPoolCacheKey: destinyPoolCacheKey(0,),
      talentPoolCacheKey: talentPoolCacheKey(0,),

      getSummary: () => {
        const s = get()
        return {
          name: s.name,
          gender: s.gender,
          age: s.age,
          startingAge: s.characterBase.startingAge,
          base: s.characterBase,
          destinyPatterns: s.destinyPatterns,
          health: s.health,
          lifespan: s.lifespan,
          lifeStage: s.lifeStage,
          decay: s.decay,
          morality: s.morality,
        }
      },

      setName: (name,) => set({ name, },),
      setGender: (gender,) => set({ gender, },),
      setAge: (age,) => set({ age, },),
      setRace: (race,) => set({ race, },),
      setBackground: (background,) => set({ background, },),
      setRaceOrigin: (raceOrigin,) => set({ raceOrigin, },),
      setCharacterBase: (partial,) => set((s,) => ({ characterBase: { ...s.characterBase, ...partial, }, }),),
      setDestinyPatterns: (partial,) => set((s,) => ({ destinyPatterns: { ...s.destinyPatterns, ...partial, }, }),),
      setHealth: (partial,) => set((s,) => ({ health: { ...s.health, ...partial, }, }),),
      setLifespan: (partial,) => set((s,) => ({ lifespan: { ...s.lifespan, ...partial, }, }),),
      setLifeStage: (partial,) => set((s,) => ({ lifeStage: { ...s.lifeStage, ...partial, }, }),),
      setDecay: (partial,) => set((s,) => ({ decay: { ...s.decay, ...partial, }, }),),
      setMorality: (partial,) => set((s,) => ({ morality: { ...s.morality, ...partial, }, }),),
      setTalents: (talents,) => set({ talents, },),
      setMythicCandidates: (mythicCandidates,) => set({ mythicCandidates, sealedMythicPatternId: null, },),
      setEquippedMythicPattern: (equippedMythicPattern,) => set({ equippedMythicPattern, },),
      setSealedMythicPatternId: (sealedMythicPatternId,) => set({ sealedMythicPatternId, },),
      setWorldCode: (code,) => set({
        worldCode: code,
        destinyPoolCacheKey: destinyPoolCacheKey(code,),
        talentPoolCacheKey: talentPoolCacheKey(code,),
      },),

      reset: () => set({
        name: '', gender: 'male', race: 'human', background: 'commoner', raceOrigin: '', age: 0,
        characterBase: { ...initialCharacterBase, },
        destinyPatterns: initialDestinyPatterns,
        health: initialHealth,
        lifespan: initialLifespan,
        lifeStage: initialLifeStage,
        decay: initialDecay,
        morality: initialMorality,
        talents: [],
        mythicCandidates: [],
        equippedMythicPattern: null,
        sealedMythicPatternId: null,
      },),
    }),
    {
      name: 'mod-character:persist:character-state',
      version: 2,
      migrate: (persistedState: unknown, _version: number) => {
        // 结构完整性校验：防止损坏数据导致白屏
        if (typeof persistedState !== 'object' || persistedState === null || Array.isArray(persistedState)) {
          console.warn('[CharacterStore] migrate: 数据格式异常，使用默认状态')
          return undefined as unknown as CharacterStore
        }
        return sanitizeCharacterStateSnapshot(persistedState) as unknown as CharacterStore
      },
      partialize: (state,) => {
        const { getSummary: _a, setName: _b, setGender: _c, setAge: _d, setRace: _e, setBackground: _f, setRaceOrigin: _g, setCharacterBase: _h, setDestinyPatterns: _i, setHealth: _j, setLifespan: _k, setLifeStage: _l, setDecay: _m, setMorality: _n, setTalents: _o, setMythicCandidates: _p, setEquippedMythicPattern: _q, setSealedMythicPatternId: _r, setWorldCode: _s, reset: _t, ...rest } = state
        return rest
      },
    },
  ),
)

/** Manifest stores 统一从 store.ts 生成 wiring；跨局总库仍由独立文件持久化。 */
export { useMythicLibraryStore } from './mythic-library-store'
