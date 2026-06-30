'use client'

/**
 * @module usePowerSystemStore
 * @description mod-power-system Zustand Store —— 10 子系统状态聚合
 * @mod mod-power-system
 */

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type {
  CombatPowerState,
  MonsterState,
  LuckState,
  CultivationState,
  FortuneEncounterState,
  FaithState,
  SupremeItemState,
  DivineInterventionState,
  AnomalyZone,
  SpecialMaterial,
  MaterialCategory,
  DynamicSkill,
  PowerSystemSummary,
} from './types'

interface PowerSystemStore {
  combatPower: CombatPowerState
  monster: MonsterState
  luck: LuckState
  cultivation: CultivationState
  fortuneEncounter: FortuneEncounterState
  faith: FaithState
  supremeItem: SupremeItemState
  divineIntervention: DivineInterventionState
  anomalyZones: AnomalyZone[]
  anomalyGlobalInstability: number
  materials: SpecialMaterial[]
  materialActiveCategory: MaterialCategory
  /** 技能系统 —— AI 动态生成的技能列表 */
  skills: DynamicSkill[]
  /** 最近获得的技能 ID */
  lastAcquiredSkillId: string | null

  getSummary: () => PowerSystemSummary

  setCombatPower: (state: Partial<CombatPowerState>) => void
  setMonster: (state: Partial<MonsterState>) => void
  setLuck: (state: Partial<LuckState>) => void
  setCultivation: (state: Partial<CultivationState>) => void
  setFortuneEncounter: (state: Partial<FortuneEncounterState>) => void
  setFaith: (state: Partial<FaithState>) => void
  setSupremeItem: (state: Partial<SupremeItemState>) => void
  setDivineIntervention: (state: Partial<DivineInterventionState>) => void
  setAnomalyZones: (zones: AnomalyZone[]) => void
  setAnomalyGlobalInstability: (value: number) => void
  setMaterials: (materials: SpecialMaterial[]) => void
  setMaterialActiveCategory: (category: MaterialCategory) => void
  /** 设置技能列表 */
  setSkills: (skills: DynamicSkill[]) => void
  /** 添加技能 */
  addSkill: (skill: DynamicSkill) => void
  /** 移除技能 */
  removeSkill: (skillId: string) => void

  reset: () => void,
}

const initialCombatPower: CombatPowerState = {
  initialized: false,
  mainStage: 1,
  subStage: 1,
  powerValue: 1,
  combatSkills: {},
  powerCeiling: 24,
  powerCeilingLabel: '24阶',
  insightRemaining: 0,
  stageNames: {},
}

const initialMonster: MonsterState = {
  initialized: false,
  enabled: false,
  regionalThreat: {},
  monsterTypes: [],
  spawnFrequency: 0,
  populationThreatDirection: 'repel',
}

const initialLuck: LuckState = {
  luck: 0,
  modifiers: {
    diseaseAvoidance: 0,
    deathAvoidChance: 0,
    eventWeightBias: 0,
    ageDecayModifier: 0,
  },
  luckNotificationRounds: 0,
  luckNotificationText: '',
}

const initialCultivation: CultivationState = {
  enabled: false,
  worldview: undefined,
  talentTags: [],
  realmIndex: 0,
  realmLabel: '凡人',
  realmId: 'mortal',
  bottleneckPenalty: 0,
  breakthroughChance: 1,
  anticipation: 0,
  bottleneckHint: '',
  trainingBonus: 1,
  lastBreakthroughYear: 0,
}

const initialFortuneEncounter: FortuneEncounterState = {
  initialized: false,
  cooldownRounds: 0,
  lastTriggerEraYear: 0,
  totalEncounters: 0,
  activeEncounter: null,
  lastEncounterId: null,
}

const initialFaith: FaithState = {
  faithName: null,
  devotionLevel: 0,
  yearsInFaith: 0,
}

const initialSupremeItem: SupremeItemState = {
  initialized: false,
  items: [],
}

const initialDivineIntervention: DivineInterventionState = {
  initialized: false,
  enabled: false,
  activeOracles: [],
  activeMiracles: [],
  miracleCooldownTurns: 0,
  severity: 0,
  chosenOnes: [],
}

export const usePowerSystemStore = create<PowerSystemStore>()(
  persist(
    (set, get,) => ({
  combatPower: initialCombatPower,
  monster: initialMonster,
  luck: initialLuck,
  cultivation: initialCultivation,
  fortuneEncounter: initialFortuneEncounter,
  faith: initialFaith,
  supremeItem: initialSupremeItem,
  divineIntervention: initialDivineIntervention,
  anomalyZones: [],
  anomalyGlobalInstability: 0,
  materials: [],
  materialActiveCategory: 'cultivation',
  skills: [],
  lastAcquiredSkillId: null,

  getSummary: () => {
    const s = get()
    return {
      combatPower: s.combatPower,
      monster: s.monster,
      luck: s.luck,
      cultivation: s.cultivation,
      fortuneEncounter: s.fortuneEncounter,
      faith: s.faith,
      supremeItem: s.supremeItem,
      divineIntervention: s.divineIntervention,
      anomalyZones: s.anomalyZones,
      anomalyGlobalInstability: s.anomalyGlobalInstability,
      materials: s.materials,
      materialActiveCategory: s.materialActiveCategory,
    }
  },

  setCombatPower: (partial,) => set((s,) => ({ combatPower: { ...s.combatPower, ...partial, }, }),),
  setMonster: (partial,) => set((s,) => ({ monster: { ...s.monster, ...partial, }, }),),
  setLuck: (partial,) => set((s,) => ({ luck: { ...s.luck, ...partial, }, }),),
  setCultivation: (partial,) => set((s,) => ({ cultivation: { ...s.cultivation, ...partial, }, }),),
  setFortuneEncounter: (partial,) => set((s,) => ({ fortuneEncounter: { ...s.fortuneEncounter, ...partial, }, }),),
  setFaith: (partial,) => set((s,) => ({ faith: { ...s.faith, ...partial, }, }),),
  setSupremeItem: (partial,) => set((s,) => ({ supremeItem: { ...s.supremeItem, ...partial, }, }),),
  setDivineIntervention: (partial,) => set((s,) => ({ divineIntervention: { ...s.divineIntervention, ...partial, }, }),),
  setAnomalyZones: (zones,) => set({ anomalyZones: zones, },),
  setAnomalyGlobalInstability: (value,) => set({ anomalyGlobalInstability: value, },),
  setMaterials: (materials,) => set({ materials, },),
  setMaterialActiveCategory: (category,) => set({ materialActiveCategory: category, },),

  setSkills: (skills,) => set({ skills, },),

  addSkill: (skill,) => set((s,) => {
    const exists = s.skills.some((sk) => sk.id === skill.id || sk.name === skill.name)
    if (exists) return s
    return {
      skills: [...s.skills, skill],
      lastAcquiredSkillId: skill.id,
    }
  },),

  removeSkill: (skillId,) => set((s,) => ({
    skills: s.skills.filter((sk) => sk.id !== skillId),
    lastAcquiredSkillId: s.lastAcquiredSkillId === skillId ? null : s.lastAcquiredSkillId,
  })),

  reset: () => set({
    combatPower: initialCombatPower,
    monster: initialMonster,
    luck: initialLuck,
    cultivation: initialCultivation,
    fortuneEncounter: initialFortuneEncounter,
    faith: initialFaith,
    supremeItem: initialSupremeItem,
    divineIntervention: initialDivineIntervention,
    anomalyZones: [],
    anomalyGlobalInstability: 0,
    materials: [],
    materialActiveCategory: 'cultivation',
    skills: [],
    lastAcquiredSkillId: null,
    }),
  }),
  {
    name: 'mod-power-system:persist:power-system-state',
    version: 1,
    migrate: (persistedState: unknown, _version: number) => persistedState as PowerSystemStore,
    partialize: (state,) => {
      const { getSummary: _a, setCombatPower: _b, setMonster: _c, setLuck: _d, setCultivation: _e, setFortuneEncounter: _f, setFaith: _g, setSupremeItem: _h, setDivineIntervention: _i, setAnomalyZones: _j, setAnomalyGlobalInstability: _k, setMaterials: _l, setMaterialActiveCategory: _m, setSkills: _n, addSkill: _o, removeSkill: _p, reset: _q, ...rest } = state
      return rest
    },
  },
  ),
)
