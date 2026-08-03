/**
 * Purpose: Enforce persisted rate limits for account-owned server operations.
 * Owner: core:account
 * Responsibility: Update and validate one rate-limit bucket per call only.
 */

import { getAccountDatabase } from '../account-database'
import { AccountServiceError } from './error'

export function enforceAccountRateLimit(
  scopeKey: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): void {
  const database = getAccountDatabase()
  database.transaction(() => {
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
    database.prepare(
      'UPDATE account_rate_limits SET request_count = request_count + 1 WHERE scope_key = ?',
    ).run(scopeKey)
  })()
}
