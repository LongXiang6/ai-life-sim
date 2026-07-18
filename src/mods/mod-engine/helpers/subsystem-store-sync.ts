/**
 * @module subsystem-store-sync.ts
 * @description 将 orchestrator 子系统快照同步到各 MOD UI store
 * @mod mod-engine
 */

import type { SubSystemState } from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { useEconomyStore } from '@/mods/mod-economy'
import { usePoliticsStore } from '@/mods/mod-politics'
import { usePowerSystemStore } from '@/mods/mod-power-system'
import { useWorldStore } from '@/mods/mod-world'

function dataOf<T extends object>(states: Record<string, SubSystemState>, id: string): T | undefined {
  const data = states[id]?.data
  return data && typeof data === 'object' && !Array.isArray(data) ? structuredClone(data) as T : undefined
}

/** 将最近一轮收集到的子系统 private state 写回 UI store。 */
export function syncSubsystemStoresFromStates(states: Record<string, SubSystemState> | undefined): void {
  if (!states) return

  const characterBase = dataOf<Record<string, unknown>>(states, 'character-base')
  const destinyPatterns = dataOf<Record<string, unknown>>(states, 'destiny-pattern')
  const lifespan = dataOf<Record<string, unknown>>(states, 'lifespan')
  const morality = dataOf<Record<string, unknown>>(states, 'morality')
  if (characterBase || destinyPatterns || lifespan || morality) {
    useCharacterStore.setState((prev) => ({
      characterBase: characterBase ? { ...prev.characterBase, ...characterBase } : prev.characterBase,
      destinyPatterns: destinyPatterns ? { ...prev.destinyPatterns, ...destinyPatterns } : prev.destinyPatterns,
      lifespan: lifespan ? { ...prev.lifespan, ...lifespan } : prev.lifespan,
      morality: morality ? { ...prev.morality, ...morality } : prev.morality,
    }))
  }

  const worldEntity = dataOf<{ entities?: unknown[] }>(states, 'world-entity')
  if (Array.isArray(worldEntity?.entities)) {
    useWorldStore.setState({ entities: worldEntity.entities as ReturnType<typeof useWorldStore.getState>['entities'] })
  }

  const economy = dataOf<Record<string, unknown>>(states, 'economy')
  const settlement = dataOf<Record<string, unknown>>(states, 'settlement')
  const work = dataOf<Record<string, unknown>>(states, 'work')
  const item = dataOf<Record<string, unknown>>(states, 'item')
  const population = dataOf<Record<string, unknown>>(states, 'population')
  if (economy || settlement || work || item || population) {
    useEconomyStore.setState((prev) => ({
      economy: economy ? { ...prev.economy, ...economy } : prev.economy,
      settlement: settlement ? { ...prev.settlement, ...settlement } : prev.settlement,
      work: work ? { ...prev.work, ...work } : prev.work,
      item: item ? { ...prev.item, ...item } : prev.item,
      population: population ? { ...prev.population, ...population } : prev.population,
    }))
  }

  const combatPower = dataOf<Record<string, unknown>>(states, 'combat-power')
  const monster = dataOf<Record<string, unknown>>(states, 'monster')
  const luck = dataOf<Record<string, unknown>>(states, 'luck')
  const cultivation = dataOf<Record<string, unknown>>(states, 'cultivation')
  const fortuneEncounter = dataOf<Record<string, unknown>>(states, 'fortune-encounter')
  const faith = dataOf<Record<string, unknown>>(states, 'faith')
  const supremeItem = dataOf<Record<string, unknown>>(states, 'supreme-item')
  const divineIntervention = dataOf<Record<string, unknown>>(states, 'divine-intervention')
  const anomaly = dataOf<{ zones?: unknown[]; globalInstability?: number }>(states, 'anomaly-phenomena')
  const material = dataOf<{ materials?: unknown[]; activeCategory?: string }>(states, 'special-material')
  const skill = dataOf<{ skills?: unknown[]; lastAcquiredSkillId?: string | null }>(states, 'skill')
  if (combatPower || monster || luck || cultivation || fortuneEncounter || faith || supremeItem || divineIntervention || anomaly || material || skill) {
    usePowerSystemStore.setState((prev) => ({
      combatPower: combatPower ? { ...prev.combatPower, ...combatPower } : prev.combatPower,
      monster: monster ? { ...prev.monster, ...monster } : prev.monster,
      luck: luck ? { ...prev.luck, ...luck } : prev.luck,
      cultivation: cultivation ? { ...prev.cultivation, ...cultivation } : prev.cultivation,
      fortuneEncounter: fortuneEncounter ? { ...prev.fortuneEncounter, ...fortuneEncounter } : prev.fortuneEncounter,
      faith: faith ? { ...prev.faith, ...faith } : prev.faith,
      supremeItem: supremeItem ? { ...prev.supremeItem, ...supremeItem } : prev.supremeItem,
      divineIntervention: divineIntervention ? { ...prev.divineIntervention, ...divineIntervention } : prev.divineIntervention,
      anomalyZones: Array.isArray(anomaly?.zones) ? anomaly.zones as typeof prev.anomalyZones : prev.anomalyZones,
      anomalyGlobalInstability: typeof anomaly?.globalInstability === 'number' ? anomaly.globalInstability : prev.anomalyGlobalInstability,
      materials: Array.isArray(material?.materials) ? material.materials as typeof prev.materials : prev.materials,
      materialActiveCategory: typeof material?.activeCategory === 'string' ? material.activeCategory as typeof prev.materialActiveCategory : prev.materialActiveCategory,
      skills: Array.isArray(skill?.skills) ? skill.skills as typeof prev.skills : prev.skills,
      lastAcquiredSkillId: typeof skill?.lastAcquiredSkillId === 'string' || skill?.lastAcquiredSkillId === null ? skill.lastAcquiredSkillId : prev.lastAcquiredSkillId,
    }))
  }

  const socialStratification = dataOf<Record<string, unknown>>(states, 'social-stratification')
  const faction = dataOf<Record<string, unknown>>(states, 'faction-dynamics')
  const nationRelation = dataOf<Record<string, unknown>>(states, 'nation-relation')
  const legal = dataOf<Record<string, unknown>>(states, 'legal')
  const conflictCycle = dataOf<Record<string, unknown>>(states, 'conflict-cycle')
  const languageNaming = dataOf<Record<string, unknown>>(states, 'language-naming')
  const socialValues = dataOf<Record<string, unknown>>(states, 'social-values')
  if (socialStratification || faction || nationRelation || legal || conflictCycle || languageNaming || socialValues) {
    usePoliticsStore.setState((prev) => ({
      socialStratification: socialStratification ? { ...prev.socialStratification, ...socialStratification } : prev.socialStratification,
      faction: faction ? { ...prev.faction, ...faction } : prev.faction,
      nationRelation: nationRelation ? { ...prev.nationRelation, ...nationRelation } : prev.nationRelation,
      legal: legal ? { ...prev.legal, ...legal } : prev.legal,
      conflictCycle: conflictCycle ? { ...prev.conflictCycle, ...conflictCycle } : prev.conflictCycle,
      languageNaming: languageNaming ? { ...prev.languageNaming, ...languageNaming } : prev.languageNaming,
      socialValues: socialValues ? { ...prev.socialValues, ...socialValues } : prev.socialValues,
    }))
  }
}
