#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function parseArgs(argv) {
  let database = process.env.ACCOUNT_DB_PATH || '/var/lib/ai-life-sim/accounts.sqlite'
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--database') database = argv[++index]
    else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('Usage: cleanup-inactive-accounts.mjs [--database <path>]')
      process.exit(0)
    } else throw new Error(`未知参数：${argv[index]}`)
  }
  return path.resolve(database)
}

const databasePath = parseArgs(process.argv.slice(2))
if (!fs.existsSync(databasePath)) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'database-not-found', databasePath }))
  process.exit(0)
}

const now = Date.now()
const database = new Database(databasePath)
database.pragma('foreign_keys = ON')
database.pragma('busy_timeout = 5000')
try {
  const schemaVersion = database.prepare(`
    SELECT value FROM account_meta WHERE key = 'schema_version'
  `).get()?.value
  if (schemaVersion !== '5') {
    throw new Error(`不支持的账号数据库 Schema 版本：${schemaVersion ?? 'missing'}`)
  }
  const cleanup = database.transaction(() => {
    const sessions = database.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now)
    database.prepare('DELETE FROM account_rate_limits WHERE window_started_at < ?').run(now - 24 * 60 * 60 * 1000)
    database.prepare('DELETE FROM account_qq_link_codes WHERE expires_at <= ?').run(now)
    database.prepare('DELETE FROM qq_bot_request_nonces WHERE seen_at < ?').run(now - 10 * 60 * 1000)
    database.prepare('DELETE FROM qq_point_operations WHERE created_at < ?').run(now - 90 * 24 * 60 * 60 * 1000)
    const accounts = database.prepare('DELETE FROM accounts WHERE last_active_at < ?').run(now - RETENTION_MS)
    return { deletedAccounts: accounts.changes, deletedSessions: sessions.changes }
  })
  console.log(JSON.stringify({ ok: true, ...cleanup(), databasePath }))
} finally {
  database.close()
}
