/**
 * Purpose: Project power-system state for UI consumers.
 * Owner: mod-power-system
 * Responsibility: Readable UI projection only; runtime calculations and persistence remain in subsystems.
 */

'use client'

/** Current-context UI projection. Runtime persistence belongs to owning subsystems. */
import { create } from 'zustand'
import type {
  CombatPowerState,
  CultivationState,
  PowerSystemSummary,
} from './types'

const emptyFramework = { id: 'none', label: '未启用力量体系', enabled: false, ranks: [], progression: 'bounded' as const, source: 'world-default' as const }
const initialCombatPower: CombatPowerState = { contextId: '', characterId: '', initialized: false, framework: emptyFramework, rankId: '', rankIndex: 0, rankLabel: '', subStage: 1, progress: 0, insightBasePointsRemaining: 0, insightDaysRemaining: 0, updatedAtBasePoints: 0, stageNames: {}, updatedAtTotalDays: 0 }
const initialCultivation: CultivationState = { contextId: '', characterId: '', enabled: false, talentTags: [], realmIndex: 0, realmLabel: '凡人', realmId: 'mortal', bottleneckPenalty: 0, breakthroughChance: 1, anticipation: 0, bottleneckHint: '', trainingBonus: 1, lastBreakthroughAtBasePoints: 0, updatedAtBasePoints: 0, lastBreakthroughAtTotalDays: 0, updatedAtTotalDays: 0 }
interface PowerSystemStore extends PowerSystemSummary {
  getSummary: () => PowerSystemSummary
  setCombatPower: (state: CombatPowerState) => void
  setCultivation: (state: CultivationState) => void
  reset: () => void
}

export const usePowerSystemStore = create<PowerSystemStore>((set, get) => ({
  combatPower: structuredClone(initialCombatPower),
  cultivation: structuredClone(initialCultivation),
  getSummary: () => ({
    combatPower: get().combatPower,
    cultivation: get().cultivation,
  }),
  setCombatPower: (state) => set({ combatPower: structuredClone(state) }),
  setCultivation: (state) => set({ cultivation: structuredClone(state) }),
  reset: () => set({
    combatPower: structuredClone(initialCombatPower),
    cultivation: structuredClone(initialCultivation),
  }),
}))
