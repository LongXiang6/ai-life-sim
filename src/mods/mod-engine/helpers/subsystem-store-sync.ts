/**
 * Purpose: Project committed subsystem state into MOD-owned UI stores.
 * Owner: mod-engine
 * Responsibility: Store synchronization only; subsystem calculations and state ownership remain downstream.
 *
 * @module subsystem-store-sync.ts
 * @description 将 orchestrator 子系统快照同步到各 MOD UI store
 * @mod mod-engine
 */

import type {
  SubSystemState,
} from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { usePowerSystemStore } from '@/mods/mod-power-system'

function dataOf<T extends object>(states: Record<string, SubSystemState>, id: string): T | undefined {
  const data = states[id]?.data
  return data && typeof data === 'object' && !Array.isArray(data) ? structuredClone(data) as T : undefined
}

/** 将最近一轮收集到的子系统 private state 写回 UI store。 */
export function syncSubsystemStoresFromStates(states: Record<string, SubSystemState> | undefined): void {
  if (!states) return

  const characterBase = dataOf<Record<string, unknown>>(states, 'character-base')
  const destinyPatterns = dataOf<Record<string, unknown>>(states, 'destiny-pattern')
  if (characterBase || destinyPatterns) {
    useCharacterStore.setState((prev) => ({
      characterBase: characterBase ? { ...prev.characterBase, ...characterBase } : prev.characterBase,
      destinyPatterns: destinyPatterns ? { ...prev.destinyPatterns, ...destinyPatterns } : prev.destinyPatterns,
    }))
  }

  const combatPower = dataOf<Record<string, unknown>>(states, 'combat-power')
  const cultivation = dataOf<Record<string, unknown>>(states, 'cultivation')
  if (combatPower || cultivation) {
    usePowerSystemStore.setState((prev) => ({
      combatPower: combatPower ? structuredClone(combatPower) as unknown as typeof prev.combatPower : prev.combatPower,
      cultivation: cultivation ? structuredClone(cultivation) as unknown as typeof prev.cultivation : prev.cultivation,
    }))
  }
}
