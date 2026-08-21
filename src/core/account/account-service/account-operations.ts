/**
 * Purpose: Own account registration, cloud synchronization, deletion, and retention cleanup.
 * Owner: core:account
 * Responsibility: Account aggregate lifecycle only; session lookup and rate limiting remain separate.
 */

import { randomUUID } from 'node:crypto'

import { deletePlayerContentForAccount } from '@/core/player-content/player-content-service'
import {
  reconcileAccountMailTalents,
  type PlayerMailboxIdentity,
} from '@/core/player-content/player-mail-service'

import type {
  AccountSessionPayload,
  CloudSyncRequest,
  RegisterRequest,
} from '../account-contract'
import { hashPassword, verifyPassword } from '../account-crypto'
import { getAccountDatabase } from '../account-database'
import { validateUsernamePolicy } from '../username-policy'
import { AccountServiceError } from './error'
import {
  createSession,
  getAccountByCanonical,
  projectAccountRecordsSafely,
  SESSION_DURATION_MS,
  sessionPayload,
  writeCloudData,
  type AccountRow,
} from './repository'
import { getSessionAccount } from './session-service'

export async function registerAccount(
  input: RegisterRequest,
  mailboxIdentity: PlayerMailboxIdentity = {},
): Promise<{ token: string; payload: AccountSessionPayload }> {
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
  if (getAccountByCanonical(database, username.canonical)) {
    throw new AccountServiceError('该用户名已被使用', 409, 'username_exists')
  }
  const accountId = randomUUID()
  const initialData = {
    ...input.initialData,
    reincarnationTalents: reconcileAccountMailTalents({
      accountId,
      talents: input.initialData.reincarnationTalents,
      diagnosticCode: mailboxIdentity.diagnosticCode,
      deviceProvenanceId: mailboxIdentity.deviceProvenanceId,
      now,
    }),
  }
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
    writeCloudData(database, accountId, initialData, 1, now)
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
  projectAccountRecordsSafely(accountId, initialData.gameRecords, now)
  return { token, payload: sessionPayload(database, row) }
}

export function syncAccount(
  token: string,
  input: CloudSyncRequest,
  mailboxIdentity: PlayerMailboxIdentity = {},
): AccountSessionPayload {
  const session = getSessionAccount(token)
  if (!session) throw new AccountServiceError('登录状态已失效', 401, 'unauthenticated')
  const database = getAccountDatabase()
  const canonical = session.account.username.normalize('NFKC').toLocaleLowerCase('zh-CN')
  const account = getAccountByCanonical(database, canonical)
  if (!account) throw new AccountServiceError('账号不存在', 401, 'unauthenticated')
  if (account.revision !== input.baseRevision) {
    throw new AccountServiceError('云端数据已更新，请重新同步', 409, 'revision_conflict')
  }
  const now = Date.now()
  const reconciledInput = {
    ...input,
    reincarnationTalents: reconcileAccountMailTalents({
      accountId: account.id,
      talents: input.reincarnationTalents,
      diagnosticCode: mailboxIdentity.diagnosticCode,
      deviceProvenanceId: mailboxIdentity.deviceProvenanceId,
      now,
    }),
  }
  database.transaction(() => {
    writeCloudData(database, account.id, reconciledInput, account.revision + 1, now)
  })()
  projectAccountRecordsSafely(account.id, reconciledInput.gameRecords, now)
  const updated = database.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id) as AccountRow
  return sessionPayload(database, updated)
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
    console.error(
      '[player-content] 账号已删除，专用内容等待清理器回收:',
      error instanceof Error ? error.message : 'unknown',
    )
  }
}

export function cleanupInactiveAccounts(now = Date.now()): { deletedAccounts: number } {
  const database = getAccountDatabase()
  const cutoff = now - SESSION_DURATION_MS
  const staleAccounts = database.prepare('SELECT id FROM accounts WHERE last_active_at < ?')
    .all(cutoff) as Array<{ id: string }>
  const result = database.transaction(() => {
    database.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now)
    database.prepare('DELETE FROM account_rate_limits WHERE window_started_at < ?')
      .run(now - 24 * 60 * 60 * 1000)
    database.prepare('DELETE FROM account_qq_link_codes WHERE expires_at <= ?').run(now)
    database.prepare('DELETE FROM qq_bot_request_nonces WHERE seen_at < ?').run(now - 10 * 60 * 1000)
    const deletion = database.prepare('DELETE FROM accounts WHERE last_active_at < ?').run(cutoff)
    return { deletedAccounts: deletion.changes }
  })()
  for (const account of staleAccounts) {
    try {
      deletePlayerContentForAccount(account.id)
    } catch (error) {
      console.error(
        '[player-content] 过期账号内容等待清理器回收:',
        error instanceof Error ? error.message : 'unknown',
      )
    }
  }
  return result
}
