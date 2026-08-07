/**
 * Purpose: Define memory-lifecycle event, index, aggregation, compression, and timeline contracts.
 * Owner: mod-engine
 * Responsibility: Memory data contracts and thresholds only; scoring, indexing, and retrieval stay in the system.
 */

import type { NarrativeMemoryScope } from '../../helpers/narrative-context-scope'
import type { NarrativeRelationshipUpdate } from '../../helpers/narrative-semantic-signals'
import type { NarrativeTimelineEntry } from '../../helpers/timeline-memory'

export type EventImportance = 'HIGH' | 'NORMAL' | 'LOW'

export type ClosureType =
  | 'battle'
  | 'journey'
  | 'task'
  | 'relationship'
  | 'life_stage'
  | 'none'

export interface ImportanceResult {
  importance: EventImportance
  score: number
  semanticTags: string[]
  source: 'ai' | 'fallback' | 'protection'
  isClosure: boolean
  closureType: ClosureType
}

export interface TaggedEvent {
  round: number
  contextId?: string
  memoryScope?: NarrativeMemoryScope
  calendarYear?: number
  narrative: string
  importance: EventImportance
  isClosure: boolean
  closureType: ClosureType
  tags: string[]
  historicalEventIds?: string[]
}

export interface IndexEntry {
  level: number
  startRound: number
  endRound: number
  content: string
  narrativeTimelineEntries: NarrativeTimelineEntry[]
  tags: string[]
  maxImportance: EventImportance
  contextIds?: string[]
  memoryScopes?: NarrativeMemoryScope[]
  historicalEventIds?: string[]
}

export type EventSeverity = 'critical' | 'major' | 'normal' | 'color'

export const SEVERITY_WEIGHT: Record<EventSeverity, number> = {
  critical: 4,
  major: 3,
  normal: 2,
  color: 1,
}

export const SEVERITY_LABELS: Record<EventSeverity, string> = {
  critical: '危急',
  major: '重大',
  normal: '普通',
  color: '背景',
}

export interface AggregatedEvent {
  id: string
  severity: EventSeverity
  title: string
  description: string
  source: string
  round: number
  causalLinks?: string[]
}

export interface RawEvent {
  id: string
  severity: EventSeverity
  title: string
  description: string
  source: string
  round: number
  cause?: string
  effect?: string
}

export interface CompressionDecision {
  shouldCompress: boolean
  reason: 'closure' | 'capacity' | 'none'
  closureType?: ClosureType
  tokenBudgets: {
    HIGH: number
    NORMAL: number
    LOW: number
  }
  taggedEvents: TaggedEvent[]
}

export interface NarrativeTimelineProjection {
  timelineEntries: NarrativeTimelineEntry[]
}

export interface RelationshipMemoryRecord {
  personName: string
  contextId?: string
  memoryScope?: NarrativeMemoryScope
  round: number
  type: NarrativeRelationshipUpdate['type']
  summary: string
  importance: EventImportance
  historicalEventIds?: string[]
}

export interface CausalMemoryProtection {
  round: number
  contextId?: string
  type: 'kindness' | 'grudge' | 'promise' | 'debt' | 'foreshadow'
  description: string
  severity: 'minor' | 'normal' | 'major' | 'critical'
  resolved: boolean
}

export interface MemoryRoundTime {
  displayTimeLabel?: string
  displayAge?: number
  totalDays?: number
}

export const RETENTION_RATES: Record<EventImportance, number> = {
  HIGH: 0.80,
  NORMAL: 0.30,
  LOW: 0.10,
}

export const CAPACITY_THRESHOLD = 15
export const MIN_ROUNDS_FOR_COMPRESSION = 3
