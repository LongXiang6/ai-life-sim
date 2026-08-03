/**
 * Purpose: Execute transactional QQ point commands and expose current balance reads.
 * Owner: core:account
 * Responsibility: Command branching and transaction boundaries only; ledger primitives remain separate.
 */

import type Database from 'better-sqlite3'

import { getAccountDatabase } from '../account-database'
import { AccountServiceError } from '../account-service/error'
import { enforceAccountRateLimit } from '../account-service/rate-limit'
import { QqBotQqSchema } from '../qq-bot-integration/contracts'
import type {
  QqPointBalanceResult,
  QqPointCheckinResult,
  QqPointLeaderboardResult,
  QqPointRequest,
  QqPointResult,
} from './contracts'
import {
  markGroupMembership,
  pointAccount,
  pointRequestHash,
  previousDate,
  shanghaiDate,
  withIdempotentResult,
  writePointBalance,
} from './repository'

const POINT_OPERATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const POINT_CHECKIN_REWARD = 1

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
      return {
        operation: 'balance',
        balance: account.balance,
        totalEarned: account.total_earned,
      } satisfies QqPointBalanceResult
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
      return {
        operation: 'leaderboard',
        items: rows.map((row) => ({
          qq: row.qq,
          balance: row.balance,
          totalEarned: row.total_earned,
        })),
      } satisfies QqPointLeaderboardResult
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
        () => ({
          operation: 'transfer',
          senderBalance: writePointBalance(
            database,
            input.qq,
            -input.amount,
            'point-transfer-out',
            `transfer:${input.idempotencyKey}:out`,
            now,
            input.groupKey,
            input.targetQq,
          ),
          recipientBalance: writePointBalance(
            database,
            input.targetQq,
            input.amount,
            'point-transfer-in',
            `transfer:${input.idempotencyKey}:in`,
            now,
            input.groupKey,
            input.qq,
          ),
        }),
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
