/**
 * P2 NPC and social relationship cross-MOD contract.
 *
 * This module contains data contracts only. Runtime state, validation, prompt
 * projection, and persistence belong to their owning MODs.
 */

import type {
  GlobalEntityId,
  SpatialNodeId,
  WorldContextId,
} from './world-context.contract'
import type { HistoricalEventId } from './historical-event.contract'

export type EntityReferenceKind = 'player' | 'npc' | 'organization'

export interface EntityReference {
  entityId: GlobalEntityId
  kind: EntityReferenceKind
  displayName: string
  contextIds: WorldContextId[]
  registeredAtTotalDays: number
}

export interface EntityReferenceDirectoryPersistenceState {
  schemaVersion: 1
  entries: EntityReference[]
}

export type NpcAvailability = 'available' | 'unavailable'

export interface NpcIdentity {
  npcId: GlobalEntityId
  displayName: string
  creationSource: string
  bornAtTotalDays: number
  stableTraits: string[]
  availability: NpcAvailability
}

export interface NpcContextState {
  npcId: GlobalEntityId
  contextId: WorldContextId
  localName?: string
  stance: string
  role: string
  localRuleModifiers: Record<string, number>
}

export type NpcGoalStatus = 'active' | 'fulfilled' | 'abandoned'

export interface NpcGoal {
  goalId: string
  npcId: GlobalEntityId
  contextId: WorldContextId
  status: NpcGoalStatus
  description: string
  targetEntityIds: GlobalEntityId[]
  createdAtTotalDays: number
  historicalEventIds: HistoricalEventId[]
}

export interface NpcBehaviorRecord {
  behaviorId: string
  npcId: GlobalEntityId
  contextId: WorldContextId
  operation: string
  description: string
  targetEntityIds: GlobalEntityId[]
  spatialNodeId?: SpatialNodeId
  occurredAtTotalDays: number
  historicalEventIds: HistoricalEventId[]
  source: 'instruction' | 'background-aggregate' | 'dormant-catch-up'
}

export type NpcMemorySourceKind = 'historical-event' | 'relationship-transition' | 'behavior'

export interface NpcMemory {
  memoryId: string
  npcId: GlobalEntityId
  contextId: WorldContextId
  sourceKind: NpcMemorySourceKind
  sourceId: string
  summary: string
  emotion: number
  relatedEntityIds: GlobalEntityId[]
  createdAtTotalDays: number
  sourceMemoryIds: string[]
}

export interface NpcMemoryCompression {
  compressionId: string
  npcId: GlobalEntityId
  contextId: WorldContextId
  summary: string
  sourceMemoryIds: string[]
  createdAtTotalDays: number
}

export interface NpcSystemPersistenceState {
  schemaVersion: 1
  identities: NpcIdentity[]
  contextStates: NpcContextState[]
  goals: NpcGoal[]
  behaviorRecords: NpcBehaviorRecord[]
  memories: NpcMemory[]
  memoryCompressions: NpcMemoryCompression[]
}

/** Each NPC operation owns an exact payload key set. */
export const NPC_SYSTEM_OPERATION_FIELDS = {
  'create-identity': ['displayName', 'creationSource', 'stableTraits'],
  'set-context-state': ['localName', 'stance', 'role', 'localRuleModifiers'],
  'set-goal': ['description', 'targetEntityIds'],
  'record-behavior': ['behaviorOperation', 'targetEntityIds', 'spatialNodeId'],
  'record-memory': ['summary', 'emotion', 'relatedEntityIds', 'sourceMemoryIds'],
} as const

export type NpcSystemInstructionOperation = keyof typeof NPC_SYSTEM_OPERATION_FIELDS

export type RelationshipScopeKind = 'global' | 'context' | 'cross-context'

export interface RelationshipScope {
  kind: RelationshipScopeKind
  contextIds: WorldContextId[]
}

export type RelationshipStatus = 'active' | 'ended'

export interface RelationshipRecord {
  relationshipId: string
  fromEntityId: GlobalEntityId
  toEntityId: GlobalEntityId
  scope: RelationshipScope
  categoryTags: string[]
  affinity: number
  trust: number
  bond: number
  conflict: number
  status: RelationshipStatus
  createdAtTotalDays: number
}

export type RelationshipTransitionOperation = 'establish' | 'adjust' | 'end' | 'scope-change'

/** Each relationship operation owns an exact payload key set. */
export const RELATIONSHIP_SYSTEM_OPERATION_FIELDS = {
  establish: ['toEntityId', 'categoryTags', 'affinity', 'trust', 'bond', 'conflict', 'scopeKind', 'scopeContextIds'],
  adjust: ['categoryTags', 'affinityDelta', 'trustDelta', 'bondDelta', 'conflictDelta'],
  end: [],
  'scope-change': ['scopeKind', 'scopeContextIds'],
} as const satisfies Record<RelationshipTransitionOperation, readonly string[]>

export interface RelationshipTransition {
  transitionId: string
  relationshipId: string
  operation: RelationshipTransitionOperation
  description: string
  contextId: WorldContextId
  occurredAtTotalDays: number
  historicalEventIds: HistoricalEventId[]
}

export interface RelationshipSystemPersistenceState {
  schemaVersion: 1
  relationships: RelationshipRecord[]
  transitions: RelationshipTransition[]
}

export interface NpcSystemInstruction {
  npcId: GlobalEntityId
  contextId: WorldContextId
  operation: NpcSystemInstructionOperation
  description: string
  payload: Record<string, unknown>
  historicalEventIds: HistoricalEventId[]
}

export interface RelationshipSystemInstruction {
  fromEntityId: GlobalEntityId
  contextId: WorldContextId
  operation: RelationshipTransitionOperation
  description: string
  payload: Record<string, unknown>
  historicalEventIds: HistoricalEventId[]
}
