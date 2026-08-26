/**
 * Purpose: Project culture and technology state for UI consumers.
 * Owner: mod-tech-level
 * Responsibility: Readable UI projection only; technology calculations remain in the subsystem.
 */

'use client'
import { create } from 'zustand'
import type { CultureTechState, TechLevelSummary } from './types'

const initialCultureTech: CultureTechState = { contextId: '', researchCapacity: 0, domains: [], activeTrends: [], knowledgeBonus: 0, workQualityBonus: 0, lastUpdateBasePoints: 0, lastUpdateTotalDays: 0, activeEvents: [] }
interface TechLevelStore extends TechLevelSummary { getSummary: () => TechLevelSummary; reset: () => void }
export const useTechLevelStore = create<TechLevelStore>((set, get) => ({
  cultureTech: structuredClone(initialCultureTech),
  getSummary: () => ({ cultureTech: get().cultureTech }),
  reset: () => set({ cultureTech: structuredClone(initialCultureTech) }),
}))
