'use client'

/** Read model for the currently collected culture context. */
import { create } from 'zustand'
import type { ArtState, CultureState, CultureSummary, EducationState, WorksState } from './types'

const education: EducationState = {
  contextId: '', systemType: 'oral', institutions: [], literacyRate: 0, educationAccess: 0,
  researchCapacity: 0, knowledgeSpreadRate: 0, educationDirection: 'general', educationLevel: 'none',
  literacyByClass: { elite: 0, middle: 0, common: 0 }, worldview: '', updatedAtTotalDays: 0,
}
const culture: CultureState = {
  contextId: '', cultureName: '', traditionStrength: 50, reformResistance: 40, culturalInertia: 50,
  reformPressure: 0, values: { collectivism: 50, individualism: 50, hierarchy: 50, egalitarianism: 50,
    militarism: 50, pacifism: 50, spiritualism: 50, materialism: 50 }, festivals: [], rituals: [],
  taboos: [], customs: [], notableEvents: [], artProsperity: 30, updatedAtTotalDays: 0,
}
const art: ArtState = { contextId: '', currentStyles: [], patronageLevel: 20, prestige: 10, innovationIndex: 5, worldview: '', updatedAtTotalDays: 0 }
const works: WorksState = { contextId: '', works: [], nextId: 1, updatedAtTotalDays: 0 }

interface CultureStore extends CultureSummary {
  getSummary: () => CultureSummary
  reset: () => void
}

export const useCultureStore = create<CultureStore>((set, get) => ({
  education: structuredClone(education), culture: structuredClone(culture), art: structuredClone(art), works: structuredClone(works),
  getSummary: () => ({ education: get().education, culture: get().culture, art: get().art, works: get().works }),
  reset: () => set({ education: structuredClone(education), culture: structuredClone(culture), art: structuredClone(art), works: structuredClone(works) }),
}))
