import type { DecimalInteger } from '@/foundation'

export interface SocialGroup {
  id: string
  label: string
  populationShare: number
  privilegeIndex: number
  mobilityBarrier: number
}

export interface SocialStratificationState {
  contextId: string
  groups: SocialGroup[]
  playerGroupId: string | null
  mobilityIndex: number
  updatedAtTotalDays: number
}

export type FactionStatus = 'rising' | 'stable' | 'declining' | 'dissolved'
export type PoliticalEntityKind = 'nation' | 'faction' | 'house' | 'tribe' | 'city' | 'network' | 'other'

export interface PoliticalEntity {
  entityId: string
  name: string
  kind: PoliticalEntityKind
  memberCount: DecimalInteger
  influence: number
  objective: string
  relations: Record<string, number>
  status: FactionStatus
}

export interface FactionState {
  contextId: string
  entities: PoliticalEntity[]
  playerEntityId: string | null
  playerContribution: number
  playerRankLabel: string
  updatedAtTotalDays: number
}

export type LawCategory = 'criminal' | 'civil' | 'economic' | 'religious' | 'military' | 'custom'
export interface LawEntry {
  id: string
  name: string
  category: LawCategory
  severity: number
  active: boolean
  consequence: string
  enactedAtTotalDays: number
  evidenceEventIds: string[]
}
export type LegalSystemType = 'customary' | 'statutory' | 'religious' | 'martial' | 'normative' | 'none'
export interface LegalState {
  contextId: string
  systemType: LegalSystemType
  laws: LawEntry[]
  enforcementLevel: number
  corruption: number
  updatedAtTotalDays: number
}

export type ConflictPhase = 'forming' | 'escalating' | 'active' | 'stalemate' | 'resolving' | 'resolved'
export interface ConflictRecord {
  id: string
  theme: string
  partyEntityIds: string[]
  phase: ConflictPhase
  phaseProgress: number
  tension: number
  evidenceEventIds: string[]
  startedAtTotalDays: number
  updatedAtTotalDays: number
}
export interface ConflictCycleState {
  contextId: string
  conflicts: ConflictRecord[]
  updatedAtTotalDays: number
}

export interface PoliticsSummary {
  socialStratification: SocialStratificationState
  faction: FactionState
  legal: LegalState
  conflictCycle: ConflictCycleState
}

export interface SocialStratificationPersistenceState { schemaVersion: 1; contexts: Record<string, SocialStratificationState> }
export interface FactionPersistenceState { schemaVersion: 1; contexts: Record<string, FactionState> }
export interface LegalPersistenceState { schemaVersion: 1; contexts: Record<string, LegalState> }
export interface ConflictCyclePersistenceState { schemaVersion: 1; contexts: Record<string, ConflictCycleState> }
