'use client'

/**
 * @module usePoliticsStore
 * @description mod-politics Zustand Store —— 7 状态分片
 * @mod mod-politics
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  SocialStratificationState,
  FactionState,
  NationRelationState,
  LegalState,
  ConflictCycleState,
  LanguageNamingState,
  SocialValuesState,
  PoliticsSummary,
} from './types'

import {
  STRATUM_LABELS_DEFAULT,
  STRATUM_POPULATION_DEFAULT,
  SOCIAL_MOBILITY_BASE,
} from './constants'

// ─── 初始状态工厂 ───

function createInitialSocialStratification(): SocialStratificationState {
  return {
    playerStratum: 'commoner',
    socialMobility: SOCIAL_MOBILITY_BASE,
    stratumPopulation: { ...STRATUM_POPULATION_DEFAULT },
    nobleHouses: [],
    stratumLabels: { ...STRATUM_LABELS_DEFAULT },
    playerClassState: { currentTier: 'commoner', targetTier: 'commoner', roundsAtTarget: 0, isUpwardMobile: false },
    playerWealthSnapshot: 100,
  }
}

function createInitialFaction(): FactionState {
  return { factions: [], playerFactionId: null, playerContribution: 0, playerRank: 0 }
}

function createInitialNationRelation(): NationRelationState {
  return { relations: [] }
}

function createInitialLegal(): LegalState {
  return { systemType: 'customary', laws: [], enforcementLevel: 50, corruption: 30 }
}

function createInitialConflictCycle(): ConflictCycleState {
  return { enabled: false, currentPhase: 'peace', phaseProgress: 0, history: [], currentTheme: '', tension: 0, comboCount: 0, pendingHumiliation: 0, antagonist: null, antagonistPool: [] }
}

function createInitialLanguageNaming(): LanguageNamingState {
  return { dominantLanguage: '通用语', languageVariants: [], namePrefixes: [], nameInfixes: [], nameSuffixes: [], specialRules: {}, profiles: [] }
}

function createInitialSocialValues(): SocialValuesState {
  return { values: [], generationalShiftRate: 0.5, dominantValue: '', valueShiftProgress: 0 }
}

// ─── Store ───

interface PoliticsStore {
  socialStratification: SocialStratificationState
  faction: FactionState
  nationRelation: NationRelationState
  legal: LegalState
  conflictCycle: ConflictCycleState
  languageNaming: LanguageNamingState
  socialValues: SocialValuesState

  getSummary: () => PoliticsSummary

  setSocialStratification: (s: Partial<SocialStratificationState>) => void
  setFaction: (s: Partial<FactionState>) => void
  setNationRelation: (s: Partial<NationRelationState>) => void
  setLegal: (s: Partial<LegalState>) => void
  setConflictCycle: (s: Partial<ConflictCycleState>) => void
  setLanguageNaming: (s: Partial<LanguageNamingState>) => void
  setSocialValues: (s: Partial<SocialValuesState>) => void

  reset: () => void
}

export const usePoliticsStore = create<PoliticsStore>()(
  persist(
    (set, get) => ({
      socialStratification: createInitialSocialStratification(),
      faction: createInitialFaction(),
      nationRelation: createInitialNationRelation(),
      legal: createInitialLegal(),
      conflictCycle: createInitialConflictCycle(),
      languageNaming: createInitialLanguageNaming(),
      socialValues: createInitialSocialValues(),

      getSummary: () => {
        const s = get()
        return {
          socialStratification: s.socialStratification,
          faction: s.faction,
          nationRelation: s.nationRelation,
          legal: s.legal,
          conflictCycle: s.conflictCycle,
          languageNaming: s.languageNaming,
          socialValues: s.socialValues,
        }
      },

      setSocialStratification: (partial) => set((s) => ({ socialStratification: { ...s.socialStratification, ...partial } })),
      setFaction: (partial) => set((s) => ({ faction: { ...s.faction, ...partial } })),
      setNationRelation: (partial) => set((s) => ({ nationRelation: { ...s.nationRelation, ...partial } })),
      setLegal: (partial) => set((s) => ({ legal: { ...s.legal, ...partial } })),
      setConflictCycle: (partial) => set((s) => ({ conflictCycle: { ...s.conflictCycle, ...partial } })),
      setLanguageNaming: (partial) => set((s) => ({ languageNaming: { ...s.languageNaming, ...partial } })),
      setSocialValues: (partial) => set((s) => ({ socialValues: { ...s.socialValues, ...partial } })),

      reset: () => set({
        socialStratification: createInitialSocialStratification(),
        faction: createInitialFaction(),
        nationRelation: createInitialNationRelation(),
        legal: createInitialLegal(),
        conflictCycle: createInitialConflictCycle(),
        languageNaming: createInitialLanguageNaming(),
        socialValues: createInitialSocialValues(),
      }),
    }),
    {
      name: 'mod-politics:persist:politics-state',
      version: 1,
      migrate: (persistedState: unknown, _version: number) => persistedState as PoliticsStore,
      partialize: (state) => {
        const { getSummary: _a, setSocialStratification: _b, setFaction: _c, setNationRelation: _d, setLegal: _e, setConflictCycle: _f, setLanguageNaming: _g, setSocialValues: _h, reset: _i, ...rest } = state
        return rest
      },
    },
  ),
)
