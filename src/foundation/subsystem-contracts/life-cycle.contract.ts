/** P5 lifespan, lifecycle, health, and conditional post-death contracts. */

import type { GlobalEntityId, WorldContextId } from './world-context.contract'
import type { HistoricalEventId } from './historical-event.contract'

export type CharacterAttributeKey = 'physique' | 'mind' | 'talentAptitude' | 'charisma'
export type CharacterAttributeModifiers = Partial<Record<CharacterAttributeKey, number>>

export const CHARACTER_DAYS_PER_YEAR = 365

/**
 * The current campaign advances time before its first narrative. The first
 * observed time node is therefore the character's age anchor, not elapsed
 * biological time. Later age is derived from the canonical total-day clock.
 */
export function resolveCharacterAgeDays(
  startingAgeYears: number,
  totalDays: number,
  ageAnchorTotalDays: number,
): number {
  const startingAgeDays = Math.max(0, Math.round(startingAgeYears * CHARACTER_DAYS_PER_YEAR))
  return startingAgeDays + Math.max(0, Math.round(totalDays) - Math.max(0, Math.round(ageAnchorTotalDays)))
}

export function resolveInitialAgeAnchorTotalDays(totalDays: number): number {
  return Math.min(CHARACTER_DAYS_PER_YEAR, Math.max(0, Math.round(totalDays)))
}

export type BiologicalClockMode = 'aging' | 'ageless' | 'cyclic' | 'external'

export interface LifespanRuleProfile {
  entityId: GlobalEntityId
  raceId: string
  displayName: string
  clockMode: BiologicalClockMode
  baseLifespanDays: number
  maximumLifespanDays: number
  attrBaselines: CharacterAttributeModifiers
  source: 'character-creation' | 'world-rule' | 'confirmed-event'
  sourceEventIds: HistoricalEventId[]
  updatedAtTotalDays: number
}

export interface LifespanAdjustment {
  adjustmentId: string
  entityId: GlobalEntityId
  deltaDays: number
  operation: LifespanSystemInstructionOperation
  description: string
  occurredAtTotalDays: number
  evidenceEventIds: HistoricalEventId[]
}

export interface LifespanSystemPersistenceState {
  schemaVersion: 1
  profiles: LifespanRuleProfile[]
  adjustments: LifespanAdjustment[]
}

export const LIFESPAN_SYSTEM_OPERATION_FIELDS = {
  'adjust-maximum': ['maximumDaysDelta'],
  'set-rule': ['raceId', 'raceDisplayName', 'clockMode', 'baseLifespanDays', 'maximumLifespanDays', 'attrBaselines'],
} as const

export type LifespanSystemInstructionOperation = keyof typeof LIFESPAN_SYSTEM_OPERATION_FIELDS

export type LifecycleNarrativeArchetype =
  | 'routine'
  | 'danger'
  | 'opportunity'
  | 'social'
  | 'exploration'
  | 'rumor'
  | 'mystery'

export interface LifecycleStageDefinition {
  stageId: string
  displayName: string
  description: string
  minAgeDays: number
  maxAgeDays?: number
  requiredConditionTags: string[]
  nextStageIds: string[]
  coefficients: {
    vitality: number
    learning: number
    social: number
  }
  attributeModifiers: CharacterAttributeModifiers
  allowedArchetypes: LifecycleNarrativeArchetype[]
  terminal: boolean
}

export interface LifecycleRuleProfile {
  profileId: string
  entityId: GlobalEntityId
  clockMode: BiologicalClockMode
  stages: LifecycleStageDefinition[]
  source: 'lifespan-rule' | 'world-rule' | 'confirmed-event'
  sourceEventIds: HistoricalEventId[]
  updatedAtTotalDays: number
}

export interface EntityLifecycleState {
  entityId: GlobalEntityId
  profileId: string
  currentStageId: string
  startingAgeDays: number
  ageAnchorTotalDays: number
  ageDays: number
  conditionTags: string[]
  attributeModifiers: CharacterAttributeModifiers
  updatedAtTotalDays: number
}

export interface LifecycleTransitionRecord {
  transitionId: string
  entityId: GlobalEntityId
  profileId: string
  fromStageId: string
  toStageId: string
  occurredAtTotalDays: number
  reason: string
  historicalEventId?: HistoricalEventId
}

export interface LifecycleSystemPersistenceState {
  schemaVersion: 1
  profiles: LifecycleRuleProfile[]
  entities: EntityLifecycleState[]
  transitions: LifecycleTransitionRecord[]
}

export type HealthConditionKind = 'disease' | 'injury' | 'systemic' | 'other'
export type HealthConditionStatus = 'active' | 'recovering' | 'resolved'

export interface HealthCondition {
  conditionId: string
  entityId: GlobalEntityId
  contextId: WorldContextId
  kind: HealthConditionKind
  name: string
  bodyPart?: string
  severity: number
  status: HealthConditionStatus
  onsetTotalDays: number
  remainingDays: number
  attributeModifiers: CharacterAttributeModifiers
  traitTags: string[]
  evidenceEventIds: HistoricalEventId[]
}

export interface ContextHealthRule {
  contextId: WorldContextId
  recoveryPerDay: number
  conditionProgressionMultiplier: number
  staminaRecoveryPerDay: number
  spiritRecoveryPerDay: number
  medicalTags: string[]
  sourceEventIds: HistoricalEventId[]
}

export type DeathCauseKind = 'condition' | 'trauma' | 'old-age' | 'vitality-collapse'

export interface PendingDeathFact {
  entityId: GlobalEntityId
  contextId: WorldContextId
  causeKind: DeathCauseKind
  causeLabel: string
  occurredAtTotalDays: number
  finalAgeDays: number
}

export interface DeathOutcome {
  deathId: string
  entityId: GlobalEntityId
  contextId: WorldContextId
  causeKind: DeathCauseKind
  causeLabel: string
  occurredAtTotalDays: number
  finalAgeDays: number
  historicalEventId: HistoricalEventId
  epilogueStatus: 'pending' | 'ready'
  epilogueText?: string
}

export interface EntityHealthState {
  entityId: GlobalEntityId
  vitality: number
  maxVitality: number
  stamina: number
  spirit: number
  alive: boolean
  conditionIds: string[]
  death?: DeathOutcome
  updatedAtTotalDays: number
}

export interface HealthSystemPersistenceState {
  schemaVersion: 1
  entities: EntityHealthState[]
  conditions: HealthCondition[]
  contextRules: ContextHealthRule[]
}

export const HEALTH_SYSTEM_OPERATION_FIELDS = {
  'adjust-vitals': ['vitalityDelta', 'staminaDelta', 'spiritDelta'],
  'add-condition': ['conditionKind', 'conditionName', 'bodyPart', 'severity', 'recoveryDays', 'attributeModifiers', 'conditionTags'],
  'resolve-condition': ['resolution'],
} as const

export type HealthSystemInstructionOperation = keyof typeof HEALTH_SYSTEM_OPERATION_FIELDS
