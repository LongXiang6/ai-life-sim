import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import { DEFAULT_CLOUD_CHARACTER_DRAFT } from './account-contract'

declare global {
  var __aiLifeAccountDatabase: Database.Database | undefined
}

export function getAccountDatabasePath(): string {
  const configured = process.env.ACCOUNT_DB_PATH?.trim()
  if (configured) return path.resolve(configured)
  return process.env.NODE_ENV === 'production'
    ? '/var/lib/ai-life-sim/accounts.sqlite'
    : path.join(process.cwd(), '.data', 'accounts.sqlite')
}

function enforceDatabaseFilePermissions(databasePath: string): void {
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
    CREATE TABLE IF NOT EXISTS account_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const schemaRow = database.prepare(`
    SELECT value FROM account_meta WHERE key = 'schema_version'
  `).get() as { value: string } | undefined
  if (schemaRow) {
    const schemaVersion = Number(schemaRow.value)
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > 5) {
      throw new Error(`不支持的账号数据库 Schema 版本：${schemaRow.value}`)
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_canonical TEXT NOT NULL UNIQUE,
      qq TEXT,
      password_hash TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      character_draft_json TEXT NOT NULL,
      encrypted_api_key TEXT,
      save_api_key INTEGER NOT NULL DEFAULT 0 CHECK (save_api_key IN (0, 1)),
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_sessions_account_idx
      ON account_sessions(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx
      ON account_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS account_mythic_talents (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 10),
      talent_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, slot),
      UNIQUE (account_id, talent_id)
    );

    CREATE TABLE IF NOT EXISTS account_game_records (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 10),
      record_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, slot),
      UNIQUE (account_id, record_id)
    );

    CREATE TABLE IF NOT EXISTS account_rate_limits (
      scope_key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_qq_links (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      qq TEXT NOT NULL UNIQUE CHECK (qq GLOB '[1-9][0-9]*' AND length(qq) BETWEEN 5 AND 12),
      linked_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_qq_link_codes (
      code_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_qq_link_codes_expiry_idx
      ON account_qq_link_codes(expires_at);

    CREATE TABLE IF NOT EXISTS qq_bot_request_nonces (
      nonce_hash TEXT PRIMARY KEY,
      seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS qq_bot_request_nonces_seen_idx
      ON qq_bot_request_nonces(seen_at);

    CREATE TABLE IF NOT EXISTS qq_point_accounts (
      qq TEXT PRIMARY KEY CHECK (qq GLOB '[1-9][0-9]*' AND length(qq) BETWEEN 5 AND 12),
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      total_earned INTEGER NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qq_point_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qq TEXT NOT NULL REFERENCES qq_point_accounts(qq) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      reason TEXT NOT NULL,
      reference_id TEXT NOT NULL UNIQUE,
      counterparty_qq TEXT,
      group_key TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS qq_point_ledger_qq_created_idx
      ON qq_point_ledger(qq, created_at DESC);
    CREATE INDEX IF NOT EXISTS qq_point_ledger_group_created_idx
      ON qq_point_ledger(group_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS qq_point_checkins (
      qq TEXT NOT NULL REFERENCES qq_point_accounts(qq) ON DELETE CASCADE,
      local_date TEXT NOT NULL,
      streak INTEGER NOT NULL CHECK (streak > 0),
      points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (qq, local_date)
    );
    CREATE INDEX IF NOT EXISTS qq_point_checkins_date_idx
      ON qq_point_checkins(local_date, created_at DESC);

    CREATE TABLE IF NOT EXISTS qq_point_group_memberships (
      group_key TEXT NOT NULL,
      qq TEXT NOT NULL REFERENCES qq_point_accounts(qq) ON DELETE CASCADE,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (group_key, qq)
    );
    CREATE INDEX IF NOT EXISTS qq_point_group_memberships_seen_idx
      ON qq_point_group_memberships(group_key, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS qq_point_operations (
      idempotency_key TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS qq_point_operations_created_idx
      ON qq_point_operations(created_at);

    CREATE INDEX IF NOT EXISTS accounts_last_active_idx
      ON accounts(last_active_at);

  `)
  const accountColumns = database.pragma('table_info(accounts)') as Array<{ name: string }>
  if (!accountColumns.some((column) => column.name === 'character_draft_json')) {
    const defaultDraft = JSON.stringify(DEFAULT_CLOUD_CHARACTER_DRAFT).replaceAll("'", "''")
    database.exec(`
      ALTER TABLE accounts
      ADD COLUMN character_draft_json TEXT NOT NULL DEFAULT '${defaultDraft}'
    `)
  }

  const pointOperationColumns = database.pragma('table_info(qq_point_operations)') as Array<{ name: string }>
  if (!pointOperationColumns.some((column) => column.name === 'request_hash')) {
    database.exec(`
      ALTER TABLE qq_point_operations
      ADD COLUMN request_hash TEXT NOT NULL DEFAULT ''
    `)
  }

  database.prepare(`
    INSERT INTO account_meta(key, value) VALUES ('schema_version', '5')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run()
}

export function getAccountDatabase(): Database.Database {
  if (globalThis.__aiLifeAccountDatabase?.open) return globalThis.__aiLifeAccountDatabase

  const databasePath = getAccountDatabasePath()
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
    enforceDatabaseFilePermissions(databasePath)

    globalThis.__aiLifeAccountDatabase = database
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

export function closeAccountDatabaseForTests(): void {
  globalThis.__aiLifeAccountDatabase?.close()
  globalThis.__aiLifeAccountDatabase = undefined
}
