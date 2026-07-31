/** P8 world-defined supernatural extension contracts. */

import type { LuckState, PowerFrameworkDefinition } from '@/foundation'

export type { PowerFrameworkDefinition, PowerRankDefinition } from '@/foundation'
export type {
  LuckNarrativeDirection,
  LuckNarrativeGuidance,
  LuckModifiers,
  LuckState,
  LuckPersistenceState,
} from '@/foundation'

export type SubStageIndex = 1 | 2 | 3 | 4 | 5

export interface CombatPowerState {
  contextId: string
  characterId: string
  initialized: boolean
  framework: PowerFrameworkDefinition
  rankId: string
  rankIndex: number
  rankLabel: string
  subStage: SubStageIndex
  progress: number
  insightDaysRemaining: number
  stageNames: Record<string, string>
  updatedAtTotalDays: number
}

export interface CombatPowerPersistenceState { schemaVersion: 1; contexts: Record<string, CombatPowerState> }

export type PopulationThreatDirection = 'repel' | 'attract'

export interface MonsterEncounterResult {
  id: string
  speciesId: string
  nodeId: string
  threatLevel: number
  occurredAtTotalDays: number
  evidenceEventIds: string[]
}

export interface MonsterState {
  contextId: string
  initialized: boolean
  enabled: boolean
  speciesIds: string[]
  habitatNodeIds: string[]
  regionalThreat: Record<string, number>
  populationThreatDirection: PopulationThreatDirection
  encounters: MonsterEncounterResult[]
  updatedAtTotalDays: number
}

export interface MonsterPersistenceState { schemaVersion: 1; contexts: Record<string, MonsterState> }

export type EncounterTier = 'legendary' | 'major' | 'minor'

export interface EncounterEvent {
  id: string
  tier: EncounterTier
  name: string
  description: string
  narrativeHint: string
  status: 'candidate' | 'accepted' | 'expired'
  createdAtTotalDays: number
  evidenceEventIds: string[]
}

export interface FortuneEncounterState {
  contextId: string
  enabled: boolean
  cooldownDays: number
  totalEncounters: number
  activeEncounter: EncounterEvent | null
  lastEncounterId: string | null
  lastCandidateAtTotalDays: number
  updatedAtTotalDays: number
}

export interface FortuneEncounterPersistenceState { schemaVersion: 1; contexts: Record<string, FortuneEncounterState> }

export interface FaithState {
  contextId: string
  subjectEntityId: string
  beliefId: string | null
  devotionLevel: number
  daysInFaith: number
  updatedAtTotalDays: number
}

export interface FaithPersistenceState { schemaVersion: 1; contexts: Record<string, FaithState> }

export interface OracleEntry {
  id: string
  deityId: string
  title: string
  hint: string
  expiresAtTotalDays: number
  evidenceEventIds: string[]
}

export interface MiracleEntry {
  id: string
  deityId: string
  title: string
  effectHint: string
  expiresAtTotalDays: number
  evidenceEventIds: string[]
}

export interface DivineInterventionState {
  contextId: string
  enabled: boolean
  activeOracles: OracleEntry[]
  activeMiracles: MiracleEntry[]
  chosenEntityIds: string[]
  severity: number
  updatedAtTotalDays: number
}

export interface DivineInterventionPersistenceState { schemaVersion: 1; contexts: Record<string, DivineInterventionState> }

export type AnomalySeverity = 'mild' | 'dangerous' | 'deadly'

export interface AnomalyZone {
  id: string
  contextId: string
  nodeId: string
  name: string
  description: string
  ruleDescription: string
  severity: AnomalySeverity
  spreadCount: number
  active: boolean
  createdAtTotalDays: number
  lastSpreadAtTotalDays: number
  evidenceEventIds: string[]
}

export interface AnomalyState {
  contextId: string
  enabled: boolean
  zones: AnomalyZone[]
  globalInstability: number
  updatedAtTotalDays: number
}

export interface AnomalyPersistenceState { schemaVersion: 1; contexts: Record<string, AnomalyState> }

export interface CultivationState {
  contextId: string
  characterId: string
  enabled: boolean
  worldview?: string
  talentTags: string[]
  realmIndex: number
  realmLabel: string
  realmId: string
  bottleneckPenalty: number
  breakthroughChance: number
  anticipation: number
  bottleneckHint: string
  trainingBonus: number
  lastBreakthroughAtTotalDays: number
  updatedAtTotalDays: number
}

export interface CultivationPersistenceState { schemaVersion: 1; contexts: Record<string, CultivationState> }

export interface PowerSystemSummary {
  combatPower: CombatPowerState
  monster: MonsterState
  luck: LuckState
  cultivation: CultivationState
  fortuneEncounter: FortuneEncounterState
  faith: FaithState
  divineIntervention: DivineInterventionState
  anomaly: AnomalyState
}
