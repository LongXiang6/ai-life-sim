'use client'

/** Current-context UI projection. Runtime persistence belongs to owning subsystems. */
import { create } from 'zustand'
import type {
  AnomalyState,
  CombatPowerState,
  CultivationState,
  DivineInterventionState,
  FaithState,
  FortuneEncounterState,
  LuckState,
  MonsterState,
  PowerSystemSummary,
} from './types'

const emptyFramework = { id: 'none', label: '未启用力量体系', enabled: false, ranks: [], progression: 'bounded' as const, source: 'world-default' as const }
const initialCombatPower: CombatPowerState = { contextId: '', characterId: '', initialized: false, framework: emptyFramework, rankId: '', rankIndex: 0, rankLabel: '', subStage: 1, progress: 0, insightDaysRemaining: 0, stageNames: {}, updatedAtTotalDays: 0 }
const initialMonster: MonsterState = { contextId: '', initialized: false, enabled: false, speciesIds: [], habitatNodeIds: [], regionalThreat: {}, populationThreatDirection: 'repel', encounters: [], updatedAtTotalDays: 0 }
const initialLuck: LuckState = { contextId: '', luck: 0, modifiers: { diseaseAvoidance: 0, deathAvoidChance: 0, eventWeightBias: 0 }, luckNotificationRounds: 0, luckNotificationText: '', narrativeGuidance: null }
const initialCultivation: CultivationState = { contextId: '', characterId: '', enabled: false, talentTags: [], realmIndex: 0, realmLabel: '凡人', realmId: 'mortal', bottleneckPenalty: 0, breakthroughChance: 1, anticipation: 0, bottleneckHint: '', trainingBonus: 1, lastBreakthroughAtTotalDays: 0, updatedAtTotalDays: 0 }
const initialFortuneEncounter: FortuneEncounterState = { contextId: '', enabled: false, cooldownDays: 0, totalEncounters: 0, activeEncounter: null, lastEncounterId: null, lastCandidateAtTotalDays: 0, updatedAtTotalDays: 0 }
const initialFaith: FaithState = { contextId: '', subjectEntityId: '', beliefId: null, devotionLevel: 0, daysInFaith: 0, updatedAtTotalDays: 0 }
const initialDivineIntervention: DivineInterventionState = { contextId: '', enabled: false, activeOracles: [], activeMiracles: [], chosenEntityIds: [], severity: 0, updatedAtTotalDays: 0 }
const initialAnomaly: AnomalyState = { contextId: '', enabled: false, zones: [], globalInstability: 0, updatedAtTotalDays: 0 }

interface PowerSystemStore extends PowerSystemSummary {
  getSummary: () => PowerSystemSummary
  setCombatPower: (state: CombatPowerState) => void
  setMonster: (state: MonsterState) => void
  setLuck: (state: LuckState) => void
  setCultivation: (state: CultivationState) => void
  setFortuneEncounter: (state: FortuneEncounterState) => void
  setFaith: (state: FaithState) => void
  setDivineIntervention: (state: DivineInterventionState) => void
  setAnomaly: (state: AnomalyState) => void
  reset: () => void
}

export const usePowerSystemStore = create<PowerSystemStore>((set, get) => ({
  combatPower: structuredClone(initialCombatPower),
  monster: structuredClone(initialMonster),
  luck: structuredClone(initialLuck),
  cultivation: structuredClone(initialCultivation),
  fortuneEncounter: structuredClone(initialFortuneEncounter),
  faith: structuredClone(initialFaith),
  divineIntervention: structuredClone(initialDivineIntervention),
  anomaly: structuredClone(initialAnomaly),
  getSummary: () => ({
    combatPower: get().combatPower,
    monster: get().monster,
    luck: get().luck,
    cultivation: get().cultivation,
    fortuneEncounter: get().fortuneEncounter,
    faith: get().faith,
    divineIntervention: get().divineIntervention,
    anomaly: get().anomaly,
  }),
  setCombatPower: (state) => set({ combatPower: structuredClone(state) }),
  setMonster: (state) => set({ monster: structuredClone(state) }),
  setLuck: (state) => set({ luck: structuredClone(state) }),
  setCultivation: (state) => set({ cultivation: structuredClone(state) }),
  setFortuneEncounter: (state) => set({ fortuneEncounter: structuredClone(state) }),
  setFaith: (state) => set({ faith: structuredClone(state) }),
  setDivineIntervention: (state) => set({ divineIntervention: structuredClone(state) }),
  setAnomaly: (state) => set({ anomaly: structuredClone(state) }),
  reset: () => set({
    combatPower: structuredClone(initialCombatPower),
    monster: structuredClone(initialMonster),
    luck: structuredClone(initialLuck),
    cultivation: structuredClone(initialCultivation),
    fortuneEncounter: structuredClone(initialFortuneEncounter),
    faith: structuredClone(initialFaith),
    divineIntervention: structuredClone(initialDivineIntervention),
    anomaly: structuredClone(initialAnomaly),
  }),
}))
