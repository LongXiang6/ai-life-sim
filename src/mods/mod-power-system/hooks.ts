'use client'

/**
 * @module usePowerSystemHooks
 * @description mod-power-system 自定义 Hook
 * @mod mod-power-system
 */

import { usePowerSystemStore } from './store'

export function useCombatPower() {
  return usePowerSystemStore((s) => s.combatPower)
}

export function useMonsterRegion() {
  return usePowerSystemStore((s) => s.monster)
}

export function useLuck() {
  return usePowerSystemStore((s) => s.luck)
}

export function useCultivation() {
  return usePowerSystemStore((s) => s.cultivation)
}

export function useFortuneEncounter() {
  return usePowerSystemStore((s) => s.fortuneEncounter)
}

export function useFaith() {
  return usePowerSystemStore((s) => s.faith)
}

export function useSupremeItem() {
  return usePowerSystemStore((s) => s.supremeItem)
}

export function useDivineIntervention() {
  return usePowerSystemStore((s) => s.divineIntervention)
}

export function useAnomalyPhenomena() {
  return usePowerSystemStore((s) => ({
    zones: s.anomalyZones,
    globalInstability: s.anomalyGlobalInstability,
  }))
}

export function useSpecialMaterial() {
  return usePowerSystemStore((s) => ({
    materials: s.materials,
    activeCategory: s.materialActiveCategory,
  }))
}

export function useSkills() {
  return usePowerSystemStore((s) => ({
    skills: s.skills,
    lastAcquiredSkillId: s.lastAcquiredSkillId,
  }))
}
