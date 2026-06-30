'use client'

/**
 * @module useTechLevelStore
 * @description mod-tech-level Zustand Store —— 产业/资源/文化技术 3 状态分片
 * @mod mod-tech-level
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type {
  IndustryState,
  ResourceDistributionState,
  CultureTechState,
  TechLevelSummary,
} from './types'

import { DEFAULT_TECH_LEVEL, } from './constants'

interface TechLevelStore {
  industry: IndustryState
  resourceDistribution: ResourceDistributionState
  cultureTech: CultureTechState

  getSummary: () => TechLevelSummary

  setIndustry: (state: Partial<IndustryState>) => void
  setResourceDistribution: (state: Partial<ResourceDistributionState>) => void
  setCultureTech: (state: Partial<CultureTechState>) => void

  reset: () => void,
}

const initialIndustry: IndustryState = {
  initialized: false,
  primaryFocus: 'agriculture',
  productivityMultiplier: 1,
  techAdoptionRate: 0.01,
}

const initialResourceDistribution: ResourceDistributionState = {
  initialized: false,
  regionalResources: {},
  globalScarcity: 0,
}

const initialCultureTech: CultureTechState = {
  techLevel: DEFAULT_TECH_LEVEL,
  techProgress: 0,
  activeTrends: [],
  knowledgeBonus: 0,
  workQualityBonus: 0,
  lastUpdateEraYear: 0,
  activeEvents: [],
}

export const useTechLevelStore = create<TechLevelStore>()(
  persist(
    (set, get,) => ({
  industry: initialIndustry,
  resourceDistribution: initialResourceDistribution,
  cultureTech: initialCultureTech,

  getSummary: () => {
    const s = get()
    return {
      industry: s.industry,
      resourceDistribution: s.resourceDistribution,
      cultureTech: s.cultureTech,
    }
  },

  setIndustry: (partial,) => set((s,) => ({ industry: { ...s.industry, ...partial, }, }),),
  setResourceDistribution: (partial,) => set((s,) => ({ resourceDistribution: { ...s.resourceDistribution, ...partial, }, }),),
  setCultureTech: (partial,) => set((s,) => ({ cultureTech: { ...s.cultureTech, ...partial, }, }),),

  reset: () => set({
    industry: initialIndustry,
    resourceDistribution: initialResourceDistribution,
    cultureTech: initialCultureTech,
    }),
  }),
  {
    name: 'mod-tech-level:persist:tech-level-state',
    version: 1,
    migrate: (persistedState: unknown, _version: number) => persistedState as TechLevelStore,
    partialize: (state,) => {
      const { getSummary: _a, setIndustry: _b, setResourceDistribution: _c, setCultureTech: _d, reset: _e, ...rest } = state
      return rest
    },
  },
  ),
)
