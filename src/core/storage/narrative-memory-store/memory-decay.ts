/**
 * Purpose: Recalculate persisted narrative-memory weights and forgotten state for a round.
 * Owner: core:storage
 * Responsibility: Weight-policy application only; event insertion and search remain separate.
 */

import type Database from 'better-sqlite3'

import type { CompressedMemoryEvent } from '@/foundation'

import { calculateMemoryWeight, isMemoryEventForgotten } from '../narrative-memory-policy'
import { openNarrativeMemoryDatabase } from './database'

export function applyNarrativeMemoryDecay(
  database: Database.Database,
  currentRound: number,
): void {
  const rows = database.prepare(`
    SELECT event_id, time_span, event_text, occurrence_time, source_event_ids_json,
      source_rounds_json, initial_weight, weight_anchor_round, permanent
    FROM memory_events WHERE superseded_by_event_id IS NULL
  `).all() as Array<{
    event_id: string
    time_span: string
    event_text: string
    occurrence_time: string
    source_event_ids_json: string
    source_rounds_json: string
    initial_weight: number
    weight_anchor_round: number
    permanent: number
  }>
  const update = database.prepare(`
    UPDATE memory_events
    SET current_weight = @currentWeight,
        forgotten_round = @forgottenRound,
        active = @active,
        updated_at = @updatedAt
    WHERE event_id = @eventId
  `)
  database.transaction(() => {
    for (const row of rows) {
      const event: CompressedMemoryEvent = {
        id: row.event_id,
        timeSpan: row.time_span,
        text: row.event_text,
        occurrenceTime: row.occurrence_time,
        sourceEventIds: JSON.parse(row.source_event_ids_json) as string[],
        sourceRounds: JSON.parse(row.source_rounds_json) as number[],
        initialWeight: row.initial_weight,
        weightAnchorRound: row.weight_anchor_round,
        permanent: row.permanent === 1,
      }
      const currentWeight = calculateMemoryWeight(event, currentRound)
      const forgotten = isMemoryEventForgotten(event, currentRound)
      update.run({
        eventId: row.event_id,
        currentWeight,
        forgottenRound: forgotten ? currentRound : null,
        active: !forgotten && event.initialWeight > 1 ? 1 : 0,
        updatedAt: Date.now(),
      })
    }
  })()
}

export function advanceNarrativeMemoryDatabase(input: {
  lifeRunId: string
  currentRound: number
}): void {
  applyNarrativeMemoryDecay(openNarrativeMemoryDatabase(input.lifeRunId), input.currentRound)
}
