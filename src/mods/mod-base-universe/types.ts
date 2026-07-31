import type { SpatialNodeId } from '@/foundation'

export type CelestialPhase = 'normal' | 'event'
export type CelestialEventRarity = 'common' | 'rare' | 'epic'
export type CelestialPrerequisiteType = 'worldAge' | 'worldview' | 'previousPhase' | 'minLuck'
export interface CelestialEventPrerequisite { type: CelestialPrerequisiteType; value: string }
export interface CelestialEvent { name: string; hint: string; luckMod: number; skillMod: number; healthMod: number; rarity?: CelestialEventRarity; prerequisites?: CelestialEventPrerequisite[] }
export interface CelestialPhenomenon {
  id: string
  name: string
  description: string
  affectedNodeIds: SpatialNodeId[]
  startsAtTotalDays: number
  endsAtTotalDays: number
  evidenceEventIds: string[]
}
export interface CelestialHistoryEntry { phenomenonId: string; name: string; startedAtTotalDays: number; endedAtTotalDays: number }
export interface CelestialCrossEffect { targetSystem: string; effectType: string; value: number; description: string }
export interface CelestialState {
  contextId: string
  currentPhase: CelestialPhase
  dayOfLocalYear: number
  localYearLength: number
  activePhenomena: CelestialPhenomenon[]
  history: CelestialHistoryEntry[]
  updatedAtTotalDays: number
}

export interface EraEntry { name: string; startAnchorYear: number }
export type EraPhase = 'opening' | 'mid' | 'late' | 'transition'
export interface EraHints { opening: string; mid: string; late: string; transition: string; transition_no_next: string }
export interface EraHistoryEntry { name: string; startAnchorYear: number; endedYear: number | null }
export interface EraState {
  contextId: string
  currentEraName: string
  anchorYear: number
  localYear: number
  dayOfYear: number
  daysPerYear: number
  phase: EraPhase
  updatedAtTotalDays: number
}

export type ProphecySource = 'celestial' | 'oracle' | 'dream' | 'divine' | 'artifact'
export interface Prophecy {
  id: string
  title: string
  description: string
  source: ProphecySource
  mutability: number
  progressFulfill: number
  status: 'active' | 'fulfilled' | 'broken'
  createdAtTotalDays: number
  targetAtTotalDays: number
  relatedEventIds: string[]
  triggeredBy?: string
}
export type ProphecyOmenStage = 'omen_25' | 'omen_50' | 'omen_75'
export interface ProphecyOmenEvent { id: string; prophecyId: string; title: string; stage: ProphecyOmenStage; description: string; totalDays: number }
export interface FateProphecyState {
  contextId: string
  enabled: boolean
  prophecies: Prophecy[]
  causalityPenalty: number
  recentFulfilled: Prophecy[]
  recentBroken: Prophecy[]
  recentOmens: ProphecyOmenEvent[]
  updatedAtTotalDays: number
}

export interface DeityEffect { text: string; luckMod: number; healthMod: number }
export interface DeityPool { deities: string[]; newDeities: string[]; blessings: DeityEffect[]; curses: DeityEffect[]; omens: DeityEffect[]; revelations: DeityEffect[] }
export interface DeityRecord { id: string; name: string; domains: string[]; status: 'active' | 'departed'; evidenceEventIds: string[] }
export interface DivineState {
  contextId: string
  initialized: boolean
  enabled: boolean
  deities: DeityRecord[]
  worldview?: string
  updatedAtTotalDays: number
}

export interface BaseUniverseSummary { celestial: CelestialState; era: EraState; fateProphecy: FateProphecyState; divineCreation: DivineState }
export interface ProphecyTemplate { id: string; title: string; description: string; source: ProphecySource; defaultMutability: number; targetQuartersMin: number; targetQuartersMax: number; compatibleWorldviews: string[] }
export interface CelestialProbabilityConfig { anomaly: number; auspicious: number; omen: number }
export interface CelestialPersistenceState { schemaVersion: 1; contexts: Record<string, CelestialState> }
export interface EraPersistenceState { schemaVersion: 1; contexts: Record<string, EraState> }
export interface FateProphecyPersistenceState { schemaVersion: 1; contexts: Record<string, FateProphecyState> }
export interface DivinePersistenceState { schemaVersion: 1; contexts: Record<string, DivineState> }
