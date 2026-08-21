/**
 * Purpose: Define the remaining memory-continuity contracts.
 * Owner: mod-engine / memory-lifecycle
 * Responsibility: Causal protection and timeline projection shapes only.
 */

import type { NarrativeTimelineEntry } from '../../helpers/timeline-memory'

export interface NarrativeTimelineProjection {
  timelineEntries: NarrativeTimelineEntry[]
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
