/**
 * Purpose: Define supernatural power-system state and persistence contracts.
 * Owner: mod-power-system
 * Responsibility: Shared types only; progression calculations remain in power subsystems.
 */

/** P8 world-defined supernatural extension contracts. */

import type { PowerFrameworkDefinition } from '@/foundation'

export type { PowerFrameworkDefinition, PowerRankDefinition } from '@/foundation'

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
  /** 业务冷却/洞察剩余基础点；旧天数字段只作迁移和显示快照。 */
  insightBasePointsRemaining: number
  insightDaysRemaining: number
  updatedAtBasePoints: number
  stageNames: Record<string, string>
  updatedAtTotalDays: number
}

export interface CombatPowerPersistenceState { schemaVersion: 1; contexts: Record<string, CombatPowerState> }

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
  lastBreakthroughAtBasePoints: number
  updatedAtBasePoints: number
  lastBreakthroughAtTotalDays: number
  updatedAtTotalDays: number
}

export interface CultivationPersistenceState { schemaVersion: 1; contexts: Record<string, CultivationState> }

export interface PowerSystemSummary {
  combatPower: CombatPowerState
  cultivation: CultivationState
}
