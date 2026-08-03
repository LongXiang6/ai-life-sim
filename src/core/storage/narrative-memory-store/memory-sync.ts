/**
 * Purpose: Synchronize compressed summaries and memory events into one life-run database.
 * Owner: core:storage
 * Responsibility: Summary/event upserts and supersession links only; decay and search are delegated.
 */

import type { CompressedMemoryEvent, CompressedSummaryItem } from '@/foundation'

import { calculateMemoryWeight, isMemoryEventForgotten } from '../narrative-memory-policy'
import { openNarrativeMemoryDatabase } from './database'
import { applyNarrativeMemoryDecay } from './memory-decay'
import type { NarrativeMemorySummaryInput } from './types'

function summaryId(summary: Pick<CompressedSummaryItem, 'level' | 'startRound' | 'endRound'>): string {
  return `L${summary.level}:${summary.startRound}-${summary.endRound}`
}

function json(value: unknown): string {
  return JSON.stringify(value ?? [])
}

function normalizeMemoryEvent(
  event: CompressedMemoryEvent,
  currentRound: number,
): CompressedMemoryEvent {
  const currentWeight = calculateMemoryWeight(event, currentRound)
  return {
    ...event,
    initialWeight: Math.max(1, Math.min(10, Math.round(event.initialWeight))),
    permanent: event.permanent || event.initialWeight >= 10,
    ...(currentWeight < 0 ? { initialWeight: 1 } : {}),
  }
}

export function syncNarrativeMemoryDatabase(input: {
  lifeRunId: string
  currentRound: number
  summaries: readonly NarrativeMemorySummaryInput[]
}): void {
  const database = openNarrativeMemoryDatabase(input.lifeRunId)
  database.transaction(() => {
    const insertSummary = database.prepare(`
      INSERT INTO summary_nodes(
        summary_id, level, start_round, end_round, created_round, content,
        raw_ai_response, source_summary_ids_json, context_ids_json,
        start_total_days, end_total_days
      ) VALUES(
        @summaryId, @level, @startRound, @endRound, @createdRound, @content,
        @rawAiResponse, @sourceSummaryIds, @contextIds,
        @startTotalDays, @endTotalDays
      )
      ON CONFLICT(summary_id) DO UPDATE SET
        content = excluded.content,
        raw_ai_response = CASE WHEN summary_nodes.raw_ai_response = '' THEN excluded.raw_ai_response ELSE summary_nodes.raw_ai_response END,
        source_summary_ids_json = excluded.source_summary_ids_json,
        context_ids_json = excluded.context_ids_json,
        start_total_days = excluded.start_total_days,
        end_total_days = excluded.end_total_days
    `)
    const insertArchive = database.prepare(`
      INSERT OR IGNORE INTO l1_archives(
        summary_id, start_round, end_round, raw_ai_response, timeline_text, events_json, archived_at
      ) VALUES(@summaryId, @startRound, @endRound, @rawAiResponse, @timelineText, @eventsJson, @archivedAt)
    `)
    const insertEvent = database.prepare(`
      INSERT INTO memory_events(
        event_id, origin_summary_id, level, time_span, event_text, occurrence_time,
        source_event_ids_json, source_rounds_json, initial_weight, current_weight,
        weight_anchor_round, forgotten_round, active, permanent, updated_at
      ) VALUES(
        @eventId, @summaryId, @level, @timeSpan, @eventText, @occurrenceTime,
        @sourceEventIds, @sourceRounds, @initialWeight, @currentWeight,
        @weightAnchorRound, @forgottenRound, @active, @permanent, @updatedAt
      )
      ON CONFLICT(event_id) DO UPDATE SET
        origin_summary_id = COALESCE(memory_events.origin_summary_id, excluded.origin_summary_id),
        level = COALESCE(memory_events.level, excluded.level),
        current_weight = excluded.current_weight,
        forgotten_round = excluded.forgotten_round,
        active = CASE WHEN memory_events.permanent = 1 THEN 1 ELSE excluded.active END,
        permanent = CASE WHEN memory_events.permanent = 1 THEN 1 ELSE excluded.permanent END,
        updated_at = excluded.updated_at
    `)
    const linkEvent = database.prepare(`
      INSERT OR IGNORE INTO summary_event_links(summary_id, event_id) VALUES(@summaryId, @eventId)
    `)
    const supersede = database.prepare(`
      UPDATE memory_events
      SET superseded_by_event_id = @newEventId, active = 0, updated_at = @updatedAt
      WHERE event_id = @sourceEventId AND permanent = 0
    `)

    for (const summary of input.summaries) {
      const id = summaryId(summary)
      const createdRound = summary.createdRound ?? input.currentRound
      const raw = summary.rawCompressionResponse ?? ''
      insertSummary.run({
        summaryId: id,
        level: summary.level,
        startRound: summary.startRound,
        endRound: summary.endRound,
        createdRound,
        content: summary.content,
        rawAiResponse: raw,
        sourceSummaryIds: json(summary.sourceSummaryIds),
        contextIds: json(summary.contextIds),
        startTotalDays: summary.startTotalDays ?? null,
        endTotalDays: summary.endTotalDays ?? null,
      })
      if (summary.level === 1) {
        insertArchive.run({
          summaryId: id,
          startRound: summary.startRound,
          endRound: summary.endRound,
          rawAiResponse: raw,
          timelineText: summary.archiveContent ?? summary.content,
          eventsJson: json(summary.memoryEvents),
          archivedAt: Date.now(),
        })
      }
      for (const event of summary.memoryEvents ?? []) {
        const normalized = normalizeMemoryEvent(event, input.currentRound)
        const currentWeight = calculateMemoryWeight(normalized, input.currentRound)
        const forgotten = isMemoryEventForgotten(normalized, input.currentRound)
        insertEvent.run({
          eventId: normalized.id,
          summaryId: id,
          level: summary.level,
          timeSpan: normalized.timeSpan,
          eventText: normalized.text,
          occurrenceTime: normalized.occurrenceTime,
          sourceEventIds: json(normalized.sourceEventIds),
          sourceRounds: json(normalized.sourceRounds),
          initialWeight: normalized.initialWeight,
          currentWeight,
          weightAnchorRound: normalized.weightAnchorRound,
          forgottenRound: forgotten ? input.currentRound : null,
          active: !forgotten && normalized.initialWeight > 1 ? 1 : 0,
          permanent: normalized.permanent ? 1 : 0,
          updatedAt: Date.now(),
        })
        linkEvent.run({ summaryId: id, eventId: normalized.id })
        for (const sourceEventId of normalized.sourceEventIds) {
          supersede.run({ sourceEventId, newEventId: normalized.id, updatedAt: Date.now() })
        }
      }
    }
  })()
  applyNarrativeMemoryDecay(database, input.currentRound)
}
