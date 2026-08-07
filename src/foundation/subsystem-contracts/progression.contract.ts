/** Generic character skill and ability growth contracts. */

import type { GlobalEntityId, WorldContextId } from './world-context.contract'
import type { HistoricalEventId } from './historical-event.contract'

export type ProgressionScopeKind = 'global' | 'context'

export interface ProgressionScope {
  kind: ProgressionScopeKind
  contextIds: WorldContextId[]
}

export type SkillMastery = 'novice' | 'practiced' | 'proficient' | 'expert' | 'master'

export interface GrowthSkill {
  skillId: string
  entityId: GlobalEntityId
  name: string
  category: string
  description: string
  scope: ProgressionScope
  experience: number
  useCount: number
  potentialCap: number
  mastery: SkillMastery
  learnedAtTotalDays: number
  sourceEventIds: HistoricalEventId[]
}

export type AbilityStatus = 'latent' | 'active' | 'lost'

export interface StableAbility {
  abilityId: string
  entityId: GlobalEntityId
  name: string
  description: string
  scope: ProgressionScope
  potential: number
  learningConstraints: string[]
  status: AbilityStatus
  acquiredAtTotalDays: number
  sourceEventIds: HistoricalEventId[]
}

export interface GrowthRecord {
  growthRecordId: string
  entityId: GlobalEntityId
  targetId: string
  operation: GrowthSystemInstructionOperation
  experienceDelta: number
  potentialDelta: number
  description: string
  occurredAtTotalDays: number
  evidenceEventIds: HistoricalEventId[]
}

export interface GrowthSystemPersistenceState {
  schemaVersion: 1
  skills: GrowthSkill[]
  abilities: StableAbility[]
  records: GrowthRecord[]
}

export const GROWTH_SYSTEM_OPERATION_FIELDS = {
  'learn-skill': ['name', 'category', 'description', 'scopeKind', 'scopeContextIds', 'potentialCap'],
  'practice-skill': ['experienceDelta', 'useCountDelta'],
  'gain-ability': ['name', 'description', 'scopeKind', 'scopeContextIds', 'potential', 'learningConstraints'],
  'adjust-ability': ['potentialDelta', 'abilityStatus'],
} as const

export type GrowthSystemInstructionOperation = keyof typeof GROWTH_SYSTEM_OPERATION_FIELDS
