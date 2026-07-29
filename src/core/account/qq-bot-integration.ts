import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

import type Database from 'better-sqlite3'
import { z } from 'zod'

import changelogIndex from '../../../public/changelog-index.json'
import { ENGINE_VERSION } from '@/core/version'

import { ACCOUNT_RETENTION_DAYS } from './account-contract'
import { getAccountDatabase } from './account-database'
import { AccountServiceError, enforceAccountRateLimit, getSessionAccount } from './account-service'

const QQ_LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const QQ_LINK_CODE_LENGTH = 10
const QQ_LINK_CODE_TTL_MS = 10 * 60 * 1000
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000
const NONCE_RETENTION_MS = 10 * 60 * 1000

export const QqBotQqSchema = z.string().regex(/^[1-9][0-9]{4,11}$/u, 'QQ 号格式无效')
export const QqBotBindRequestSchema = z.object({
  qq: QqBotQqSchema,
  code: z.string().trim().min(8).max(20),
}).strict()
export const QqBotAccountRequestSchema = z.object({ qq: QqBotQqSchema }).strict()

interface AccountIdentityRow {
  id: string
  username: string
  last_active_at: number
}

export interface QqLinkCodePayload {
  code: string
  expiresAt: number
}

export interface QqBotAccountStatus {
  linked: true
  username: string
  linkedAt: number
  lastActiveAt: number
  scheduledDeletionAt: number
  reincarnationTalentCount: number
  gameRecordCount: number
  pointsBalance: number
}

export interface QqBotProjectStatus {
  project: 'AI Life Sim'
  version: string
  latestUpdates: string[]
  capabilities: {
    optionalAccount: true
    cloudSync: true
    verifiedQqBinding: true
    sharedPoints: true
  }
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
  const row = getAccountDatabase().prepare(`
    SELECT id FROM accounts WHERE username_canonical = ?
  `).get(canonical) as { id: string } | undefined
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

function accountStatusByQq(
  database: Database.Database,
  qq: string,
): QqBotAccountStatus | null {
  const row = database.prepare(`
    SELECT accounts.id, accounts.username, accounts.last_active_at, account_qq_links.linked_at
    FROM account_qq_links
    JOIN accounts ON accounts.id = account_qq_links.account_id
    WHERE account_qq_links.qq = ?
  `).get(qq) as (AccountIdentityRow & { linked_at: number }) | undefined
  if (!row) return null
  const reincarnationTalentCount = database.prepare(`
    SELECT COUNT(*) AS count FROM account_mythic_talents WHERE account_id = ?
  `).get(row.id) as { count: number }
  const gameRecordCount = database.prepare(`
    SELECT COUNT(*) AS count FROM account_game_records WHERE account_id = ?
  `).get(row.id) as { count: number }
  const pointAccount = database.prepare(`
    SELECT balance FROM qq_point_accounts WHERE qq = ?
  `).get(qq) as { balance: number } | undefined
  return {
    linked: true,
    username: row.username,
    linkedAt: row.linked_at,
    lastActiveAt: row.last_active_at,
    scheduledDeletionAt: row.last_active_at + ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    reincarnationTalentCount: reincarnationTalentCount.count,
    gameRecordCount: gameRecordCount.count,
    pointsBalance: pointAccount?.balance ?? 0,
  }
}

export function bindQqAccount(
  qq: string,
  code: string,
  now = Date.now(),
): QqBotAccountStatus {
  const normalizedQq = QqBotQqSchema.parse(qq)
  enforceAccountRateLimit(`qq-bot-bind:${normalizedQq}`, 10, 60 * 60 * 1000, now)
  const database = getAccountDatabase()
  const status = database.transaction(() => {
    database.prepare('DELETE FROM account_qq_link_codes WHERE expires_at <= ?').run(now)
    const linkCode = database.prepare(`
      SELECT account_id FROM account_qq_link_codes WHERE code_hash = ? AND expires_at > ?
    `).get(hashLinkCode(code), now) as { account_id: string } | undefined
    if (!linkCode) {
      throw new AccountServiceError('绑定码无效或已过期', 400, 'invalid_link_code')
    }
    database.prepare('DELETE FROM account_qq_links WHERE qq = ? OR account_id = ?')
      .run(normalizedQq, linkCode.account_id)
    database.prepare(`
      INSERT INTO account_qq_links(account_id, qq, linked_at) VALUES (?, ?, ?)
    `).run(linkCode.account_id, normalizedQq, now)
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

function integrationSecret(): string {
  const secret = process.env.QQ_BOT_INTEGRATION_SECRET?.trim() ?? ''
  if (secret.length < 32) {
    throw new AccountServiceError('QQ Bot 联动尚未配置', 503, 'integration_unavailable')
  }
  return secret
}

export function buildQqBotSignature(
  method: string,
  pathname: string,
  rawBody: string,
  timestamp: string,
  nonce: string,
  secret: string,
): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex')
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${pathname}\n${bodyHash}`)
    .digest('hex')
}

function isLoopbackAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized === '::1') return true

  const ipv4 = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized
  const octets = ipv4.split('.')
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/u.test(octet))) return false
  const values = octets.map(Number)
  return values.every((octet) => octet >= 0 && octet <= 255) && values[0] === 127
}

function hasOnlyLoopbackForwardingAddresses(headers: Headers): boolean {
  return ['x-forwarded-for', 'x-real-ip'].every((headerName) => {
    const value = headers.get(headerName)
    return value === null || value.split(',').every(isLoopbackAddress)
  })
}

export function verifyQqBotRequest(
  request: Request,
  rawBody: string,
  now = Date.now(),
): void {
  if (!hasOnlyLoopbackForwardingAddresses(request.headers)) {
    throw new AccountServiceError('联动接口仅允许回环调用', 403, 'integration_loopback_required')
  }
  const timestamp = request.headers.get('x-ai-life-bot-timestamp') ?? ''
  const nonce = request.headers.get('x-ai-life-bot-nonce') ?? ''
  const signature = request.headers.get('x-ai-life-bot-signature') ?? ''
  const timestampMs = Number(timestamp) * 1000
  if (!Number.isInteger(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_MAX_AGE_MS) {
    throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(nonce) || !/^[a-f0-9]{64}$/u.test(signature)) {
    throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
  }
  const expected = buildQqBotSignature(
    request.method,
    new URL(request.url).pathname,
    rawBody,
    timestamp,
    nonce,
    integrationSecret(),
  )
  const expectedBytes = Buffer.from(expected, 'hex')
  const actualBytes = Buffer.from(signature, 'hex')
  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
    throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
  }
  const database = getAccountDatabase()
  const nonceHash = createHash('sha256').update(nonce).digest('hex')
  try {
    database.transaction(() => {
      database.prepare('DELETE FROM qq_bot_request_nonces WHERE seen_at < ?').run(now - NONCE_RETENTION_MS)
      database.prepare('INSERT INTO qq_bot_request_nonces(nonce_hash, seen_at) VALUES (?, ?)')
        .run(nonceHash, now)
    })()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
    }
    throw error
  }
}

export async function readVerifiedQqBotJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    throw new AccountServiceError('联动请求内容过大', 413, 'integration_body_too_large')
  }
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > 4096) {
    throw new AccountServiceError('联动请求内容过大', 413, 'integration_body_too_large')
  }
  verifyQqBotRequest(request, rawBody)
  try {
    return JSON.parse(rawBody)
  } catch {
    throw new AccountServiceError('联动请求格式无效', 400, 'integration_invalid_json')
  }
}

export function readQqBotProjectStatus(): QqBotProjectStatus {
  const changelogPath = path.join(process.cwd(), 'public', `changelog-${changelogIndex.latestChunk}.txt`)
  let latestUpdates: string[] = []
  try {
    const latestEntry = fs.readFileSync(changelogPath, 'utf8')
      .replace(/\r\n?/gu, '\n')
      .split(/^---\s*$/mu)
      .map((section) => section.trim())
      .filter(Boolean)[0] ?? ''
    latestUpdates = latestEntry
      .split(/\r?\n/u)
      .filter((line) => /^\s+-\s+/u.test(line))
      .map((line) => line.replace(/^\s+-\s+/u, '').trim())
      .filter(Boolean)
  } catch {
    latestUpdates = []
  }
  return {
    project: 'AI Life Sim',
    version: ENGINE_VERSION,
    latestUpdates,
    capabilities: {
      optionalAccount: true,
      cloudSync: true,
      verifiedQqBinding: true,
      sharedPoints: true,
    },
  }
}
