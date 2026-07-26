/**
 * @module narrative-memory-store.ts
 * @description 每个存档独立的明文 SQLite 时间轴记忆库
 * @mod core
 */

import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

import type { CompressedMemoryEvent, CompressedSummaryItem } from '@/foundation'
import {
  calculateMemoryWeight,
  isMemoryEventForgotten,
} from './narrative-memory-policy'

export interface NarrativeMemorySummaryInput extends Pick<
  CompressedSummaryItem,
  'level' | 'startRound' | 'endRound' | 'content' | 'archiveContent' | 'memoryEvents' | 'rawCompressionResponse' | 'sourceSummaryIds' | 'contextIds' | 'startTotalDays' | 'endTotalDays'
> {
  createdRound?: number
}

export interface NarrativeMemorySearchResult {
  eventId: string
  summaryId: string | null
  level: number | null
  timeSpan: string
  text: string
  occurrenceTime: string
  initialWeight: number
  currentWeight: number
  active: boolean
  permanent: boolean
  sourceRounds: number[]
  forgottenRound: number | null
}

declare global {
  var __narrativeMemoryDatabaseHandles: Map<string, Database.Database> | undefined
}

const handles = globalThis.__narrativeMemoryDatabaseHandles ?? new Map<string, Database.Database>()
globalThis.__narrativeMemoryDatabaseHandles = handles

function safeSaveId(lifeRunId: string): string {
  const normalized = lifeRunId.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '')
  return normalized.slice(0, 96) || 'unknown-life'
}

export function getNarrativeMemoryDatabasePath(lifeRunId: string): string {
  const configured = process.env.NARRATIVE_MEMORY_DIR?.trim()
  const root = configured ? path.resolve(configured) : path.join(process.cwd(), '.data', 'narrative-memory')
  return path.join(root, `${safeSaveId(lifeRunId)}.sqlite`)
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summary_nodes (
      summary_id TEXT PRIMARY KEY,
      level INTEGER NOT NULL,
      start_round INTEGER NOT NULL,
      end_round INTEGER NOT NULL,
      created_round INTEGER NOT NULL,
      content TEXT NOT NULL,
      raw_ai_response TEXT NOT NULL,
      source_summary_ids_json TEXT NOT NULL,
      context_ids_json TEXT NOT NULL,
      start_total_days REAL,
      end_total_days REAL
    );

    CREATE TABLE IF NOT EXISTS l1_archives (
      summary_id TEXT PRIMARY KEY,
      start_round INTEGER NOT NULL,
      end_round INTEGER NOT NULL,
      raw_ai_response TEXT NOT NULL,
      timeline_text TEXT NOT NULL,
      events_json TEXT NOT NULL,
      archived_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_events (
      event_id TEXT PRIMARY KEY,
      origin_summary_id TEXT,
      level INTEGER,
      time_span TEXT NOT NULL,
      event_text TEXT NOT NULL,
      occurrence_time TEXT NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      source_rounds_json TEXT NOT NULL,
      initial_weight INTEGER NOT NULL,
      current_weight INTEGER NOT NULL,
      weight_anchor_round INTEGER NOT NULL,
      forgotten_round INTEGER,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      permanent INTEGER NOT NULL DEFAULT 0 CHECK(permanent IN (0, 1)),
      superseded_by_event_id TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summary_event_links (
      summary_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      PRIMARY KEY(summary_id, event_id)
    );

    CREATE INDEX IF NOT EXISTS memory_events_active_idx
      ON memory_events(active, permanent, current_weight DESC);
    CREATE INDEX IF NOT EXISTS memory_events_time_idx
      ON memory_events(occurrence_time, event_id);
    CREATE INDEX IF NOT EXISTS memory_events_summary_idx
      ON summary_event_links(summary_id, event_id);

    INSERT INTO memory_meta(key, value) VALUES ('schema_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    INSERT INTO memory_meta(key, value) VALUES ('storage_format', 'plaintext-sqlite')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    INSERT INTO memory_meta(key, value) VALUES ('weight_policy', '1=archive-only;2-9=progressive-decay;10=permanent')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `)
}

function openDatabase(lifeRunId: string): Database.Database {
  const databasePath = getNarrativeMemoryDatabasePath(lifeRunId)
  const existing = handles.get(databasePath)
  if (existing?.open) return existing
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  database.pragma('journal_mode = DELETE')
  database.pragma('busy_timeout = 5000')
  database.pragma('synchronous = FULL')
  initializeSchema(database)
  handles.set(databasePath, database)
  return database
}

function summaryId(summary: Pick<CompressedSummaryItem, 'level' | 'startRound' | 'endRound'>): string {
  return `L${summary.level}:${summary.startRound}-${summary.endRound}`
}

function json(value: unknown): string {
  return JSON.stringify(value ?? [])
}

function normalizeMemoryEvent(event: CompressedMemoryEvent, currentRound: number): CompressedMemoryEvent {
  const currentWeight = calculateMemoryWeight(event, currentRound)
  return {
    ...event,
    initialWeight: Math.max(1, Math.min(10, Math.round(event.initialWeight))),
    permanent: event.permanent || event.initialWeight >= 10,
    // currentWeight is persisted separately; this copy remains the immutable event contract.
    ...(currentWeight < 0 ? { initialWeight: 1 } : {}),
  }
}

function applyDecay(database: Database.Database, currentRound: number): void {
  const rows = database.prepare(`
    SELECT event_id, time_span, event_text, occurrence_time, source_event_ids_json,
      source_rounds_json, initial_weight, weight_anchor_round, permanent
    FROM memory_events
    WHERE superseded_by_event_id IS NULL
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
  const transaction = database.transaction(() => {
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
  })
  transaction()
}

export function syncNarrativeMemoryDatabase(input: {
  lifeRunId: string
  currentRound: number
  summaries: readonly NarrativeMemorySummaryInput[]
}): void {
  const database = openDatabase(input.lifeRunId)
  const transaction = database.transaction(() => {
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
  })
  transaction()
  applyDecay(database, input.currentRound)
}

export function searchNarrativeMemoryDatabase(input: {
  lifeRunId: string
  currentRound: number
  terms: readonly string[]
}): NarrativeMemorySearchResult[] {
  const database = openDatabase(input.lifeRunId)
  applyDecay(database, input.currentRound)
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

export function advanceNarrativeMemoryDatabase(input: { lifeRunId: string; currentRound: number }): void {
  const database = openDatabase(input.lifeRunId)
  applyDecay(database, input.currentRound)
}

export function closeNarrativeMemoryDatabaseForTests(): void {
  for (const [databasePath, database] of handles) {
    if (database.open) database.close()
    handles.delete(databasePath)
  }
}
