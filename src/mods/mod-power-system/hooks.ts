'use client'

import { usePowerSystemStore } from './store'

export const useCombatPower = () => usePowerSystemStore((s) => s.combatPower)
export const useCultivation = () => usePowerSystemStore((s) => s.cultivation)
