/**
 * Purpose: Own QQ point-account rows, memberships, ledger writes, and idempotent operation records.
 * Owner: core:account
 * Responsibility: Points persistence primitives only; command branching remains in operations.
 */

import { createHash } from 'node:crypto'

import type Database from 'better-sqlite3'

import { AccountServiceError } from '../account-service/error'
import type { QqPointRequest, QqPointResult } from './contracts'

const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

interface PointAccountRow {
  balance: number
  total_earned: number
}

export function shanghaiDate(now: number): string {
  const parts = Object.fromEntries(
    SHANGHAI_DATE_FORMATTER.formatToParts(new Date(now))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function previousDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

function ensurePointAccount(database: Database.Database, qq: string, now: number): void {
  database.prepare(`
    INSERT INTO qq_point_accounts(qq, balance, total_earned, updated_at)
    VALUES (?, 0, 0, ?) ON CONFLICT(qq) DO NOTHING
  `).run(qq, now)
}

export function markGroupMembership(
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

export function pointAccount(database: Database.Database, qq: string): PointAccountRow {
  const row = database.prepare('SELECT balance, total_earned FROM qq_point_accounts WHERE qq = ?')
    .get(qq) as PointAccountRow | undefined
  return row ?? { balance: 0, total_earned: 0 }
}

export function writePointBalance(
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
    SET balance = ?, total_earned = ?, updated_at = ? WHERE qq = ?
  `).run(nextBalance, current.total_earned + Math.max(delta, 0), now, qq)
  database.prepare(`
    INSERT INTO qq_point_ledger(
      qq, delta, balance_after, reason, reference_id, counterparty_qq, group_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(qq, delta, nextBalance, reason, referenceId, counterpartyQq ?? null, groupKey, now)
  return nextBalance
}

export function withIdempotentResult<T extends QqPointResult>(
  database: Database.Database,
  key: string,
  operation: QqPointRequest['operation'],
  requestHash: string,
  now: number,
  run: () => T,
): T {
  const previous = database.prepare(`
    SELECT operation, request_hash, result_json
    FROM qq_point_operations WHERE idempotency_key = ?
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

export function pointRequestHash(
  input: Extract<QqPointRequest, { operation: 'transfer' | 'adjust' }>,
): string {
  const canonical = input.operation === 'transfer'
    ? [input.operation, input.qq, input.targetQq, input.groupKey, input.amount]
    : [input.operation, input.qq, input.groupKey, input.delta, input.reason]
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
