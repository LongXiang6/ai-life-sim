/**
 * Purpose: Own QQ link-code creation, account binding, status reads, and unlink operations.
 * Owner: core:account
 * Responsibility: Account-to-QQ binding state only; signed request authentication remains separate.
 */

import { createHash, randomBytes } from 'node:crypto'

import type Database from 'better-sqlite3'

import { ACCOUNT_RETENTION_DAYS } from '../account-contract'
import { getAccountDatabase } from '../account-database'
import { AccountServiceError, enforceAccountRateLimit, getSessionAccount } from '../account-service'
import { QqBotQqSchema, type QqBotAccountStatus, type QqLinkCodePayload } from './contracts'

const QQ_LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const QQ_LINK_CODE_LENGTH = 10
const QQ_LINK_CODE_TTL_MS = 10 * 60 * 1000

interface AccountIdentityRow {
  id: string
  username: string
  last_active_at: number
}

function normalizeLinkCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/gu, '')
}

function hashLinkCode(value: string): string {
  return createHash('sha256').update(normalizeLinkCode(value)).digest('hex')
}

function generateLinkCode(): string {
  const bytes = randomBytes(QQ_LINK_CODE_LENGTH)
  const compact = Array.from(bytes, (value) => QQ_LINK_CODE_ALPHABET[value & 31]).join('')
  return `${compact.slice(0, 5)}-${compact.slice(5)}`
}

function requireSessionAccountId(token: string | undefined): string {
  const session = getSessionAccount(token)
  if (!session) throw new AccountServiceError('登录状态已失效', 401, 'unauthenticated')
  const canonical = session.account.username.normalize('NFKC').toLocaleLowerCase('zh-CN')
  const row = getAccountDatabase().prepare('SELECT id FROM accounts WHERE username_canonical = ?')
    .get(canonical) as { id: string } | undefined
  if (!row) throw new AccountServiceError('账号不存在', 401, 'unauthenticated')
  return row.id
}

export function createAccountQqLinkCode(
  token: string | undefined,
  now = Date.now(),
): QqLinkCodePayload {
  const accountId = requireSessionAccountId(token)
  const database = getAccountDatabase()
  const expiresAt = now + QQ_LINK_CODE_TTL_MS
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateLinkCode()
    try {
      database.transaction(() => {
        database.prepare('DELETE FROM account_qq_link_codes WHERE expires_at <= ?').run(now)
        database.prepare(`
          INSERT INTO account_qq_link_codes(code_hash, account_id, created_at, expires_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(account_id) DO UPDATE SET
            code_hash = excluded.code_hash,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `).run(hashLinkCode(code), accountId, now, expiresAt)
      })()
      return { code, expiresAt }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint failed')) throw error
    }
  }
  throw new AccountServiceError('暂时无法生成绑定码，请稍后重试', 503, 'link_code_unavailable')
}

export function unlinkAccountQq(token: string | undefined): void {
  const accountId = requireSessionAccountId(token)
  getAccountDatabase().prepare('DELETE FROM account_qq_links WHERE account_id = ?').run(accountId)
}

function accountStatusByQq(database: Database.Database, qq: string): QqBotAccountStatus | null {
  const row = database.prepare(`
    SELECT accounts.id, accounts.username, accounts.last_active_at, account_qq_links.linked_at
    FROM account_qq_links
    JOIN accounts ON accounts.id = account_qq_links.account_id
    WHERE account_qq_links.qq = ?
  `).get(qq) as (AccountIdentityRow & { linked_at: number }) | undefined
  if (!row) return null
  const talents = database.prepare(
    'SELECT COUNT(*) AS count FROM account_mythic_talents WHERE account_id = ?',
  ).get(row.id) as { count: number }
  const records = database.prepare(
    'SELECT COUNT(*) AS count FROM account_game_records WHERE account_id = ?',
  ).get(row.id) as { count: number }
  const points = database.prepare('SELECT balance FROM qq_point_accounts WHERE qq = ?')
    .get(qq) as { balance: number } | undefined
  return {
    linked: true,
    username: row.username,
    linkedAt: row.linked_at,
    lastActiveAt: row.last_active_at,
    scheduledDeletionAt: row.last_active_at + ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    reincarnationTalentCount: talents.count,
    gameRecordCount: records.count,
    pointsBalance: points?.balance ?? 0,
  }
}

export function bindQqAccount(qq: string, code: string, now = Date.now()): QqBotAccountStatus {
  const normalizedQq = QqBotQqSchema.parse(qq)
  enforceAccountRateLimit(`qq-bot-bind:${normalizedQq}`, 10, 60 * 60 * 1000, now)
  const database = getAccountDatabase()
  const status = database.transaction(() => {
    database.prepare('DELETE FROM account_qq_link_codes WHERE expires_at <= ?').run(now)
    const linkCode = database.prepare(`
      SELECT account_id FROM account_qq_link_codes WHERE code_hash = ? AND expires_at > ?
    `).get(hashLinkCode(code), now) as { account_id: string } | undefined
    if (!linkCode) throw new AccountServiceError('绑定码无效或已过期', 400, 'invalid_link_code')
    database.prepare('DELETE FROM account_qq_links WHERE qq = ? OR account_id = ?')
      .run(normalizedQq, linkCode.account_id)
    database.prepare('INSERT INTO account_qq_links(account_id, qq, linked_at) VALUES (?, ?, ?)')
      .run(linkCode.account_id, normalizedQq, now)
    database.prepare('DELETE FROM account_qq_link_codes WHERE account_id = ?').run(linkCode.account_id)
    return accountStatusByQq(database, normalizedQq)
  })()
  if (!status) throw new AccountServiceError('账号绑定失败', 503, 'account_link_failed')
  return status
}

export function readQqBotAccountStatus(qq: string, now = Date.now()): QqBotAccountStatus | null {
  const normalizedQq = QqBotQqSchema.parse(qq)
  enforceAccountRateLimit(`qq-bot-status:${normalizedQq}`, 30, 60 * 1000, now)
  return accountStatusByQq(getAccountDatabase(), normalizedQq)
}

export function unlinkQqBotAccount(qq: string): boolean {
  const normalizedQq = QqBotQqSchema.parse(qq)
  return getAccountDatabase().prepare('DELETE FROM account_qq_links WHERE qq = ?')
    .run(normalizedQq).changes > 0
}
