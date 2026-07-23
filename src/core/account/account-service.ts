import 'server-only'

import { randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'

import { deletePlayerContentForAccount, projectStructuredGameRecords } from '@/core/player-content/player-content-service'

import {
  ACCOUNT_MAX_SESSIONS,
  ACCOUNT_RETENTION_DAYS,
  CloudCharacterDraftSchema,
  CloudGameRecordSchema,
  CloudMythicTalentSchema,
  CloudSettingsSchema,
  type AccountProfile,
  type AccountSessionPayload,
  type CloudAccountSnapshot,
  type CloudGameRecord,
  type CloudSyncRequest,
  type LoginRequest,
  type RegisterRequest,
} from './account-contract'
import {
  createSessionToken,
  decryptApiKey,
  encryptApiKey,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './account-crypto'
import { getAccountDatabase } from './account-database'
import { validateUsernamePolicy } from './username-policy'

const SESSION_DURATION_MS = ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000

interface AccountRow {
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

interface SessionJoinRow extends AccountRow {
  token_hash: string
  expires_at: number
  last_seen_at: number
}

export class AccountServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'AccountServiceError'
  }
}

function parseJson<T>(raw: string, parser: { parse: (value: unknown) => T }): T {
  return parser.parse(JSON.parse(raw))
}

function accountProfile(database: Database.Database, row: AccountRow): AccountProfile {
  const qqLink = database.prepare(`
    SELECT qq FROM account_qq_links WHERE account_id = ?
  `).get(row.id) as { qq: string } | undefined
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

function readSnapshot(database: Database.Database, row: AccountRow): CloudAccountSnapshot {
  const mythicTalents = database.prepare(`
    SELECT data_json FROM account_mythic_talents
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
    mythicTalents: mythicTalents.map((item) => parseJson(item.data_json, CloudMythicTalentSchema)),
    gameRecords: gameRecords.map((item) => parseJson(item.data_json, CloudGameRecordSchema)),
  }
}

function replaceSlots(
  database: Database.Database,
  table: 'account_mythic_talents' | 'account_game_records',
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

function writeCloudData(
  database: Database.Database,
  accountId: string,
  data: Omit<CloudSyncRequest, 'baseRevision'>,
  nextRevision: number,
  now: number,
): void {
  const normalizedApiKey = data.apiKey?.trim() ?? ''
  const shouldSaveApiKey = data.saveApiKey && normalizedApiKey.length > 0
  const encryptedApiKey = shouldSaveApiKey
    ? encryptApiKey(normalizedApiKey, accountId)
    : null
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
    'account_mythic_talents',
    'talent_id',
    accountId,
    data.mythicTalents.map((item) => ({ id: item.id, json: JSON.stringify(item) })),
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

function getAccountByCanonical(database: Database.Database, canonical: string): AccountRow | undefined {
  return database.prepare('SELECT * FROM accounts WHERE username_canonical = ?').get(canonical) as AccountRow | undefined
}

function createSession(database: Database.Database, accountId: string, now: number): string {
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

function sessionPayload(database: Database.Database, row: AccountRow): AccountSessionPayload {
  return {
    authenticated: true,
    account: accountProfile(database, row),
    snapshot: readSnapshot(database, row),
  }
}

function projectAccountRecordsSafely(accountId: string, records: CloudGameRecord[], now: number): void {
  try {
    projectStructuredGameRecords(accountId, records, now)
  } catch (error) {
    console.error('[player-content] 结构化战绩投影失败，账号数据已保留:', error instanceof Error ? error.message : 'unknown')
  }
}

export function enforceAccountRateLimit(
  scopeKey: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): void {
  const database = getAccountDatabase()
  const transaction = database.transaction(() => {
    const row = database.prepare(`
      SELECT window_started_at, request_count FROM account_rate_limits WHERE scope_key = ?
    `).get(scopeKey) as { window_started_at: number; request_count: number } | undefined
    if (!row || row.window_started_at < now - windowMs) {
      database.prepare(`
        INSERT INTO account_rate_limits(scope_key, window_started_at, request_count)
        VALUES (?, ?, 1)
        ON CONFLICT(scope_key) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1
      `).run(scopeKey, now)
      return
    }
    if (row.request_count >= limit) {
      throw new AccountServiceError('请求过于频繁，请稍后再试', 429, 'rate_limited')
    }
    database.prepare('UPDATE account_rate_limits SET request_count = request_count + 1 WHERE scope_key = ?').run(scopeKey)
  })
  transaction()
}

export async function registerAccount(input: RegisterRequest): Promise<{
  token: string
  payload: AccountSessionPayload
}> {
  const database = getAccountDatabase()
  let username: ReturnType<typeof validateUsernamePolicy>
  try {
    username = validateUsernamePolicy(input.username)
  } catch (error) {
    throw new AccountServiceError(
      error instanceof Error ? error.message : '用户名不可用',
      400,
      'username_policy',
    )
  }
  const passwordHash = await hashPassword(input.password)
  const now = Date.now()
  const accountId = randomUUID()
  const transaction = database.transaction(() => {
    if (getAccountByCanonical(database, username.canonical)) {
      throw new AccountServiceError('该用户名已被使用', 409, 'username_exists')
    }
    database.prepare(`
      INSERT INTO accounts(
        id, username, username_canonical, qq, password_hash, settings_json,
        character_draft_json, encrypted_api_key, save_api_key, revision, created_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, ?)
    `).run(
      accountId,
      username.display,
      username.canonical,
      input.qq?.trim() || null,
      passwordHash,
      JSON.stringify(input.initialData.settings),
      JSON.stringify(input.initialData.characterDraft),
      now,
      now,
    )
    writeCloudData(database, accountId, input.initialData, 1, now)
    return createSession(database, accountId, now)
  })

  let token: string
  try {
    token = transaction()
  } catch (error) {
    if (error instanceof AccountServiceError) throw error
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new AccountServiceError('该用户名已被使用', 409, 'username_exists')
    }
    throw error
  }
  const row = database.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as AccountRow
  projectAccountRecordsSafely(accountId, input.initialData.gameRecords, now)
  return { token, payload: sessionPayload(database, row) }
}

export async function loginAccount(input: LoginRequest): Promise<{
  token: string
  payload: AccountSessionPayload
}> {
  const database = getAccountDatabase()
  let username: ReturnType<typeof validateUsernamePolicy>
  try {
    username = validateUsernamePolicy(input.username)
  } catch {
    throw new AccountServiceError('用户名或密码不正确', 401, 'invalid_credentials')
  }
  const row = getAccountByCanonical(database, username.canonical)
  if (!row) {
    await hashPassword(input.password)
    throw new AccountServiceError('用户名或密码不正确', 401, 'invalid_credentials')
  }
  if (!await verifyPassword(input.password, row.password_hash)) {
    throw new AccountServiceError('用户名或密码不正确', 401, 'invalid_credentials')
  }
  const now = Date.now()
  const transaction = database.transaction(() => {
    database.prepare('UPDATE accounts SET last_active_at = ? WHERE id = ?').run(now, row.id)
    return createSession(database, row.id, now)
  })
  const token = transaction()
  const updated = database.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id) as AccountRow
  projectAccountRecordsSafely(row.id, readSnapshot(database, updated).gameRecords, now)
  return { token, payload: sessionPayload(database, updated) }
}

export function getSessionAccount(token: string | undefined): AccountSessionPayload | null {
  if (!token) return null
  const database = getAccountDatabase()
  const tokenHash = hashSessionToken(token)
  const row = database.prepare(`
    SELECT accounts.*, account_sessions.token_hash, account_sessions.expires_at, account_sessions.last_seen_at
    FROM account_sessions
    JOIN accounts ON accounts.id = account_sessions.account_id
    WHERE account_sessions.token_hash = ?
  `).get(tokenHash) as SessionJoinRow | undefined
  if (!row) return null
  const now = Date.now()
  if (row.expires_at <= now) {
    database.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(tokenHash)
    return null
  }
  if (row.last_seen_at <= now - ACTIVITY_WRITE_INTERVAL_MS) {
    const transaction = database.transaction(() => {
      database.prepare('UPDATE account_sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash)
      database.prepare('UPDATE accounts SET last_active_at = ? WHERE id = ?').run(now, row.id)
    })
    transaction()
    row.last_active_at = now
  }
  return sessionPayload(database, row)
}

export function requireSessionAccountId(token: string | undefined): string {
  const session = getSessionAccount(token)
  if (!session) throw new AccountServiceError('登录状态已失效', 401, 'unauthenticated')
  const account = getAccountByCanonical(
    getAccountDatabase(),
    session.account.username.normalize('NFKC').toLocaleLowerCase('zh-CN'),
  )
  if (!account) throw new AccountServiceError('账号不存在', 401, 'unauthenticated')
  return account.id
}

export function syncAccount(token: string, input: CloudSyncRequest): AccountSessionPayload {
  const session = getSessionAccount(token)
  if (!session) throw new AccountServiceError('登录状态已失效', 401, 'unauthenticated')
  const database = getAccountDatabase()
  const account = getAccountByCanonical(database, session.account.username.normalize('NFKC').toLocaleLowerCase('zh-CN'))
  if (!account) throw new AccountServiceError('账号不存在', 401, 'unauthenticated')
  if (account.revision !== input.baseRevision) {
    throw new AccountServiceError('云端数据已更新，请重新同步', 409, 'revision_conflict')
  }
  const now = Date.now()
  const nextRevision = account.revision + 1
  const transaction = database.transaction(() => {
    writeCloudData(database, account.id, input, nextRevision, now)
  })
  transaction()
  projectAccountRecordsSafely(account.id, input.gameRecords, now)
  const updated = database.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id) as AccountRow
  return sessionPayload(database, updated)
}

export function logoutAccount(token: string | undefined): void {
  if (!token) return
  getAccountDatabase().prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(hashSessionToken(token))
}

export async function deleteAccount(token: string, password: string): Promise<void> {
  const session = getSessionAccount(token)
  if (!session) throw new AccountServiceError('登录状态已失效', 401, 'unauthenticated')
  const database = getAccountDatabase()
  const canonical = session.account.username.normalize('NFKC').toLocaleLowerCase('zh-CN')
  const row = getAccountByCanonical(database, canonical)
  if (!row || !await verifyPassword(password, row.password_hash)) {
    throw new AccountServiceError('密码不正确', 401, 'invalid_credentials')
  }
  database.prepare('DELETE FROM accounts WHERE id = ?').run(row.id)
  try {
    deletePlayerContentForAccount(row.id)
  } catch (error) {
    console.error('[player-content] 账号已删除，专用内容等待清理器回收:', error instanceof Error ? error.message : 'unknown')
  }
}

export function cleanupInactiveAccounts(now = Date.now()): { deletedAccounts: number } {
  const database = getAccountDatabase()
  const cutoff = now - SESSION_DURATION_MS
  const staleAccounts = database.prepare(`
    SELECT id FROM accounts WHERE last_active_at < ?
  `).all(cutoff) as Array<{ id: string }>
  const transaction = database.transaction(() => {
    database.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now)
    database.prepare('DELETE FROM account_rate_limits WHERE window_started_at < ?').run(now - 24 * 60 * 60 * 1000)
    database.prepare('DELETE FROM account_qq_link_codes WHERE expires_at <= ?').run(now)
    database.prepare('DELETE FROM qq_bot_request_nonces WHERE seen_at < ?').run(now - 10 * 60 * 1000)
    const result = database.prepare('DELETE FROM accounts WHERE last_active_at < ?').run(cutoff)
    return { deletedAccounts: result.changes }
  })
  const result = transaction()
  for (const account of staleAccounts) {
    try {
      deletePlayerContentForAccount(account.id)
    } catch (error) {
      console.error('[player-content] 过期账号内容等待清理器回收:', error instanceof Error ? error.message : 'unknown')
    }
  }
  return result
}
