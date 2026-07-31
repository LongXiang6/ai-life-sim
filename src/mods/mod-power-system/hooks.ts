'use client'

import { usePowerSystemStore } from './store'

export const useCombatPower = () => usePowerSystemStore((s) => s.combatPower)
export const useMonsterRegion = () => usePowerSystemStore((s) => s.monster)
export const useLuck = () => usePowerSystemStore((s) => s.luck)
export const useCultivation = () => usePowerSystemStore((s) => s.cultivation)
export const useFortuneEncounter = () => usePowerSystemStore((s) => s.fortuneEncounter)
export const useFaith = () => usePowerSystemStore((s) => s.faith)
export const useDivineIntervention = () => usePowerSystemStore((s) => s.divineIntervention)
export const useAnomalyPhenomena = () => usePowerSystemStore((s) => s.anomaly)
