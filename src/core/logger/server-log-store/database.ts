/**
 * Purpose: Own server-log SQLite paths, schema initialization, handles, and file permissions.
 * Owner: core:logger
 * Responsibility: Database lifecycle only; entry writes, queries, and retention run in sibling components.
 */

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

declare global {
  var __aiLifeLogDatabase: Database.Database | undefined
  var __aiLifeLogDatabasePath: string | undefined
}

export function getServerLogDatabasePath(): string {
  const configuredDatabase = process.env.AI_LOG_DB_PATH?.trim()
  if (configuredDatabase) return path.resolve(configuredDatabase)
  const configuredDirectory = process.env.AI_LOG_DIR?.trim()
  if (configuredDirectory) return path.join(path.resolve(configuredDirectory), 'logs.sqlite')
  return process.env.NODE_ENV === 'production'
    ? '/var/lib/ai-life-sim/logs.sqlite'
    : path.join(process.cwd(), '.data', 'logs.sqlite')
}

export function getServerLogRoot(): string {
  return path.dirname(getServerLogDatabasePath())
}

export function getServerLogArchiveDatabasePath(): string {
  return path.join(getServerLogRoot(), 'logs-archive.sqlite')
}

export function enforceDatabaseFilePermissions(databasePath: string): void {
  if (process.platform === 'win32') return
  for (const target of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      fs.chmodSync(target, 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS log_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      client_timestamp INTEGER,
      entry_type TEXT NOT NULL,
      category TEXT,
      level TEXT,
      module TEXT,
      message TEXT,
      event TEXT,
      request_id TEXT,
      source_ip TEXT NOT NULL DEFAULT 'unknown',
      source_id TEXT NOT NULL DEFAULT 'ip-unknown',
      diagnostic_code TEXT,
      device_provenance_id TEXT,
      is_registered INTEGER NOT NULL DEFAULT 0 CHECK (is_registered IN (0, 1)),
      account_id TEXT,
      username TEXT,
      feedback_id TEXT,
      round INTEGER,
      age REAL,
      era TEXT,
      provider TEXT,
      model TEXT,
      call_kind TEXT,
      strategy TEXT,
      status INTEGER,
      prompt TEXT,
      response TEXT,
      error TEXT,
      stack TEXT,
      meta_json TEXT,
      payload_json TEXT
    );

    CREATE INDEX IF NOT EXISTS log_entries_created_idx
      ON log_entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_type_created_idx
      ON log_entries(entry_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_category_created_idx
      ON log_entries(category, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_request_idx
      ON log_entries(request_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_account_idx
      ON log_entries(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_diagnostic_idx
      ON log_entries(diagnostic_code, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_feedback_idx
      ON log_entries(feedback_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS diagnostic_identities (
      code TEXT PRIMARY KEY,
      issued_at INTEGER NOT NULL,
      format_version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS device_provenance_identities (
      id TEXT PRIMARY KEY,
      issued_at INTEGER NOT NULL,
      format_version INTEGER NOT NULL
    );

    INSERT INTO log_meta(key, value) VALUES ('schema_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    INSERT INTO log_meta(key, value) VALUES ('storage_format', 'plaintext-sqlite')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `)
  const logColumns = database.pragma('table_info(log_entries)') as Array<{ name: string }>
  if (!logColumns.some((column) => column.name === 'device_provenance_id')) {
    database.exec('ALTER TABLE log_entries ADD COLUMN device_provenance_id TEXT')
  }
  database.exec(
    'CREATE INDEX IF NOT EXISTS log_entries_device_provenance_idx ON log_entries(device_provenance_id, created_at DESC)',
  )
}

export function prepareServerLogArchiveDatabase(): string {
  const archivePath = getServerLogArchiveDatabasePath()
  fs.mkdirSync(path.dirname(archivePath), { recursive: true, mode: 0o700 })
  const archive = new Database(archivePath)
  try {
    archive.pragma('journal_mode = WAL')
    archive.pragma('busy_timeout = 5000')
    archive.transaction(() => initializeSchema(archive))()
    enforceDatabaseFilePermissions(archivePath)
  } finally {
    archive.close()
  }
  return archivePath
}

export function getServerLogDatabase(): Database.Database {
  const databasePath = getServerLogDatabasePath()
  if (globalThis.__aiLifeLogDatabase?.open && globalThis.__aiLifeLogDatabasePath === databasePath) {
    return globalThis.__aiLifeLogDatabase
  }
  if (globalThis.__aiLifeLogDatabase?.open) globalThis.__aiLifeLogDatabase.close()
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 })
  try { fs.chmodSync(path.dirname(databasePath), 0o700) } catch { /* Windows or restricted runtime. */ }

  const database = new Database(databasePath)
  try {
    database.pragma('journal_mode = WAL')
    database.pragma('busy_timeout = 5000')
    database.pragma('synchronous = NORMAL')
    database.pragma('journal_size_limit = 67108864')
    database.transaction(() => initializeSchema(database))()
    enforceDatabaseFilePermissions(databasePath)
    globalThis.__aiLifeLogDatabase = database
    globalThis.__aiLifeLogDatabasePath = databasePath
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

export function closeServerLogDatabaseForTests(): void {
  globalThis.__aiLifeLogDatabase?.close()
  globalThis.__aiLifeLogDatabase = undefined
  globalThis.__aiLifeLogDatabasePath = undefined
}
