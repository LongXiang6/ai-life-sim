#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function parseArgs(argv) {
  const options = {
    database: process.env.ACCOUNT_DB_PATH || '/var/lib/ai-life-sim/accounts.sqlite',
    playerContentDatabase: process.env.PLAYER_CONTENT_DB_PATH || '/var/lib/ai-life-sim/player-content.sqlite',
    portraitAssetRoot: process.env.PORTRAIT_ASSET_ROOT || '/var/lib/ai-life-sim/portrait-assets',
  }
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--database') options.database = argv[++index]
    else if (argv[index] === '--player-content-database') options.playerContentDatabase = argv[++index]
    else if (argv[index] === '--portrait-asset-root') options.portraitAssetRoot = argv[++index]
    else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('Usage: cleanup-inactive-accounts.mjs [--database <path>] [--player-content-database <path>] [--portrait-asset-root <path>]')
      process.exit(0)
    } else throw new Error(`未知参数：${argv[index]}`)
  }
  return {
    database: path.resolve(options.database),
    playerContentDatabase: path.resolve(options.playerContentDatabase),
    portraitAssetRoot: path.resolve(options.portraitAssetRoot),
  }
}

function openDatabase(databasePath) {
  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  return database
}

function assertSchema(database, table, expected) {
  const row = database.prepare(`SELECT value FROM ${table} WHERE key = 'schema_version'`).get()
  if (row?.value !== expected) {
    throw new Error(`不支持的数据库 Schema 版本：${row?.value ?? 'missing'}`)
  }
}

function safeAssetPath(root, storageKey) {
  const resolved = path.resolve(root, storageKey)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('画像资产路径越界')
  }
  return resolved
}

function deletePlayerContent(database, accountIds, assetRoot) {
  if (accountIds.length === 0) return { deletedContentAccounts: 0, deletedAssetFiles: 0 }
  const selectAssets = database.prepare('SELECT storage_key FROM portrait_assets WHERE account_id = ?')
  const deleteStatements = [
    'DELETE FROM cloud_manual_saves WHERE account_id = ?',
    'DELETE FROM leaderboard_best_runs WHERE account_id = ?',
    'DELETE FROM portrait_mail_jobs WHERE account_id = ?',
    'DELETE FROM player_mail_messages WHERE account_id = ?',
    'DELETE FROM portrait_assets WHERE account_id = ?',
  ].map((sql) => database.prepare(sql))
  const assetKeys = []
  database.transaction(() => {
    for (const accountId of accountIds) {
      assetKeys.push(...selectAssets.all(accountId).map((row) => row.storage_key))
      for (const statement of deleteStatements) statement.run(accountId)
    }
  })()
  let deletedAssetFiles = 0
  for (const storageKey of assetKeys) {
    const target = safeAssetPath(assetRoot, storageKey)
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true })
      deletedAssetFiles += 1
    }
  }
  return { deletedContentAccounts: accountIds.length, deletedAssetFiles }
}

function reconcileAssetFiles(database, assetRoot) {
  if (!fs.existsSync(assetRoot)) return 0
  const manifest = new Set(database.prepare('SELECT storage_key FROM portrait_assets').all().map((row) => row.storage_key.replaceAll('\\', '/')))
  let deleted = 0
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(target)
        if (fs.readdirSync(target).length === 0) fs.rmdirSync(target)
        continue
      }
      if (!entry.isFile()) continue
      const storageKey = path.relative(assetRoot, target).split(path.sep).join('/')
      if (!manifest.has(storageKey)) {
        fs.rmSync(safeAssetPath(assetRoot, storageKey), { force: true })
        deleted += 1
      }
    }
  }
  visit(assetRoot)
  return deleted
}

const options = parseArgs(process.argv.slice(2))
if (!fs.existsSync(options.database)) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'database-not-found', databasePath: options.database }))
  process.exit(0)
}

const now = Date.now()
const accountDatabase = openDatabase(options.database)
let playerContentDatabase
try {
  assertSchema(accountDatabase, 'account_meta', '5')
  const staleAccountIds = accountDatabase.prepare(`
    SELECT id FROM accounts WHERE last_active_at < ? ORDER BY id
  `).all(now - RETENTION_MS).map((row) => row.id)
  const accountCleanup = accountDatabase.transaction(() => {
    const sessions = accountDatabase.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(now)
    accountDatabase.prepare('DELETE FROM account_rate_limits WHERE window_started_at < ?').run(now - 24 * 60 * 60 * 1000)
    accountDatabase.prepare('DELETE FROM account_qq_link_codes WHERE expires_at <= ?').run(now)
    accountDatabase.prepare('DELETE FROM qq_bot_request_nonces WHERE seen_at < ?').run(now - 10 * 60 * 1000)
    accountDatabase.prepare('DELETE FROM qq_point_operations WHERE created_at < ?').run(now - 90 * 24 * 60 * 60 * 1000)
    const accounts = accountDatabase.prepare('DELETE FROM accounts WHERE last_active_at < ?').run(now - RETENTION_MS)
    return { deletedAccounts: accounts.changes, deletedSessions: sessions.changes }
  })()

  let contentCleanup = { deletedContentAccounts: 0, deletedAssetFiles: 0, deletedOrphanAssetFiles: 0 }
  if (fs.existsSync(options.playerContentDatabase)) {
    playerContentDatabase = openDatabase(options.playerContentDatabase)
    assertSchema(playerContentDatabase, 'player_content_meta', '4')
    const liveAccountIds = new Set(accountDatabase.prepare('SELECT id FROM accounts').all().map((row) => row.id))
    const contentAccountIds = playerContentDatabase.prepare(`
      SELECT account_id FROM cloud_manual_saves
      UNION SELECT account_id FROM leaderboard_best_runs
      UNION SELECT account_id FROM portrait_mail_jobs
      UNION SELECT account_id FROM player_mail_messages
      UNION SELECT account_id FROM portrait_assets
    `).all().map((row) => row.account_id)
    const orphanIds = [...new Set([...staleAccountIds, ...contentAccountIds])]
      .filter((accountId) => !liveAccountIds.has(accountId))
    contentCleanup = deletePlayerContent(playerContentDatabase, orphanIds, options.portraitAssetRoot)
    contentCleanup.deletedOrphanAssetFiles = reconcileAssetFiles(playerContentDatabase, options.portraitAssetRoot)
  }

  console.log(JSON.stringify({
    ok: true,
    ...accountCleanup,
    ...contentCleanup,
    databasePath: options.database,
    playerContentDatabasePath: options.playerContentDatabase,
  }))
} finally {
  playerContentDatabase?.close()
  accountDatabase.close()
}
