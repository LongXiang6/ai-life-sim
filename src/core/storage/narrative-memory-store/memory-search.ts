/**
 * Purpose: Search narrative-memory events after applying the current round's decay state.
 * Owner: core:storage
 * Responsibility: Search filtering, ordering, and public row projection only.
 */

import { openNarrativeMemoryDatabase } from './database'
import { applyNarrativeMemoryDecay } from './memory-decay'
import type { NarrativeMemorySearchResult } from './types'

export function searchNarrativeMemoryDatabase(input: {
  lifeRunId: string
  currentRound: number
  terms: readonly string[]
}): NarrativeMemorySearchResult[] {
  const database = openNarrativeMemoryDatabase(input.lifeRunId)
  applyNarrativeMemoryDecay(database, input.currentRound)
  const terms = [...new Set(input.terms.map((term) => term.trim()).filter(Boolean))]
  const where = terms.length === 0
    ? ''
    : `WHERE ${terms.map(() => '(event_text LIKE ? OR time_span LIKE ? OR occurrence_time LIKE ?)').join(' OR ')}`
  const parameters = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`])
  const rows = database.prepare(`
    SELECT event_id, origin_summary_id, level, time_span, event_text, occurrence_time,
      initial_weight, current_weight, active, permanent, source_rounds_json, forgotten_round
    FROM memory_events
    ${where}
    ORDER BY permanent DESC, active DESC, current_weight DESC, occurrence_time ASC, event_id ASC
  `).all(...parameters) as Array<{
    event_id: string
    origin_summary_id: string | null
    level: number | null
    time_span: string
    event_text: string
    occurrence_time: string
    initial_weight: number
    current_weight: number
    active: number
    permanent: number
    source_rounds_json: string
    forgotten_round: number | null
  }>
  return rows.map((row) => ({
    eventId: row.event_id,
    summaryId: row.origin_summary_id,
    level: row.level,
    timeSpan: row.time_span,
    text: row.event_text,
    occurrenceTime: row.occurrence_time,
    initialWeight: row.initial_weight,
    currentWeight: row.current_weight,
    active: row.active === 1,
    permanent: row.permanent === 1,
    sourceRounds: JSON.parse(row.source_rounds_json) as number[],
    forgottenRound: row.forgotten_round,
  }))
}
