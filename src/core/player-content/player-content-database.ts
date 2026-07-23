import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

declare global {
  var __aiLifePlayerContentDatabase: Database.Database | undefined
}

const PLAYER_CONTENT_SCHEMA_VERSION = 2

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

function migrateSchema(database: Database.Database, version: number): void {
  if (version >= 2) return
  const hasJobs = database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'portrait_mail_jobs'
  `).get()
  if (!hasJobs) return
  database.exec(`
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

    CREATE TABLE IF NOT EXISTS leaderboard_best_runs (
      account_id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 98 AND 100),
      rounds INTEGER NOT NULL CHECK (rounds > 100),
      completed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leaderboard_best_runs_order_idx
      ON leaderboard_best_runs(score DESC, rounds DESC, completed_at ASC);

    CREATE TABLE IF NOT EXISTS player_mail_messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('portrait')),
      record_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      asset_id TEXT,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      UNIQUE(account_id, record_id, kind)
    );
    CREATE INDEX IF NOT EXISTS player_mail_messages_account_idx
      ON player_mail_messages(account_id, created_at DESC);

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
  `)
  migrateSchema(database, currentVersion)
  createPortraitMailJobsTable(database)

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
