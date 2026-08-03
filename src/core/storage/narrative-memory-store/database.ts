/**
 * Purpose: Own per-life narrative-memory SQLite paths, schema, handles, and test shutdown.
 * Owner: core:storage
 * Responsibility: Database lifecycle only; memory synchronization and querying remain separate.
 */

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

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

export function openNarrativeMemoryDatabase(lifeRunId: string): Database.Database {
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

export function closeNarrativeMemoryDatabaseForTests(): void {
  for (const [databasePath, database] of handles) {
    if (database.open) database.close()
    handles.delete(databasePath)
  }
}
