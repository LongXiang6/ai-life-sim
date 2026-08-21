/**
 * Purpose: Open and migrate the player-content SQLite database.
 * Owner: core:player-content
 * Responsibility: Single atomic schema-version contract, ordered DDL, and database initialization.
 */

import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

declare global {
  var __aiLifePlayerContentDatabase: Database.Database | undefined
}

const PLAYER_CONTENT_SCHEMA_VERSION = 6

export const PLAYER_MAIL_RETENTION_MS = 3 * 24 * 60 * 60 * 1000

function resolveDatabasePath(): string {
  const configured = process.env.PLAYER_CONTENT_DB_PATH?.trim()
  if (configured) return path.resolve(configured)
  return process.env.NODE_ENV === 'production'
    ? '/var/lib/ai-life-sim/player-content.sqlite'
    : path.join(process.cwd(), '.data', 'player-content.sqlite')
}

function enforceFilePermissions(databasePath: string): void {
  if (process.platform === 'win32') return
  for (const target of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      fs.chmodSync(target, 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

function createPortraitMailJobsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS portrait_mail_jobs (
      account_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('awaiting_brief', 'processing', 'ready', 'failed')),
      prompt_sha256 TEXT,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error_code TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, record_id)
    );
    CREATE INDEX IF NOT EXISTS portrait_mail_jobs_status_idx
      ON portrait_mail_jobs(status, updated_at ASC);
  `)
}

function createLeaderboardBestRunsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_best_runs (
      account_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
      rounds INTEGER NOT NULL CHECK (rounds >= 0),
      completed_at INTEGER NOT NULL,
      record_json TEXT NOT NULL,
      portrait_asset_id TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, record_id)
    );
    CREATE INDEX IF NOT EXISTS leaderboard_best_runs_order_idx
      ON leaderboard_best_runs(score DESC, rounds DESC, completed_at ASC, record_id ASC, account_id ASC);
  `)
}

function removeLeaderboardRowsWithoutReviewVerse(database: Database.Database): void {
  const rows = database.prepare(`
    SELECT account_id, record_id, record_json FROM leaderboard_best_runs
  `).all() as Array<{ account_id: string; record_id: string; record_json: string }>
  const remove = database.prepare(`
    DELETE FROM leaderboard_best_runs WHERE account_id = ? AND record_id = ?
  `)
  for (const row of rows) {
    try {
      const record = JSON.parse(row.record_json) as {
        endingReview?: { review?: unknown; verse?: unknown }
      }
      const review = typeof record.endingReview?.review === 'string'
        ? record.endingReview.review.trim()
        : ''
      const verse = typeof record.endingReview?.verse === 'string'
        ? record.endingReview.verse.trim()
        : ''
      if (review && verse) continue
    } catch {
      // Invalid historical projections cannot satisfy the current leaderboard contract.
    }
    remove.run(row.account_id, row.record_id)
  }
}

function removeLegacyScoringLeaderboardRows(database: Database.Database): void {
  const rows = database.prepare(`
    SELECT account_id, record_id, record_json FROM leaderboard_best_runs
  `).all() as Array<{ account_id: string; record_id: string; record_json: string }>
  const remove = database.prepare(`
    DELETE FROM leaderboard_best_runs WHERE account_id = ? AND record_id = ?
  `)
  for (const row of rows) {
    try {
      const record = JSON.parse(row.record_json) as {
        dimensions?: unknown[]
        scoring?: { version?: unknown; source?: unknown }
      }
      if (record.scoring?.version === 2
        && record.scoring.source === 'ai'
        && record.dimensions?.length === 5) continue
    } catch {
      // Historical projections stay in account storage; malformed rows leave the active leaderboard.
    }
    remove.run(row.account_id, row.record_id)
  }
}

function createMailboxTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS diagnostic_mailboxes (
      diagnostic_code TEXT PRIMARY KEY,
      device_provenance_id TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_mail_messages (
      id TEXT PRIMARY KEY,
      audience TEXT NOT NULL CHECK (audience IN ('direct', 'broadcast')),
      kind TEXT NOT NULL CHECK (kind IN ('message', 'portrait')),
      sender_key TEXT NOT NULL,
      sender_label TEXT NOT NULL,
      recipient_key TEXT,
      recipient_label TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      record_id TEXT,
      asset_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      CHECK (
        (audience = 'broadcast' AND recipient_key IS NULL AND recipient_label IS NULL)
        OR (audience = 'direct' AND recipient_key IS NOT NULL AND recipient_label IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS player_mail_messages_inbox_idx
      ON player_mail_messages(recipient_key, expires_at, created_at DESC, id ASC);
    CREATE INDEX IF NOT EXISTS player_mail_messages_broadcast_idx
      ON player_mail_messages(audience, expires_at, created_at DESC, id ASC);
    CREATE INDEX IF NOT EXISTS player_mail_messages_sender_idx
      ON player_mail_messages(sender_key, expires_at, created_at DESC, id ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS player_mail_messages_portrait_idx
      ON player_mail_messages(recipient_key, record_id)
      WHERE kind = 'portrait';

    CREATE TABLE IF NOT EXISTS player_mail_recipient_states (
      message_id TEXT NOT NULL REFERENCES player_mail_messages(id) ON DELETE CASCADE,
      recipient_key TEXT NOT NULL,
      read_at INTEGER,
      deleted_at INTEGER,
      PRIMARY KEY (message_id, recipient_key)
    );
    CREATE INDEX IF NOT EXISTS player_mail_recipient_states_recipient_idx
      ON player_mail_recipient_states(recipient_key, deleted_at, message_id);

    CREATE TABLE IF NOT EXISTS player_mail_talent_attachments (
      message_id TEXT PRIMARY KEY REFERENCES player_mail_messages(id) ON DELETE CASCADE,
      talent_id TEXT NOT NULL,
      talent_json TEXT NOT NULL,
      sender_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'returned')),
      accepted_by_key TEXT,
      accepted_at INTEGER,
      returned_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS player_mail_talent_pending_idx
      ON player_mail_talent_attachments(talent_id)
      WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS player_mail_talent_sender_idx
      ON player_mail_talent_attachments(sender_key, status);

    CREATE TABLE IF NOT EXISTS player_mail_talent_ownership (
      talent_id TEXT PRIMARY KEY,
      owner_key TEXT NOT NULL,
      talent_json TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_mail_talent_owner_idx
      ON player_mail_talent_ownership(owner_key, updated_at, talent_id);
  `)
}

function migrateMailboxSchema(database: Database.Database, version: number): void {
  if (version >= 5) {
    createMailboxTables(database)
    return
  }
  const legacyMail = database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'player_mail_messages'
  `).get()
  if (!legacyMail) {
    createMailboxTables(database)
    return
  }
  database.exec(`
    DROP INDEX IF EXISTS player_mail_messages_account_idx;
    ALTER TABLE player_mail_messages RENAME TO player_mail_messages_v4;
  `)
  createMailboxTables(database)
  database.prepare(`
    INSERT INTO player_mail_messages(
      id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
      title, body, record_id, asset_id, created_at, expires_at
    )
    SELECT id, 'direct', 'portrait', 'system:portrait', '人生画像',
      'account:' || account_id, '当前账号', title, body, record_id, asset_id,
      created_at, created_at + ?
    FROM player_mail_messages_v4
  `).run(PLAYER_MAIL_RETENTION_MS)
  database.prepare(`
    INSERT INTO player_mail_recipient_states(message_id, recipient_key, read_at)
    SELECT id, 'account:' || account_id, read_at
    FROM player_mail_messages_v4
    WHERE read_at IS NOT NULL
  `).run()
  database.exec('DROP TABLE player_mail_messages_v4;')
}

function migrateSchema(database: Database.Database, version: number): void {
  if (version < 2) {
    const hasJobs = database.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'portrait_mail_jobs'
    `).get()
    if (hasJobs) {
      database.exec(`
        DROP INDEX IF EXISTS portrait_mail_jobs_status_idx;
        ALTER TABLE portrait_mail_jobs RENAME TO portrait_mail_jobs_v1;
      `)
      createPortraitMailJobsTable(database)
      database.exec(`
        INSERT INTO portrait_mail_jobs(
          account_id, record_id, status, prompt_sha256, attempts,
          last_error_code, created_at, updated_at
        )
        SELECT account_id, record_id,
          CASE status WHEN 'ready' THEN 'ready' WHEN 'failed' THEN 'failed' ELSE 'awaiting_brief' END,
          prompt_sha256, attempts, last_error_code, created_at, updated_at
        FROM portrait_mail_jobs_v1;
        DROP TABLE portrait_mail_jobs_v1;
      `)
    }
  }
  if (version < 3) {
    const hasLeaderboard = database.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leaderboard_best_runs'
    `).get()
    if (hasLeaderboard) {
      database.exec(`
        DROP INDEX IF EXISTS leaderboard_best_runs_order_idx;
        ALTER TABLE leaderboard_best_runs RENAME TO leaderboard_best_runs_v2;
      `)
      createLeaderboardBestRunsTable(database)
      database.exec(`
        INSERT INTO leaderboard_best_runs(
          account_id, record_id, score, rounds, completed_at,
          record_json, portrait_asset_id, updated_at
        )
        SELECT account_id, record_id, score, rounds, completed_at, '{}', NULL, updated_at
        FROM leaderboard_best_runs_v2;
        DROP TABLE leaderboard_best_runs_v2;
      `)
    }
  }
  if (version < 6) {
    const hasLeaderboard = database.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leaderboard_best_runs'
    `).get()
    if (hasLeaderboard) {
      database.exec(`
        DROP INDEX IF EXISTS leaderboard_best_runs_order_idx;
        ALTER TABLE leaderboard_best_runs RENAME TO leaderboard_best_runs_v5;
      `)
      createLeaderboardBestRunsTable(database)
      database.exec(`
        INSERT INTO leaderboard_best_runs(
          account_id, record_id, score, rounds, completed_at,
          record_json, portrait_asset_id, updated_at
        )
        SELECT account_id, record_id, score, rounds, completed_at,
          record_json, portrait_asset_id, updated_at
        FROM leaderboard_best_runs_v5;
        DROP TABLE leaderboard_best_runs_v5;
      `)
    }
  }
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS player_content_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  const schemaRow = database.prepare(`
    SELECT value FROM player_content_meta WHERE key = 'schema_version'
  `).get() as { value: string } | undefined
  const currentVersion = schemaRow ? Number(schemaRow.value) : 0
  if (schemaRow) {
    const version = currentVersion
    if (!Number.isInteger(version) || version < 1 || version > PLAYER_CONTENT_SCHEMA_VERSION) {
      throw new Error(`不支持的玩家内容数据库 Schema 版本：${schemaRow.value}`)
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS cloud_manual_saves (
      account_id TEXT PRIMARY KEY,
      slot INTEGER NOT NULL CHECK (slot = 1),
      payload_schema_version INTEGER NOT NULL CHECK (payload_schema_version = 1),
      name TEXT NOT NULL,
      world_name TEXT NOT NULL,
      character_name TEXT NOT NULL,
      total_rounds INTEGER NOT NULL CHECK (total_rounds >= 0),
      game_version TEXT NOT NULL,
      saved_at INTEGER NOT NULL,
      payload_gzip BLOB NOT NULL,
      payload_sha256 TEXT NOT NULL,
      compressed_bytes INTEGER NOT NULL CHECK (compressed_bytes > 0),
      uncompressed_bytes INTEGER NOT NULL CHECK (uncompressed_bytes > 0),
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cloud_manual_saves_updated_idx
      ON cloud_manual_saves(updated_at DESC);

    CREATE TABLE IF NOT EXISTS portrait_assets (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_length INTEGER NOT NULL CHECK (byte_length > 0),
      sha256 TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS portrait_assets_account_idx
      ON portrait_assets(account_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS legendary_target_states (
      target_key TEXT PRIMARY KEY,
      completed_run_decisions INTEGER NOT NULL DEFAULT 0 CHECK (completed_run_decisions >= 0),
      cooldown_remaining INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_remaining >= 0),
      seen_record_ids_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS legendary_run_decisions (
      target_life_run_id TEXT PRIMARY KEY,
      target_key TEXT NOT NULL,
      source_account_id TEXT,
      source_record_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('none', 'selected', 'injected')),
      projection_json TEXT,
      selected_at INTEGER NOT NULL,
      injected_round INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS legendary_run_decisions_target_idx
      ON legendary_run_decisions(target_key, selected_at DESC);
    CREATE INDEX IF NOT EXISTS legendary_run_decisions_source_idx
      ON legendary_run_decisions(source_record_id, selected_at DESC);
  `)
  createLeaderboardBestRunsTable(database)
  migrateSchema(database, currentVersion)
  createPortraitMailJobsTable(database)
  migrateMailboxSchema(database, currentVersion)
  removeLeaderboardRowsWithoutReviewVerse(database)
  removeLegacyScoringLeaderboardRows(database)
  database.exec(`
    DELETE FROM leaderboard_best_runs
    WHERE rowid IN (
      SELECT rowid FROM leaderboard_best_runs
      ORDER BY score DESC, rounds DESC, completed_at ASC, record_id ASC, account_id ASC
      LIMIT -1 OFFSET 50
    );
  `)

  database.prepare(`
    INSERT INTO player_content_meta(key, value) VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(PLAYER_CONTENT_SCHEMA_VERSION))
}

export function getPlayerContentDatabase(): Database.Database {
  if (globalThis.__aiLifePlayerContentDatabase?.open) return globalThis.__aiLifePlayerContentDatabase

  const databasePath = resolveDatabasePath()
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 })
  try { fs.chmodSync(path.dirname(databasePath), 0o700) } catch { /* Windows or restricted runtime. */ }

  const database = new Database(databasePath)
  try {
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    database.pragma('busy_timeout = 5000')
    database.pragma('synchronous = NORMAL')
    database.pragma('journal_size_limit = 67108864')
    database.transaction(() => initializeSchema(database))()
    enforceFilePermissions(databasePath)
    globalThis.__aiLifePlayerContentDatabase = database
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

export function closePlayerContentDatabaseForTests(): void {
  globalThis.__aiLifePlayerContentDatabase?.close()
  globalThis.__aiLifePlayerContentDatabase = undefined
}
