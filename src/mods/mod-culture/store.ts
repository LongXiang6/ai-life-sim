'use client'

/**
 * @module useCultureStore
 * @description mod-culture Zustand Store —— 10 状态分片
 * @mod mod-culture
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  ReputationState, RelationshipState, FamilyState,
  EducationState, CultureState, ArtState,
  DiscipleState, PersonalAbilityState, AchievementState, WorksState,
  CultureSummary,
} from './types'

import {
  DEFAULT_LITERACY_RATE, DEFAULT_EDUCATION_ACCESS, BASE_RESEARCH_OUTPUT,
  INITIAL_DISCIPLE_CAPACITY, BASE_SKILL_CAP,
  ACHIEVEMENT_TEMPLATES,
} from './constants'

// ─── 初始状态工厂 ───

function createInitialReputation(): ReputationState {
  const dims = ['military', 'political', 'academic', 'economic', 'moral', 'religious'] as const
  const dimensions = {} as ReputationState['dimensions']
  for (const d of dims) {
    dimensions[d] = { dimension: d, value: 0, source: '初始', lastChanged: '开局' }
  }
  return { dimensions, globalReputation: 0, fame: 0 }
}

function createInitialRelationship(): RelationshipState {
  return { relationships: {} }
}

function createInitialFamily(): FamilyState {
  return { familyName: '', familyReputation: 0, familyWealth: 0, members: [], history: [] }
}

function createInitialEducation(): EducationState {
  return {
    systemType: 'private',
    institutions: [],
    knowledgeTotal: 100,
    literacyRate: DEFAULT_LITERACY_RATE,
    educationAccess: DEFAULT_EDUCATION_ACCESS,
    researchOutput: BASE_RESEARCH_OUTPUT,
    knowledgeSpreadRate: 0.5,
    educationDirection: 'general',
    educationLevel: 'basic',
    literacyByClass: { elite: 80, middle: 40, common: 10 },
    worldview: '',
  }
}

function createInitialCulture(): CultureState {
  return {
    cultureName: '',
    traditionStrength: 50,
    reformResistance: 42,
    culturalInertia: 30,
    reformPressure: 10,
    values: { collectivism: 60, individualism: 20, hierarchy: 70, egalitarianism: 30, militarism: 40, pacifism: 30, spiritualism: 50, materialism: 40 },
    festivals: [],
    rituals: [],
    taboos: [],
    customs: [],
    notableEvents: [],
    artProsperity: 30,
  }
}

function createInitialArt(): ArtState {
  return { currentStyles: [], notableWorks: [], patronageLevel: 20, prestige: 10, innovationIndex: 5, worldview: '' }
}

function createInitialDisciple(): DiscipleState {
  return { disciples: [], maxCapacity: INITIAL_DISCIPLE_CAPACITY }
}

function createInitialPersonalAbility(): PersonalAbilityState {
  return { skills: {}, knowledge: {}, skillCap: BASE_SKILL_CAP, attributes: {} }
}

function createInitialAchievement(): AchievementState {
  return {
    achievements: ACHIEVEMENT_TEMPLATES.map((t) => ({
      id: t.id, name: t.name, description: t.description,
      unlocked: false, unlockedYear: 0, points: t.points,
      category: t.category as AchievementState['achievements'][0]['category'],
      rarity: t.rarity,
      icon: t.icon,
    })),
    totalPoints: 0,
  }
}

function createInitialWorks(): WorksState {
  return { works: [], nextId: 1 }
}

// ─── Store ───

interface CultureStore {
  reputation: ReputationState
  relationship: RelationshipState
  family: FamilyState
  education: EducationState
  culture: CultureState
  art: ArtState
  disciple: DiscipleState
  personalAbility: PersonalAbilityState
  achievement: AchievementState
  works: WorksState

  getSummary: () => CultureSummary

  setReputation: (s: Partial<ReputationState>) => void
  setRelationship: (s: Partial<RelationshipState>) => void
  setFamily: (s: Partial<FamilyState>) => void
  setEducation: (s: Partial<EducationState>) => void
  setCulture: (s: Partial<CultureState>) => void
  setArt: (s: Partial<ArtState>) => void
  setDisciple: (s: Partial<DiscipleState>) => void
  setPersonalAbility: (s: Partial<PersonalAbilityState>) => void
  setAchievement: (s: Partial<AchievementState>) => void
  setWorks: (s: Partial<WorksState>) => void

  reset: () => void
}

export const useCultureStore = create<CultureStore>()(
  persist(
    (set, get) => ({
      reputation: createInitialReputation(),
      relationship: createInitialRelationship(),
      family: createInitialFamily(),
      education: createInitialEducation(),
      culture: createInitialCulture(),
      art: createInitialArt(),
      disciple: createInitialDisciple(),
      personalAbility: createInitialPersonalAbility(),
      achievement: createInitialAchievement(),
      works: createInitialWorks(),

      getSummary: () => {
        const s = get()
        return {
          reputation: s.reputation,
          relationship: s.relationship,
          family: s.family,
          education: s.education,
          culture: s.culture,
          art: s.art,
          disciple: s.disciple,
          personalAbility: s.personalAbility,
          achievement: s.achievement,
          works: s.works,
        }
      },

      setReputation: (partial) => set((s) => ({ reputation: { ...s.reputation, ...partial } })),
      setRelationship: (partial) => set((s) => ({ relationship: { ...s.relationship, ...partial } })),
      setFamily: (partial) => set((s) => ({ family: { ...s.family, ...partial } })),
      setEducation: (partial) => set((s) => ({ education: { ...s.education, ...partial } })),
      setCulture: (partial) => set((s) => ({ culture: { ...s.culture, ...partial } })),
      setArt: (partial) => set((s) => ({ art: { ...s.art, ...partial } })),
      setDisciple: (partial) => set((s) => ({ disciple: { ...s.disciple, ...partial } })),
      setPersonalAbility: (partial) => set((s) => ({ personalAbility: { ...s.personalAbility, ...partial } })),
      setAchievement: (partial) => set((s) => ({ achievement: { ...s.achievement, ...partial } })),
      setWorks: (partial) => set((s) => ({ works: { ...s.works, ...partial } })),

      reset: () => set({
        reputation: createInitialReputation(),
        relationship: createInitialRelationship(),
        family: createInitialFamily(),
        education: createInitialEducation(),
        culture: createInitialCulture(),
        art: createInitialArt(),
        disciple: createInitialDisciple(),
        personalAbility: createInitialPersonalAbility(),
        achievement: createInitialAchievement(),
        works: createInitialWorks(),
      }),
    }),
    {
      name: 'mod-culture:persist:culture-state',
      version: 1,
      migrate: (persistedState: unknown, _version: number) => persistedState as CultureStore,
      partialize: (state) => {
        const { getSummary: _a, setReputation: _b, setRelationship: _c, setFamily: _d, setEducation: _e, setCulture: _f, setArt: _g, setDisciple: _h, setPersonalAbility: _i, setAchievement: _j, setWorks: _k, reset: _l, ...rest } = state
        return rest
      },
    },
  ),
)
