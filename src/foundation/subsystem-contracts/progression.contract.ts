/** P4 generic growth, verified achievements, and scoped reputation contracts. */

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

export type AchievementScopeKind = 'global' | 'context'

export interface AchievementEventCriteria {
  eventTypes: string[]
  tags: string[]
  minimumCount: number
  requireCharacterParticipation: boolean
}

export interface AchievementDefinition {
  achievementId: string
  name: string
  description: string
  points: number
  scopeKind: AchievementScopeKind
  contextId?: WorldContextId
  criteria: AchievementEventCriteria
}

export interface AchievementProgress {
  achievementId: string
  entityId: GlobalEntityId
  matchedEventIds: HistoricalEventId[]
  currentCount: number
  requiredCount: number
}

export interface AchievementUnlock {
  achievementId: string
  entityId: GlobalEntityId
  contextId?: WorldContextId
  unlockedAtTotalDays: number
  evidenceEventIds: HistoricalEventId[]
}

export interface AchievementSystemPersistenceState {
  schemaVersion: 1
  definitions: AchievementDefinition[]
  progress: AchievementProgress[]
  unlocks: AchievementUnlock[]
}

export type ReputationScopeKind = 'entity' | 'context' | 'global'

export interface ReputationScope {
  kind: ReputationScopeKind
  evaluatorEntityId?: GlobalEntityId
  contextId?: WorldContextId
}

export interface ReputationEvaluation {
  reputationId: string
  subjectEntityId: GlobalEntityId
  scope: ReputationScope
  dimension: string
  score: number
  updatedAtTotalDays: number
}

export interface ReputationChangeRecord {
  changeId: string
  reputationId: string
  subjectEntityId: GlobalEntityId
  scope: ReputationScope
  dimension: string
  delta: number
  description: string
  occurredAtTotalDays: number
  evidenceEventIds: HistoricalEventId[]
}

export interface ReputationSystemPersistenceState {
  schemaVersion: 1
  evaluations: ReputationEvaluation[]
  changes: ReputationChangeRecord[]
}

export const REPUTATION_SYSTEM_OPERATION_FIELDS = {
  adjust: ['scopeKind', 'evaluatorEntityId', 'scopeContextId', 'dimension', 'delta'],
} as const

export type ReputationSystemInstructionOperation = keyof typeof REPUTATION_SYSTEM_OPERATION_FIELDS
