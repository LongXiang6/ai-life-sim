import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-account-cleanup-'))
const databasePath = path.join(tempRoot, 'accounts.sqlite')
process.env.ACCOUNT_DB_PATH = databasePath

const databaseModule = await import('../../../../src/core/account/account-database.ts')

try {
  const now = Date.now()
  const database = databaseModule.getAccountDatabase()
  const insertAccount = database.prepare(`
    INSERT INTO accounts (
      id, username, username_canonical, password_hash, settings_json,
      character_draft_json, created_at, last_active_at
    ) VALUES (?, ?, ?, 'hash', '{}', '{}', ?, ?)
  `)
  insertAccount.run('stale', 'stale', 'stale', now - 40 * 24 * 60 * 60 * 1000, now - 31 * 24 * 60 * 60 * 1000)
  insertAccount.run('active', 'active', 'active', now - 20 * 24 * 60 * 60 * 1000, now)

  database.prepare(`
    INSERT INTO account_sessions(token_hash, account_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('expired-session', 'active', now - 2_000, now - 1_000, now - 2_000)
  database.prepare(`
    INSERT INTO account_sessions(token_hash, account_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('stale-account-session', 'stale', now, now + 60_000, now)
  database.prepare(`
    INSERT INTO account_rate_limits(scope_key, window_started_at, request_count)
    VALUES ('old-rate-limit', ?, 1)
  `).run(now - 2 * 24 * 60 * 60 * 1000)
  databaseModule.closeAccountDatabaseForTests()

  const result = spawnSync(process.execPath, [
    'scripts/ops/cleanup-inactive-accounts.mjs',
    '--database',
    databasePath,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)

  const payload = JSON.parse(result.stdout.trim())
  assert.equal(payload.ok, true)
  assert.equal(payload.deletedAccounts, 1)
  assert.equal(payload.deletedSessions, 1)

  const inspected = new Database(databasePath, { readonly: true })
  try {
    assert.deepEqual(
      inspected.prepare('SELECT id FROM accounts ORDER BY id').all(),
      [{ id: 'active' }],
    )
    assert.equal(inspected.prepare('SELECT COUNT(*) AS count FROM account_sessions').get().count, 0)
    assert.equal(inspected.prepare('SELECT COUNT(*) AS count FROM account_rate_limits').get().count, 0)
  } finally {
    inspected.close()
  }

  console.log('[account-cleanup-ops-smoke] PASS')
} finally {
  databaseModule.closeAccountDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
