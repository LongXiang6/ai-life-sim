import 'server-only'

import { createHash } from 'node:crypto'

import type Database from 'better-sqlite3'
import { z } from 'zod'

import { getAccountDatabase } from './account-database'
import { AccountServiceError, enforceAccountRateLimit } from './account-service'
import { QqBotQqSchema } from './qq-bot-integration'

const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const POINT_OPERATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const POINT_CHECKIN_REWARD = 1

const GroupKeySchema = z.string().regex(/^[1-9][0-9]{4,19}$/u, 'QQ群号格式无效')
const IdempotencyKeySchema = z.string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/u, '幂等键格式无效')

export const QqPointRequestSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('checkin'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
  }).strict(),
  z.object({
    operation: z.literal('balance'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
  }).strict(),
  z.object({
    operation: z.literal('leaderboard'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
    limit: z.number().int().min(1).max(20).default(10),
  }).strict(),
  z.object({
    operation: z.literal('transfer'),
    qq: QqBotQqSchema,
    targetQq: QqBotQqSchema,
    groupKey: GroupKeySchema,
    amount: z.number().int().min(1).max(1_000_000),
    idempotencyKey: IdempotencyKeySchema,
  }).strict(),
  z.object({
    operation: z.literal('adjust'),
    qq: QqBotQqSchema,
    groupKey: GroupKeySchema,
    delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
    reason: z.string().trim().min(1).max(200),
    idempotencyKey: IdempotencyKeySchema,
  }).strict(),
])

export type QqPointRequest = z.infer<typeof QqPointRequestSchema>

export interface QqPointCheckinResult {
  operation: 'checkin'
  repeated: boolean
  localDate: string
  streak: number
  pointsAwarded: number
  balance: number
}

export interface QqPointBalanceResult {
  operation: 'balance'
  balance: number
  totalEarned: number
}

export interface QqPointLeaderboardResult {
  operation: 'leaderboard'
  items: Array<{ qq: string; balance: number; totalEarned: number }>
}

export interface QqPointTransferResult {
  operation: 'transfer'
  senderBalance: number
  recipientBalance: number
}

export interface QqPointAdjustResult {
  operation: 'adjust'
  balance: number
}

export type QqPointResult =
  | QqPointCheckinResult
  | QqPointBalanceResult
  | QqPointLeaderboardResult
  | QqPointTransferResult
  | QqPointAdjustResult

interface PointAccountRow {
  balance: number
  total_earned: number
}

function shanghaiDate(now: number): string {
  const parts = Object.fromEntries(
    SHANGHAI_DATE_FORMATTER.formatToParts(new Date(now))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function previousDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

function ensurePointAccount(database: Database.Database, qq: string, now: number): void {
  database.prepare(`
    INSERT INTO qq_point_accounts(qq, balance, total_earned, updated_at)
    VALUES (?, 0, 0, ?)
    ON CONFLICT(qq) DO NOTHING
  `).run(qq, now)
}

function markGroupMembership(
  database: Database.Database,
  groupKey: string,
  qq: string,
  now: number,
): void {
  ensurePointAccount(database, qq, now)
  database.prepare(`
    INSERT INTO qq_point_group_memberships(group_key, qq, last_seen_at)
    VALUES (?, ?, ?)
    ON CONFLICT(group_key, qq) DO UPDATE SET last_seen_at = excluded.last_seen_at
  `).run(groupKey, qq, now)
}

function pointAccount(database: Database.Database, qq: string): PointAccountRow {
  const row = database.prepare(`
    SELECT balance, total_earned FROM qq_point_accounts WHERE qq = ?
  `).get(qq) as PointAccountRow | undefined
  return row ?? { balance: 0, total_earned: 0 }
}

function writePointBalance(
  database: Database.Database,
  qq: string,
  delta: number,
  reason: string,
  referenceId: string,
  now: number,
  groupKey: string,
  counterpartyQq?: string,
): number {
  ensurePointAccount(database, qq, now)
  const current = pointAccount(database, qq)
  const nextBalance = current.balance + delta
  if (nextBalance < 0) {
    throw new AccountServiceError(`积分不足，当前只有 ${current.balance} 积分`, 409, 'insufficient_points')
  }
  database.prepare(`
    UPDATE qq_point_accounts
    SET balance = ?, total_earned = ?, updated_at = ?
    WHERE qq = ?
  `).run(nextBalance, current.total_earned + Math.max(delta, 0), now, qq)
  database.prepare(`
    INSERT INTO qq_point_ledger(
      qq, delta, balance_after, reason, reference_id, counterparty_qq, group_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(qq, delta, nextBalance, reason, referenceId, counterpartyQq ?? null, groupKey, now)
  return nextBalance
}

function withIdempotentResult<T extends QqPointResult>(
  database: Database.Database,
  key: string,
  operation: QqPointRequest['operation'],
  requestHash: string,
  now: number,
  run: () => T,
): T {
  const previous = database.prepare(`
    SELECT operation, request_hash, result_json
    FROM qq_point_operations
    WHERE idempotency_key = ?
  `).get(key) as { operation: string; request_hash: string; result_json: string } | undefined
  if (previous) {
    if (previous.operation !== operation || previous.request_hash !== requestHash) {
      throw new AccountServiceError('幂等键已用于其他请求', 409, 'idempotency_conflict')
    }
    return JSON.parse(previous.result_json) as T
  }
  const result = run()
  database.prepare(`
    INSERT INTO qq_point_operations(idempotency_key, operation, request_hash, result_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, operation, requestHash, JSON.stringify(result), now)
  return result
}

function pointRequestHash(input: Extract<QqPointRequest, { operation: 'transfer' | 'adjust' }>): string {
  const canonical = input.operation === 'transfer'
    ? [input.operation, input.qq, input.targetQq, input.groupKey, input.amount]
    : [input.operation, input.qq, input.groupKey, input.delta, input.reason]
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function checkin(
  database: Database.Database,
  input: Extract<QqPointRequest, { operation: 'checkin' }>,
  now: number,
): QqPointCheckinResult {
  const localDate = shanghaiDate(now)
  markGroupMembership(database, input.groupKey, input.qq, now)
  const existing = database.prepare(`
    SELECT streak, points_awarded FROM qq_point_checkins WHERE qq = ? AND local_date = ?
  `).get(input.qq, localDate) as { streak: number; points_awarded: number } | undefined
  if (existing) {
    return {
      operation: 'checkin',
      repeated: true,
      localDate,
      streak: existing.streak,
      pointsAwarded: existing.points_awarded,
      balance: pointAccount(database, input.qq).balance,
    }
  }
  const latest = database.prepare(`
    SELECT local_date, streak FROM qq_point_checkins
    WHERE qq = ? ORDER BY local_date DESC LIMIT 1
  `).get(input.qq) as { local_date: string; streak: number } | undefined
  const streak = latest?.local_date === previousDate(localDate) ? latest.streak + 1 : 1
  database.prepare(`
    INSERT INTO qq_point_checkins(qq, local_date, streak, points_awarded, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.qq, localDate, streak, POINT_CHECKIN_REWARD, now)
  const balance = writePointBalance(
    database,
    input.qq,
    POINT_CHECKIN_REWARD,
    'checkin',
    `checkin:${input.qq}:${localDate}`,
    now,
    input.groupKey,
  )
  return {
    operation: 'checkin',
    repeated: false,
    localDate,
    streak,
    pointsAwarded: POINT_CHECKIN_REWARD,
    balance,
  }
}

export function executeQqPointRequest(input: QqPointRequest, now = Date.now()): QqPointResult {
  enforceAccountRateLimit(`qq-points:${input.operation}:${input.qq}`, 60, 60 * 1000, now)
  const database = getAccountDatabase()
  return database.transaction(() => {
    database.prepare('DELETE FROM qq_point_operations WHERE created_at < ?')
      .run(now - POINT_OPERATION_RETENTION_MS)
    if (input.operation === 'checkin') return checkin(database, input, now)

    markGroupMembership(database, input.groupKey, input.qq, now)
    if (input.operation === 'balance') {
      const account = pointAccount(database, input.qq)
      const result: QqPointBalanceResult = {
        operation: 'balance',
        balance: account.balance,
        totalEarned: account.total_earned,
      }
      return result
    }
    if (input.operation === 'leaderboard') {
      const rows = database.prepare(`
        SELECT accounts.qq, accounts.balance, accounts.total_earned
        FROM qq_point_group_memberships AS memberships
        JOIN qq_point_accounts AS accounts ON accounts.qq = memberships.qq
        WHERE memberships.group_key = ?
        ORDER BY accounts.balance DESC, accounts.total_earned DESC, accounts.qq ASC
        LIMIT ?
      `).all(input.groupKey, input.limit) as Array<{
        qq: string
        balance: number
        total_earned: number
      }>
      const result: QqPointLeaderboardResult = {
        operation: 'leaderboard',
        items: rows.map((row) => ({
          qq: row.qq,
          balance: row.balance,
          totalEarned: row.total_earned,
        })),
      }
      return result
    }
    if (input.operation === 'transfer') {
      if (input.qq === input.targetQq) {
        throw new AccountServiceError('不能给自己赠送积分', 400, 'invalid_point_transfer')
      }
      markGroupMembership(database, input.groupKey, input.targetQq, now)
      return withIdempotentResult(
        database,
        input.idempotencyKey,
        input.operation,
        pointRequestHash(input),
        now,
        () => {
          const senderBalance = writePointBalance(
            database,
            input.qq,
            -input.amount,
            'point-transfer-out',
            `transfer:${input.idempotencyKey}:out`,
            now,
            input.groupKey,
            input.targetQq,
          )
          const recipientBalance = writePointBalance(
            database,
            input.targetQq,
            input.amount,
            'point-transfer-in',
            `transfer:${input.idempotencyKey}:in`,
            now,
            input.groupKey,
            input.qq,
          )
          return { operation: 'transfer', senderBalance, recipientBalance }
        },
      )
    }
    return withIdempotentResult(
      database,
      input.idempotencyKey,
      input.operation,
      pointRequestHash(input),
      now,
      () => ({
        operation: 'adjust',
        balance: writePointBalance(
          database,
          input.qq,
          input.delta,
          input.reason,
          `adjust:${input.idempotencyKey}`,
          now,
          input.groupKey,
        ),
      }),
    )
  })()
}

export function readQqPointBalance(qq: string): number {
  const normalizedQq = QqBotQqSchema.parse(qq)
  return pointAccount(getAccountDatabase(), normalizedQq).balance
}
