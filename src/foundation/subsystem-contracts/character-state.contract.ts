/**
 * Purpose: Define the public character-status contract owned by character-base.
 * Owner: foundation / mod-character public boundary.
 * Responsibility: Cross-domain state shapes only; analysis, lifecycle, death, and epilogue behavior stay in mod-character.
 */

import {
  BASE_POINTS_PER_YEAR,
  basePointsFromCalendarDays,
  calendarDaysFromBasePoints,
} from '../utils/annual-clock'

export type CharacterDeathCauseKind = 'story' | 'condition' | 'trauma' | 'life-ending'
export type CharacterBiologicalClockMode = 'aging' | 'ageless' | 'cyclic' | 'external'

export const CHARACTER_DAYS_PER_YEAR = 365
export const CHARACTER_BASE_POINTS_PER_YEAR = BASE_POINTS_PER_YEAR

/** 以年度基础点计算角色年龄；日数只在返回展示快照时派生。 */
export function resolveCharacterAgeBasePoints(
  startingAgeYears: number,
  totalBasePoints: number,
  ageAnchorBasePoints: number,
): number {
  const startingAgePoints = Math.max(0, Math.round(startingAgeYears * CHARACTER_BASE_POINTS_PER_YEAR))
  return startingAgePoints + Math.max(0, Math.round(totalBasePoints) - Math.max(0, Math.round(ageAnchorBasePoints)))
}

export function resolveCharacterAgeDaysFromBasePoints(
  startingAgeYears: number,
  totalBasePoints: number,
  ageAnchorBasePoints: number,
): number {
  const startingAgeDays = Math.max(0, Math.round(startingAgeYears * CHARACTER_DAYS_PER_YEAR))
  const elapsedPoints = Math.max(
    0,
    Math.round(totalBasePoints) - Math.max(0, Math.round(ageAnchorBasePoints)),
  )
  return startingAgeDays + calendarDaysFromBasePoints(elapsedPoints)
}

export function resolveInitialAgeAnchorBasePoints(totalBasePoints: number): number {
  void totalBasePoints
  return 0
}

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

/** 将旧存档的年龄锚点迁移为基础点；仅用于一次性恢复。 */
export function migrateAgeAnchorDaysToBasePoints(totalDays: number): number {
  return basePointsFromCalendarDays(resolveInitialAgeAnchorTotalDays(totalDays))
}

export interface CharacterLifeStageDefinition {
  stageId: string
  displayName: string
  description: string
  minAgeDays: number
  maxAgeDays?: number
  guidance: string
}

export interface CharacterConditionState {
  conditionId: string
  contextId: string
  name: string
  severity: number
  summary: string
  status: 'active' | 'recovering' | 'resolved'
  onsetTotalDays: number
  evidenceEventIds: string[]
}

export interface CharacterDeathOutcome {
  deathId: string
  entityId: string
  contextId: string
  causeKind: CharacterDeathCauseKind
  causeLabel: string
  occurredAtTotalDays: number
  finalAgeDays: number
  historicalEventId: string
}

export interface PendingCharacterDeath {
  entityId: string
  contextId: string
  causeKind: CharacterDeathCauseKind
  causeLabel: string
  occurredAtTotalDays: number
  finalAgeDays: number
}

export interface CharacterHealthState {
  vitality: number
  maxVitality: number
  stamina: number
  spirit: number
  alive: boolean
  conditions: CharacterConditionState[]
  death?: CharacterDeathOutcome
  updatedAtTotalDays: number
}

export type CharacterFortuneLevel = 'very-unlucky' | 'unlucky' | 'ordinary' | 'lucky' | 'very-lucky'

export interface CharacterFortuneState {
  value: number
  level: CharacterFortuneLevel
  guidance: string
}

export interface CharacterNarrativeStatus {
  entityId?: string
  raceId: string
  raceName: string
  clockMode: CharacterBiologicalClockMode
  /** 年龄业务锚点；缺失时由 ageAnchorTotalDays 一次迁移。 */
  ageAnchorBasePoints?: number
  ageAnchorTotalDays: number
  ageDays: number
  maximumLifespanDays: number
  /** World-authored, unscaled stage boundaries; lifeStages is derived from this template. */
  lifeStageTemplate: CharacterLifeStageDefinition[]
  lifeStages: CharacterLifeStageDefinition[]
  currentStageId?: string
  endRisk: number
  health: CharacterHealthState
  fortune: CharacterFortuneState
  guidance: string[]
  lastAnalyzedAtTotalDays: number
}

export const CHARACTER_BASE_OPERATION_FIELDS = {
  'adjust-attributes': ['mindDelta', 'physiqueDelta', 'charismaDelta', 'familyBackgroundDelta'],
  'update-status': [
    'vitalityDelta',
    'staminaDelta',
    'spiritDelta',
    'conditionId',
    'conditionName',
    'conditionSeverity',
    'conditionSummary',
    'conditionStatus',
    'fortuneDelta',
    'deathCauseKind',
    'deathCauseLabel',
  ],
} as const

export type CharacterBaseInstructionOperation = keyof typeof CHARACTER_BASE_OPERATION_FIELDS
