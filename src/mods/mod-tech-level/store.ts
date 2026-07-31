'use client'
import { create } from 'zustand'
import type { CultureTechState, TechLevelSummary } from './types'

const initialCultureTech: CultureTechState = { contextId: '', researchCapacity: 0, domains: [], activeTrends: [], knowledgeBonus: 0, workQualityBonus: 0, lastUpdateTotalDays: 0, activeEvents: [] }
interface TechLevelStore extends TechLevelSummary { getSummary: () => TechLevelSummary; reset: () => void }
export const useTechLevelStore = create<TechLevelStore>((set, get) => ({
  cultureTech: structuredClone(initialCultureTech),
  getSummary: () => ({ cultureTech: get().cultureTech }),
  reset: () => set({ cultureTech: structuredClone(initialCultureTech) }),
}))
