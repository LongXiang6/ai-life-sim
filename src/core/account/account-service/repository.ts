/**
 * Purpose: Map account database rows to cloud snapshots and persist account-owned cloud data.
 * Owner: core:account
 * Responsibility: Account row access, snapshot projection, slot replacement, and session creation only.
 */

import type Database from 'better-sqlite3'

import { projectStructuredGameRecords } from '@/core/player-content/player-content-service'

import {
  ACCOUNT_MAX_SESSIONS,
  ACCOUNT_RETENTION_DAYS,
  CloudCharacterDraftSchema,
  CloudGameRecordSchema,
  ReincarnationTalentSchema,
  CloudSettingsSchema,
  type AccountProfile,
  type AccountSessionPayload,
  type CloudAccountSnapshot,
  type CloudGameRecord,
  type CloudSyncRequest,
} from '../account-contract'
import {
  createSessionToken,
  decryptApiKey,
  encryptApiKey,
  hashSessionToken,
} from '../account-crypto'

export const SESSION_DURATION_MS = ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000
export const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000

export interface AccountRow {
  id: string
  username: string
  username_canonical: string
  qq: string | null
  password_hash: string
  settings_json: string
  character_draft_json: string
  encrypted_api_key: string | null
  save_api_key: number
  revision: number
  created_at: number
  last_active_at: number
}

interface JsonRow {
  data_json: string
}

export interface SessionJoinRow extends AccountRow {
  token_hash: string
  expires_at: number
  last_seen_at: number
}

function parseJson<T>(raw: string, parser: { parse: (value: unknown) => T }): T {
  return parser.parse(JSON.parse(raw))
}

function accountProfile(database: Database.Database, row: AccountRow): AccountProfile {
  const qqLink = database.prepare('SELECT qq FROM account_qq_links WHERE account_id = ?')
    .get(row.id) as { qq: string } | undefined
  const pointAccount = qqLink
    ? database.prepare('SELECT balance FROM qq_point_accounts WHERE qq = ?')
      .get(qqLink.qq) as { balance: number } | undefined
    : undefined
  return {
    username: row.username,
    qq: row.qq,
    linkedQq: qqLink?.qq ?? null,
    pointsBalance: pointAccount?.balance ?? 0,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  }
}

export function readSnapshot(database: Database.Database, row: AccountRow): CloudAccountSnapshot {
  const reincarnationTalents = database.prepare(`
    SELECT data_json FROM account_reincarnation_talents
    WHERE account_id = ? ORDER BY slot ASC
  `).all(row.id) as JsonRow[]
  const gameRecords = database.prepare(`
    SELECT data_json FROM account_game_records
    WHERE account_id = ? ORDER BY slot ASC
  `).all(row.id) as JsonRow[]
  return {
    revision: row.revision,
    settings: parseJson(row.settings_json, CloudSettingsSchema),
    saveApiKey: row.save_api_key === 1,
    apiKey: row.save_api_key === 1 && row.encrypted_api_key
      ? decryptApiKey(row.encrypted_api_key, row.id)
      : null,
    characterDraft: parseJson(row.character_draft_json, CloudCharacterDraftSchema),
    reincarnationTalents: reincarnationTalents.map(({ data_json }) => parseJson(data_json, ReincarnationTalentSchema)),
    gameRecords: gameRecords.map(({ data_json }) => parseJson(data_json, CloudGameRecordSchema)),
  }
}

function replaceSlots(
  database: Database.Database,
  table: 'account_reincarnation_talents' | 'account_game_records',
  idColumn: 'talent_id' | 'record_id',
  accountId: string,
  values: Array<{ id: string; json: string }>,
  now: number,
): void {
  database.prepare(`DELETE FROM ${table} WHERE account_id = ?`).run(accountId)
  const insert = database.prepare(`
    INSERT INTO ${table}(account_id, slot, ${idColumn}, data_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  values.forEach((value, index) => insert.run(accountId, index + 1, value.id, value.json, now))
}

export function writeCloudData(
  database: Database.Database,
  accountId: string,
  data: Omit<CloudSyncRequest, 'baseRevision'>,
  nextRevision: number,
  now: number,
): void {
  const normalizedApiKey = data.apiKey?.trim() ?? ''
  const shouldSaveApiKey = data.saveApiKey && normalizedApiKey.length > 0
  const encryptedApiKey = shouldSaveApiKey ? encryptApiKey(normalizedApiKey, accountId) : null
  database.prepare(`
    UPDATE accounts
    SET settings_json = ?, character_draft_json = ?, encrypted_api_key = ?,
        save_api_key = ?, revision = ?, last_active_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(data.settings),
    JSON.stringify(data.characterDraft),
    encryptedApiKey,
    shouldSaveApiKey ? 1 : 0,
    nextRevision,
    now,
    accountId,
  )
  replaceSlots(
    database,
    'account_reincarnation_talents',
    'talent_id',
    accountId,
    data.reincarnationTalents.map((item) => ({ id: item.id, json: JSON.stringify(item) })),
    now,
  )
  replaceSlots(
    database,
    'account_game_records',
    'record_id',
    accountId,
    data.gameRecords.map((item) => ({ id: item.recordId, json: JSON.stringify(item) })),
    now,
  )
}

export function getAccountByCanonical(
  database: Database.Database,
  canonical: string,
): AccountRow | undefined {
  return database.prepare('SELECT * FROM accounts WHERE username_canonical = ?')
    .get(canonical) as AccountRow | undefined
}

export function createSession(database: Database.Database, accountId: string, now: number): string {
  const token = createSessionToken()
  database.prepare(`
    INSERT INTO account_sessions(token_hash, account_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hashSessionToken(token), accountId, now, now + SESSION_DURATION_MS, now)
  const stale = database.prepare(`
    SELECT token_hash FROM account_sessions
    WHERE account_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?
  `).all(accountId, ACCOUNT_MAX_SESSIONS) as Array<{ token_hash: string }>
  const remove = database.prepare('DELETE FROM account_sessions WHERE token_hash = ?')
  stale.forEach((row) => remove.run(row.token_hash))
  return token
}

export function sessionPayload(
  database: Database.Database,
  row: AccountRow,
): AccountSessionPayload {
  return {
    authenticated: true,
    account: accountProfile(database, row),
    snapshot: readSnapshot(database, row),
  }
}

export function projectAccountRecordsSafely(
  accountId: string,
  records: CloudGameRecord[],
  now: number,
): void {
  try {
    projectStructuredGameRecords(accountId, records, now)
  } catch (error) {
    console.error(
      '[player-content] 结构化战绩投影失败，账号数据已保留:',
      error instanceof Error ? error.message : 'unknown',
    )
  }
}
