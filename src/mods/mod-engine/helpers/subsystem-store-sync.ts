/**
 * @module subsystem-store-sync.ts
 * @description 将 orchestrator 子系统快照同步到各 MOD UI store
 * @mod mod-engine
 */

import type {
  EntityLifecycleState,
  HealthCondition,
  DeathOutcome,
  LifespanAdjustment,
  LifespanRuleProfile,
  LifecycleStageDefinition,
  SubSystemState,
} from '@/foundation'
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
  const lifespan = dataOf<{
    profile?: LifespanRuleProfile
    adjustments?: LifespanAdjustment[]
  }>(states, 'lifespan')
  const lifecycle = dataOf<{
    entity?: EntityLifecycleState
    currentStage?: LifecycleStageDefinition
  }>(states, 'lifecycle-system')
  const health = dataOf<{
    entityId?: string
    vitality?: number
    maxVitality?: number
    stamina?: number
    spirit?: number
    alive?: boolean
    conditions?: HealthCondition[]
    death?: DeathOutcome
  }>(states, 'health')
  const morality = dataOf<Record<string, unknown>>(states, 'morality')
  if (characterBase || destinyPatterns || lifespan?.profile || lifecycle?.entity || health || morality) {
    useCharacterStore.setState((prev) => ({
      characterBase: characterBase ? { ...prev.characterBase, ...characterBase } : prev.characterBase,
      destinyPatterns: destinyPatterns ? { ...prev.destinyPatterns, ...destinyPatterns } : prev.destinyPatterns,
      lifespan: lifespan?.profile
        ? {
            entityId: lifespan.profile.entityId,
            raceId: lifespan.profile.raceId,
            displayName: lifespan.profile.displayName,
            clockMode: lifespan.profile.clockMode,
            baseLifespanDays: lifespan.profile.baseLifespanDays,
            maximumLifespanDays: lifespan.profile.maximumLifespanDays,
            adjustments: structuredClone(lifespan.adjustments ?? []),
          }
        : prev.lifespan,
      lifecycle: lifecycle?.entity
        ? {
            entityId: lifecycle.entity.entityId,
            ageDays: lifecycle.entity.ageDays,
            ...(lifecycle.currentStage
              ? { currentStage: structuredClone(lifecycle.currentStage) }
              : {}),
          }
        : prev.lifecycle,
      health: health
        ? {
            ...prev.health,
            ...(health.entityId ? { entityId: health.entityId } : {}),
            ...(typeof health.vitality === 'number' ? { vitality: health.vitality } : {}),
            ...(typeof health.maxVitality === 'number' ? { maxVitality: health.maxVitality } : {}),
            ...(typeof health.stamina === 'number' ? { stamina: health.stamina } : {}),
            ...(typeof health.spirit === 'number' ? { spirit: health.spirit } : {}),
            ...(typeof health.alive === 'boolean' ? { alive: health.alive } : {}),
            conditions: structuredClone(health.conditions ?? []),
            ...(health.death ? { death: structuredClone(health.death) } : { death: undefined }),
          }
        : prev.health,
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
  const divineIntervention = dataOf<Record<string, unknown>>(states, 'divine-intervention')
  const anomaly = dataOf<Record<string, unknown>>(states, 'anomaly-phenomena')
  if (combatPower || monster || luck || cultivation || fortuneEncounter || faith || divineIntervention || anomaly) {
    usePowerSystemStore.setState((prev) => ({
      combatPower: combatPower ? structuredClone(combatPower) as unknown as typeof prev.combatPower : prev.combatPower,
      monster: monster ? structuredClone(monster) as unknown as typeof prev.monster : prev.monster,
      luck: luck ? structuredClone(luck) as unknown as typeof prev.luck : prev.luck,
      cultivation: cultivation ? structuredClone(cultivation) as unknown as typeof prev.cultivation : prev.cultivation,
      fortuneEncounter: fortuneEncounter ? structuredClone(fortuneEncounter) as unknown as typeof prev.fortuneEncounter : prev.fortuneEncounter,
      faith: faith ? structuredClone(faith) as unknown as typeof prev.faith : prev.faith,
      divineIntervention: divineIntervention ? structuredClone(divineIntervention) as unknown as typeof prev.divineIntervention : prev.divineIntervention,
      anomaly: anomaly ? structuredClone(anomaly) as unknown as typeof prev.anomaly : prev.anomaly,
    }))
  }

  const socialStratification = dataOf<Record<string, unknown>>(states, 'social-stratification')
  const faction = dataOf<Record<string, unknown>>(states, 'faction-dynamics')
  const legal = dataOf<Record<string, unknown>>(states, 'legal')
  const conflictCycle = dataOf<Record<string, unknown>>(states, 'conflict-cycle')
  if (socialStratification || faction || legal || conflictCycle) {
    usePoliticsStore.setState((prev) => ({
      socialStratification: socialStratification ? { ...prev.socialStratification, ...socialStratification } : prev.socialStratification,
      faction: faction ? { ...prev.faction, ...faction } : prev.faction,
      legal: legal ? { ...prev.legal, ...legal } : prev.legal,
      conflictCycle: conflictCycle ? { ...prev.conflictCycle, ...conflictCycle } : prev.conflictCycle,
    }))
  }
}
