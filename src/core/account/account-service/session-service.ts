/**
 * Purpose: Own account login, session lookup, trusted identity projection, and logout.
 * Owner: core:account
 * Responsibility: Session lifecycle only; registration, cloud sync, and cleanup remain separate.
 */

import type { AccountSessionPayload, LoginRequest } from '../account-contract'
import { hashPassword, hashSessionToken, verifyPassword } from '../account-crypto'
import { getAccountDatabase } from '../account-database'
import { validateUsernamePolicy } from '../username-policy'
import { AccountServiceError } from './error'
import {
  ACTIVITY_WRITE_INTERVAL_MS,
  createSession,
  getAccountByCanonical,
  projectAccountRecordsSafely,
  readSnapshot,
  sessionPayload,
  type AccountRow,
  type SessionJoinRow,
} from './repository'

export interface SessionAccountIdentity {
  accountId: string
  username: string
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
  const token = database.transaction(() => {
    database.prepare('UPDATE accounts SET last_active_at = ? WHERE id = ?').run(now, row.id)
    return createSession(database, row.id, now)
  })()
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
    database.transaction(() => {
      database.prepare('UPDATE account_sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash)
      database.prepare('UPDATE accounts SET last_active_at = ? WHERE id = ?').run(now, row.id)
    })()
    row.last_active_at = now
  }
  return sessionPayload(database, row)
}

export function getSessionAccountIdentity(token: string | undefined): SessionAccountIdentity | null {
  if (!token) return null
  const database = getAccountDatabase()
  const tokenHash = hashSessionToken(token)
  const row = database.prepare(`
    SELECT accounts.id, accounts.username, account_sessions.expires_at
    FROM account_sessions
    JOIN accounts ON accounts.id = account_sessions.account_id
    WHERE account_sessions.token_hash = ?
  `).get(tokenHash) as { id: string; username: string; expires_at: number } | undefined
  if (!row) return null
  if (row.expires_at <= Date.now()) {
    database.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(tokenHash)
    return null
  }
  return { accountId: row.id, username: row.username }
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

export function logoutAccount(token: string | undefined): void {
  if (!token) return
  getAccountDatabase().prepare('DELETE FROM account_sessions WHERE token_hash = ?')
    .run(hashSessionToken(token))
}
