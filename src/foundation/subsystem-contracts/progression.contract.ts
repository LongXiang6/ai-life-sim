/**
 * Purpose: Define cross-MOD progression and growth record contracts.
 * Owner: foundation / progression boundary
 * Responsibility: Shared types only; growth calculations and persistence remain with mod-progression.
 */

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
  /** 年度基础点真源；旧存档仅有 learnedAtTotalDays 时在恢复边界迁移。 */
  learnedAtBasePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
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
  /** 年度基础点真源；旧存档仅有 acquiredAtTotalDays 时在恢复边界迁移。 */
  acquiredAtBasePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
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
  /** 年度基础点真源；旧存档仅有 occurredAtTotalDays 时在恢复边界迁移。 */
  occurredAtBasePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
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
